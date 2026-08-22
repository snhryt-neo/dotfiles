import { DurableObject } from "cloudflare:workers";

import type { Env } from "./env";
import type {
  ConsentAdvanceEnvelope,
  OAuthFlowEnvelope,
  OAuthFlowPurpose,
} from "./oauth-flow";

const FLOW_STORAGE_PREFIX = "flow:";
const CONSENT_ADVANCE_STORAGE_PREFIX = "consent-advance:";
const MAX_FLOW_LIFETIME_MS = 15 * 60_000;
const MAX_FLOW_BYTES = 16 * 1024;
const FLOW_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BASE64URL_32_BYTES_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface ConsumeRequest {
  consumeSecretHash: string;
  flowId: string;
  purpose: OAuthFlowPurpose;
}

interface AdvanceConsentRequest extends ConsumeRequest {
  browserNonce: string;
  codeVerifier: string;
  expiresAt: number;
  githubState: string;
}

export class OAuthFlowStore extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const path = new URL(request.url).pathname;
    if (path === "/create") {
      return this.create(request);
    }
    if (path === "/consume") {
      return this.consume(request);
    }
    if (path === "/advance-consent") {
      return this.advanceConsent(request);
    }
    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.transaction(async (transaction) => {
      const now = Date.now();
      const flows = await transaction.list<OAuthFlowEnvelope>({ prefix: FLOW_STORAGE_PREFIX });
      const advances = await transaction.list<ConsentAdvanceEnvelope>({
        prefix: CONSENT_ADVANCE_STORAGE_PREFIX,
      });
      let nextExpiry: number | undefined;
      for (const [key, envelope] of flows) {
        if (!isValidEnvelope(envelope, now) || envelope.expiresAt <= now) {
          await transaction.delete(key);
          continue;
        }
        nextExpiry = nextExpiry === undefined ? envelope.expiresAt : Math.min(nextExpiry, envelope.expiresAt);
      }
      for (const [key, transition] of advances) {
        if (!isValidConsentAdvanceEnvelope(transition, now)) {
          await transaction.delete(key);
          continue;
        }
        nextExpiry =
          nextExpiry === undefined ? transition.expiresAt : Math.min(nextExpiry, transition.expiresAt);
      }
      if (nextExpiry === undefined) {
        await transaction.deleteAlarm();
      } else {
        await transaction.setAlarm(nextExpiry);
      }
    });
  }

  private async create(request: Request): Promise<Response> {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_FLOW_BYTES) {
      return new Response("Flow is too large", { status: 413 });
    }

    let envelope: OAuthFlowEnvelope;
    try {
      envelope = JSON.parse(rawBody) as OAuthFlowEnvelope;
    } catch {
      return new Response("Invalid flow", { status: 400 });
    }
    if (!isValidEnvelope(envelope, Date.now())) {
      return new Response("Invalid flow", { status: 400 });
    }

    const created = await this.ctx.storage.transaction(async (transaction) => {
      const key = storageKey(envelope.purpose, envelope.flowId);
      if ((await transaction.get(key)) !== undefined) {
        return false;
      }
      await transaction.put(key, envelope);
      const currentAlarm = await transaction.getAlarm();
      if (currentAlarm === null || envelope.expiresAt < currentAlarm) {
        await transaction.setAlarm(envelope.expiresAt);
      }
      return true;
    });
    return new Response(null, {
      status: created ? 201 : 409,
      headers: { "Cache-Control": "no-store" },
    });
  }

  private async consume(request: Request): Promise<Response> {
    let input: ConsumeRequest;
    try {
      input = (await request.json()) as ConsumeRequest;
    } catch {
      return new Response("Invalid consume request", { status: 400 });
    }
    if (!isValidConsumeRequest(input)) {
      return new Response("Invalid consume request", { status: 400 });
    }

    const result = await this.ctx.storage.transaction(async (transaction) => {
      const key = storageKey(input.purpose, input.flowId);
      const stored = await transaction.get<OAuthFlowEnvelope>(key);
      if (!stored) {
        return { status: "missing" as const };
      }
      const now = Date.now();
      if (!isValidEnvelope(stored, now)) {
        await transaction.delete(key);
        return { status: "missing" as const };
      }
      if (
        stored.purpose !== input.purpose ||
        !constantTimeEqual(stored.consumeSecretHash, input.consumeSecretHash)
      ) {
        return { status: "forbidden" as const };
      }
      await transaction.delete(key);
      return { envelope: stored, status: "consumed" as const };
    });
    if (result.status === "missing") {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (result.status === "forbidden") {
      return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(result.envelope, { headers: { "Cache-Control": "no-store" } });
  }

  private async advanceConsent(request: Request): Promise<Response> {
    let input: AdvanceConsentRequest;
    try {
      input = (await request.json()) as AdvanceConsentRequest;
    } catch {
      return new Response("Invalid consent advance request", { status: 400 });
    }
    const now = Date.now();
    if (!isValidAdvanceConsentRequest(input, now)) {
      return new Response("Invalid consent advance request", { status: 400 });
    }

    const [browserNonceHash, codeChallenge] = await Promise.all([
      sha256(input.browserNonce),
      sha256Base64Url(input.codeVerifier),
    ]);
    const result = await this.ctx.storage.transaction(async (transaction) => {
      const transitionKey = consentAdvanceStorageKey(input.flowId);
      const existing = await transaction.get<ConsentAdvanceEnvelope>(transitionKey);
      if (existing !== undefined) {
        if (!isValidConsentAdvanceEnvelope(existing, Date.now())) {
          await transaction.delete(transitionKey);
          return { status: "missing" as const };
        }
        if (!constantTimeEqual(existing.consumeSecretHash, input.consumeSecretHash)) {
          return { status: "forbidden" as const };
        }
        return { replayed: true, status: "advanced" as const, transition: existing };
      }

      const consentKey = storageKey("consent", input.flowId);
      const stored = await transaction.get<OAuthFlowEnvelope<Record<string, unknown>>>(consentKey);
      if (!stored || !isValidEnvelope(stored, Date.now()) || stored.purpose !== "consent") {
        if (stored !== undefined) {
          await transaction.delete(consentKey);
        }
        return { status: "missing" as const };
      }
      if (!constantTimeEqual(stored.consumeSecretHash, input.consumeSecretHash)) {
        return { status: "forbidden" as const };
      }

      const githubKey = storageKey("github", input.githubState);
      if ((await transaction.get(githubKey)) !== undefined) {
        return { status: "conflict" as const };
      }
      const transition: ConsentAdvanceEnvelope<Record<string, unknown>> = {
        browserNonce: input.browserNonce,
        codeChallenge,
        consumeSecretHash: input.consumeSecretHash,
        expiresAt: input.expiresAt,
        flowId: input.flowId,
        githubState: input.githubState,
        value: stored.value,
      };
      const githubFlow: OAuthFlowEnvelope<Record<string, unknown>> = {
        consumeSecretHash: browserNonceHash,
        expiresAt: input.expiresAt,
        flowId: input.githubState,
        purpose: "github",
        value: { ...stored.value, codeVerifier: input.codeVerifier },
      };
      await transaction.delete(consentKey);
      await transaction.put(transitionKey, transition);
      await transaction.put(githubKey, githubFlow);
      const currentAlarm = await transaction.getAlarm();
      if (currentAlarm === null || input.expiresAt < currentAlarm) {
        await transaction.setAlarm(input.expiresAt);
      }
      return { replayed: false, status: "advanced" as const, transition };
    });

    if (result.status === "missing") {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (result.status === "forbidden") {
      return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (result.status === "conflict") {
      return new Response(null, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(
      { replayed: result.replayed, transition: result.transition },
      { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function isValidEnvelope(value: unknown, now: number): value is OAuthFlowEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    isPurpose(record.purpose) &&
    typeof record.flowId === "string" &&
    FLOW_ID_PATTERN.test(record.flowId) &&
    typeof record.consumeSecretHash === "string" &&
    SHA256_PATTERN.test(record.consumeSecretHash) &&
    typeof record.expiresAt === "number" &&
    Number.isSafeInteger(record.expiresAt) &&
    record.expiresAt > now &&
    record.expiresAt <= now + MAX_FLOW_LIFETIME_MS &&
    typeof record.value === "object" &&
    record.value !== null &&
    !Array.isArray(record.value)
  );
}

function isValidConsumeRequest(value: unknown): value is ConsumeRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    isPurpose(record.purpose) &&
    typeof record.flowId === "string" &&
    FLOW_ID_PATTERN.test(record.flowId) &&
    typeof record.consumeSecretHash === "string" &&
    SHA256_PATTERN.test(record.consumeSecretHash)
  );
}

function isValidAdvanceConsentRequest(value: unknown, now: number): value is AdvanceConsentRequest {
  if (!isValidConsumeRequest(value)) {
    return false;
  }
  const record = value as unknown as Record<string, unknown>;
  return (
    record.purpose === "consent" &&
    typeof record.githubState === "string" &&
    FLOW_ID_PATTERN.test(record.githubState) &&
    typeof record.browserNonce === "string" &&
    BASE64URL_32_BYTES_PATTERN.test(record.browserNonce) &&
    typeof record.codeVerifier === "string" &&
    BASE64URL_32_BYTES_PATTERN.test(record.codeVerifier) &&
    typeof record.expiresAt === "number" &&
    Number.isSafeInteger(record.expiresAt) &&
    record.expiresAt > now &&
    record.expiresAt <= now + MAX_FLOW_LIFETIME_MS
  );
}

function isValidConsentAdvanceEnvelope(value: unknown, now: number): value is ConsentAdvanceEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.flowId === "string" &&
    FLOW_ID_PATTERN.test(record.flowId) &&
    typeof record.consumeSecretHash === "string" &&
    SHA256_PATTERN.test(record.consumeSecretHash) &&
    typeof record.githubState === "string" &&
    FLOW_ID_PATTERN.test(record.githubState) &&
    typeof record.browserNonce === "string" &&
    BASE64URL_32_BYTES_PATTERN.test(record.browserNonce) &&
    typeof record.codeChallenge === "string" &&
    BASE64URL_32_BYTES_PATTERN.test(record.codeChallenge) &&
    typeof record.expiresAt === "number" &&
    Number.isSafeInteger(record.expiresAt) &&
    record.expiresAt > now &&
    record.expiresAt <= now + MAX_FLOW_LIFETIME_MS &&
    typeof record.value === "object" &&
    record.value !== null &&
    !Array.isArray(record.value)
  );
}

function storageKey(purpose: OAuthFlowPurpose, flowId: string): string {
  return `${FLOW_STORAGE_PREFIX}${purpose}:${flowId}`;
}

function consentAdvanceStorageKey(flowId: string): string {
  return `${CONSENT_ADVANCE_STORAGE_PREFIX}${flowId}`;
}

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function isPurpose(value: unknown): value is OAuthFlowPurpose {
  return value === "consent" || value === "github";
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
