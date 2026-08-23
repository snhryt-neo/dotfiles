const FLOW_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BASE64URL_32_BYTES_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type OAuthFlowPurpose = "consent" | "github";

export interface OAuthFlowEnvelope<T = unknown> {
  consumeSecretHash: string;
  expiresAt: number;
  flowId: string;
  purpose: OAuthFlowPurpose;
  value: T;
}

export interface ConsentAdvanceEnvelope<T = unknown> {
  browserNonce: string;
  codeChallenge: string;
  consumeSecretHash: string;
  expiresAt: number;
  flowId: string;
  githubState: string;
  value: T;
}

export interface ConsentAdvanceProposal {
  browserNonce: string;
  codeVerifier: string;
  githubState: string;
}

export type OAuthFlowConsumeFailureStatus = "forbidden" | "internal" | "invalid" | "missing";

export type OAuthFlowConsumeResult<T> =
  | { status: "consumed"; value: T }
  | { status: OAuthFlowConsumeFailureStatus };

export type ConsentAdvanceResult<T> =
  | {
      browserNonce: string;
      codeChallenge: string;
      githubState: string;
      replayed: boolean;
      status: "advanced";
      value: T;
    }
  | { status: OAuthFlowConsumeFailureStatus };

export function isOAuthFlowId(value: string): boolean {
  return FLOW_ID_PATTERN.test(value);
}

export async function createOAuthFlow<T>(
  namespace: DurableObjectNamespace,
  purpose: OAuthFlowPurpose,
  flowId: string,
  consumeSecretHash: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  if (!isOAuthFlowId(flowId)) {
    throw new Error("OAuth flow ID is invalid");
  }
  const stub = flowStub(namespace);
  const response = await stub.fetch("https://oauth-flow.internal/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      consumeSecretHash,
      expiresAt: Date.now() + ttlSeconds * 1_000,
      flowId,
      purpose,
      value,
    } satisfies OAuthFlowEnvelope<T>),
  });
  if (!response.ok) {
    throw new Error("OAuth flow creation failed");
  }
}

export async function consumeOAuthFlow<T>(
  namespace: DurableObjectNamespace,
  purpose: OAuthFlowPurpose,
  flowId: string,
  consumeSecretHash: string,
): Promise<OAuthFlowConsumeResult<T>> {
  if (!isOAuthFlowId(flowId) || !SHA256_PATTERN.test(consumeSecretHash)) {
    return { status: "invalid" };
  }
  let response: Response;
  try {
    response = await flowStub(namespace).fetch("https://oauth-flow.internal/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consumeSecretHash, flowId, purpose }),
    });
  } catch {
    return { status: "internal" };
  }
  if (response.status === 404) {
    return { status: "missing" };
  }
  if (response.status === 403) {
    return { status: "forbidden" };
  }
  if (response.status === 400) {
    return { status: "invalid" };
  }
  if (!response.ok) {
    return { status: "internal" };
  }
  let envelope: OAuthFlowEnvelope<T>;
  try {
    envelope = (await response.json()) as OAuthFlowEnvelope<T>;
  } catch {
    return { status: "internal" };
  }
  if (
    typeof envelope !== "object" ||
    envelope === null ||
    envelope.flowId !== flowId ||
    envelope.purpose !== purpose ||
    envelope.consumeSecretHash !== consumeSecretHash ||
    !Number.isSafeInteger(envelope.expiresAt) ||
    envelope.expiresAt <= Date.now()
  ) {
    return { status: "internal" };
  }
  return { status: "consumed", value: envelope.value };
}

export async function advanceConsentFlow<T>(
  namespace: DurableObjectNamespace,
  flowId: string,
  consumeSecretHash: string,
  proposal: ConsentAdvanceProposal,
  ttlSeconds: number,
): Promise<ConsentAdvanceResult<T>> {
  if (
    !isOAuthFlowId(flowId) ||
    !SHA256_PATTERN.test(consumeSecretHash) ||
    !isOAuthFlowId(proposal.githubState) ||
    !BASE64URL_32_BYTES_PATTERN.test(proposal.browserNonce) ||
    !BASE64URL_32_BYTES_PATTERN.test(proposal.codeVerifier)
  ) {
    return { status: "invalid" };
  }

  let response: Response;
  try {
    response = await flowStub(namespace).fetch("https://oauth-flow.internal/advance-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...proposal,
        consumeSecretHash,
        expiresAt: Date.now() + ttlSeconds * 1_000,
        flowId,
        purpose: "consent",
      }),
    });
  } catch {
    return { status: "internal" };
  }
  if (response.status === 404) {
    return { status: "missing" };
  }
  if (response.status === 403) {
    return { status: "forbidden" };
  }
  if (response.status === 400) {
    return { status: "invalid" };
  }
  if (!response.ok) {
    return { status: "internal" };
  }

  let body: { replayed?: unknown; transition?: ConsentAdvanceEnvelope<T> };
  try {
    body = (await response.json()) as { replayed?: unknown; transition?: ConsentAdvanceEnvelope<T> };
  } catch {
    return { status: "internal" };
  }
  const transition = body?.transition;
  if (
    typeof body?.replayed !== "boolean" ||
    !isConsentAdvanceEnvelope(transition, flowId, consumeSecretHash)
  ) {
    return { status: "internal" };
  }
  return {
    browserNonce: transition.browserNonce,
    codeChallenge: transition.codeChallenge,
    githubState: transition.githubState,
    replayed: body.replayed,
    status: "advanced",
    value: transition.value,
  };
}

function isConsentAdvanceEnvelope<T>(
  value: unknown,
  flowId: string,
  consumeSecretHash: string,
): value is ConsentAdvanceEnvelope<T> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.flowId === flowId &&
    record.consumeSecretHash === consumeSecretHash &&
    typeof record.githubState === "string" &&
    FLOW_ID_PATTERN.test(record.githubState) &&
    typeof record.browserNonce === "string" &&
    BASE64URL_32_BYTES_PATTERN.test(record.browserNonce) &&
    typeof record.codeChallenge === "string" &&
    BASE64URL_32_BYTES_PATTERN.test(record.codeChallenge) &&
    typeof record.expiresAt === "number" &&
    Number.isSafeInteger(record.expiresAt) &&
    record.expiresAt > Date.now() &&
    typeof record.value === "object" &&
    record.value !== null &&
    !Array.isArray(record.value)
  );
}

function flowStub(namespace: DurableObjectNamespace): DurableObjectStub {
  return namespace.get(namespace.idFromName("oauth-flow-store:v1"));
}
