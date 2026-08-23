import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    protected ctx: DurableObjectState;

    constructor(ctx: DurableObjectState) {
      this.ctx = ctx;
    }
  },
}));

import type { Env } from "../src/env";
import type { OAuthFlowEnvelope, OAuthFlowPurpose } from "../src/oauth-flow";
import { OAuthFlowStore } from "../src/oauth-flow-store";

const flowId = "123e4567-e89b-42d3-a456-426614174000";
const anotherFlowId = "223e4567-e89b-42d3-a456-426614174000";
const githubState = "323e4567-e89b-42d3-a456-426614174000";
const alternateGithubState = "423e4567-e89b-42d3-a456-426614174000";
const correctProof = "a".repeat(64);
const wrongProof = "b".repeat(64);
const browserNonce = "A".repeat(43);
const codeVerifier = "B".repeat(43);

class TransactionalStorageFake {
  private alarm: number | null = null;
  private readonly records = new Map<string, unknown>();
  private transactionTail: Promise<void> = Promise.resolve();

  get size(): number {
    return this.records.size;
  }

  async transaction<T>(callback: (transaction: DurableObjectTransaction) => Promise<T>): Promise<T> {
    let release: () => void = () => undefined;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await callback(this as unknown as DurableObjectTransaction);
    } finally {
      release();
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.records.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.records.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.records.delete(key);
  }

  async list<T>(options?: { prefix?: string }): Promise<Map<string, T>> {
    return new Map(
      [...this.records.entries()].filter(([key]) => !options?.prefix || key.startsWith(options.prefix)),
    ) as Map<string, T>;
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    this.alarm = scheduledTime instanceof Date ? scheduledTime.getTime() : scheduledTime;
  }

  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }
}

function createStore(): { storage: TransactionalStorageFake; store: OAuthFlowStore } {
  const storage = new TransactionalStorageFake();
  const ctx = { storage } as unknown as DurableObjectState;
  return { storage, store: new OAuthFlowStore(ctx, {} as Env) };
}

function envelope(id: string, expiresAt = Date.now() + 60_000): OAuthFlowEnvelope<Record<string, string>> {
  return {
    consumeSecretHash: correctProof,
    expiresAt,
    flowId: id,
    purpose: "consent",
    value: { marker: id },
  };
}

function createRequest(value: OAuthFlowEnvelope): Request {
  return new Request("https://oauth-flow.internal/create", {
    method: "POST",
    body: JSON.stringify(value),
  });
}

function consumeRequest(id: string, proof: string, purpose: OAuthFlowPurpose = "consent"): Request {
  return new Request("https://oauth-flow.internal/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consumeSecretHash: proof, flowId: id, purpose }),
  });
}

function advanceRequest(options?: {
  browserNonce?: string;
  codeVerifier?: string;
  expiresAt?: number;
  githubState?: string;
  proof?: string;
}): Request {
  return new Request("https://oauth-flow.internal/advance-consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      browserNonce: options?.browserNonce ?? browserNonce,
      codeVerifier: options?.codeVerifier ?? codeVerifier,
      consumeSecretHash: options?.proof ?? correctProof,
      expiresAt: options?.expiresAt ?? Date.now() + 60_000,
      flowId,
      githubState: options?.githubState ?? githubState,
      purpose: "consent",
    }),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("OAuthFlowStore", () => {
  it("誤ったproofでは残し、正しいproofだけ一度consumeできる", async () => {
    const { store } = createStore();
    expect((await store.fetch(createRequest(envelope(flowId)))).status).toBe(201);

    expect((await store.fetch(consumeRequest(flowId, wrongProof))).status).toBe(403);
    expect((await store.fetch(consumeRequest(flowId, correctProof))).status).toBe(200);
    expect((await store.fetch(consumeRequest(flowId, correctProof))).status).toBe(404);
  });

  it("同時consumeの成功を厳密に一件へ制限する", async () => {
    const { store } = createStore();
    expect((await store.fetch(createRequest(envelope(flowId)))).status).toBe(201);

    const responses = await Promise.all([
      store.fetch(consumeRequest(flowId, correctProof)),
      store.fetch(consumeRequest(flowId, correctProof)),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 404]);
  });

  it("同時approvalを同じGitHub遷移へ統合し、callback stateだけ一度consumeさせる", async () => {
    const { storage, store } = createStore();
    expect((await store.fetch(createRequest(envelope(flowId)))).status).toBe(201);

    const responses = await Promise.all([
      store.fetch(advanceRequest()),
      store.fetch(
        advanceRequest({
          browserNonce: "C".repeat(43),
          codeVerifier: "D".repeat(43),
          githubState: alternateGithubState,
        }),
      ),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
    const bodies = await Promise.all(
      responses.map(
        async (response) =>
          (await response.json()) as {
            replayed: boolean;
            transition: { browserNonce: string; codeChallenge: string; githubState: string };
          },
      ),
    );
    expect(bodies.map(({ replayed }) => replayed).sort()).toEqual([false, true]);
    expect(bodies[0]?.transition).toEqual(bodies[1]?.transition);
    expect(storage.size).toBe(2);

    const transition = bodies[0]?.transition;
    expect(transition).toBeDefined();
    const callbackProof = await sha256(transition?.browserNonce ?? "");
    expect(
      (await store.fetch(consumeRequest(transition?.githubState ?? "", callbackProof, "github"))).status,
    ).toBe(200);
    expect(
      (await store.fetch(consumeRequest(transition?.githubState ?? "", callbackProof, "github"))).status,
    ).toBe(404);
  });

  it("誤proofのapprovalでは遷移せず、正proofの再送を受け付ける", async () => {
    const { store } = createStore();
    expect((await store.fetch(createRequest(envelope(flowId)))).status).toBe(201);

    expect((await store.fetch(advanceRequest({ proof: wrongProof }))).status).toBe(403);
    expect((await store.fetch(advanceRequest())).status).toBe(201);
    expect((await store.fetch(advanceRequest({ proof: wrongProof }))).status).toBe(403);
  });

  it("期限後のapproval replayを拒否する", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T00:00:00Z"));
    const { store } = createStore();
    expect((await store.fetch(createRequest(envelope(flowId)))).status).toBe(201);
    expect((await store.fetch(advanceRequest({ expiresAt: Date.now() + 1_000 }))).status).toBe(201);

    vi.setSystemTime(new Date("2026-08-22T00:00:02Z"));
    expect((await store.fetch(advanceRequest())).status).toBe(404);
  });

  it("alarmで期限切れだけを削除する", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T00:00:00Z"));
    const { storage, store } = createStore();
    expect((await store.fetch(createRequest(envelope(flowId, Date.now() + 1_000)))).status).toBe(201);
    expect((await store.fetch(createRequest(envelope(anotherFlowId, Date.now() + 10_000)))).status).toBe(201);

    vi.setSystemTime(new Date("2026-08-22T00:00:02Z"));
    await store.alarm();

    expect(storage.size).toBe(1);
    expect((await store.fetch(consumeRequest(flowId, correctProof))).status).toBe(404);
    expect((await store.fetch(consumeRequest(anotherFlowId, correctProof))).status).toBe(200);
  });
});

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
