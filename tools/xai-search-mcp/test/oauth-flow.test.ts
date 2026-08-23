import { describe, expect, it, vi } from "vitest";

import {
  advanceConsentFlow,
  consumeOAuthFlow,
  createOAuthFlow,
  isOAuthFlowId,
} from "../src/oauth-flow";

const flowId = "123e4567-e89b-42d3-a456-426614174000";
const consumeSecretHash = "a".repeat(64);
const githubState = "223e4567-e89b-42d3-a456-426614174000";
const browserNonce = "A".repeat(43);
const codeVerifier = "B".repeat(43);
const codeChallenge = "C".repeat(43);

function fakeNamespace(response: Response) {
  const fetch = vi.fn().mockResolvedValue(response);
  const idFromName = vi.fn().mockReturnValue({});
  const get = vi.fn().mockReturnValue({ fetch });
  return {
    fetch,
    get,
    idFromName,
    namespace: { get, idFromName } as unknown as DurableObjectNamespace,
  };
}

describe("createOAuthFlow", () => {
  it("固定objectへproof付きの期限付きvalueを作成する", async () => {
    const fake = fakeNamespace(new Response(null, { status: 201 }));
    const now = Date.now();

    await createOAuthFlow(
      fake.namespace,
      "consent",
      flowId,
      consumeSecretHash,
      { oauthRequest: {} },
      600,
    );

    expect(fake.idFromName).toHaveBeenCalledWith("oauth-flow-store:v1");
    expect(fake.fetch).toHaveBeenCalledOnce();
    const [url, init] = fake.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth-flow.internal/create");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      consumeSecretHash,
      flowId,
      purpose: "consent",
      value: { oauthRequest: {} },
    });
    expect(body.expiresAt).toEqual(expect.any(Number));
    expect(body.expiresAt as number).toBeGreaterThanOrEqual(now + 599_000);
  });

  it("作成競合やstorage failureを成功扱いしない", async () => {
    const fake = fakeNamespace(new Response(null, { status: 409 }));

    await expect(
      createOAuthFlow(fake.namespace, "consent", flowId, consumeSecretHash, {}, 600),
    ).rejects.toThrow("OAuth flow creation failed");
  });
});

describe("isOAuthFlowId", () => {
  it("UUID v4だけをflow IDとして受け付ける", () => {
    expect(isOAuthFlowId(flowId)).toBe(true);
    expect(isOAuthFlowId("not-a-uuid")).toBe(false);
    expect(isOAuthFlowId("123e4567-e89b-12d3-a456-426614174000")).toBe(false);
  });
});

describe("consumeOAuthFlow", () => {
  it("purposeが一致する未期限切れvalueを返す", async () => {
    const value = { codeVerifier: "verifier" };
    const fake = fakeNamespace(
      Response.json({
        consumeSecretHash,
        expiresAt: Date.now() + 60_000,
        flowId,
        purpose: "github",
        value,
      }),
    );

    await expect(
      consumeOAuthFlow(fake.namespace, "github", flowId, consumeSecretHash),
    ).resolves.toEqual({ status: "consumed", value });
    expect(fake.idFromName).toHaveBeenCalledWith("oauth-flow-store:v1");
    expect(fake.fetch).toHaveBeenCalledOnce();
    const [url, init] = fake.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth-flow.internal/consume");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(String(init.body))).toEqual({ consumeSecretHash, flowId, purpose: "github" });
  });

  it("missing・forbidden・invalidを区別する", async () => {
    const consumed = fakeNamespace(new Response(null, { status: 404 }));
    await expect(
      consumeOAuthFlow(consumed.namespace, "consent", flowId, consumeSecretHash),
    ).resolves.toEqual({ status: "missing" });

    const forbidden = fakeNamespace(new Response(null, { status: 403 }));
    await expect(
      consumeOAuthFlow(forbidden.namespace, "consent", flowId, consumeSecretHash),
    ).resolves.toEqual({ status: "forbidden" });

    const invalid = fakeNamespace(new Response(null, { status: 400 }));
    await expect(
      consumeOAuthFlow(invalid.namespace, "consent", flowId, consumeSecretHash),
    ).resolves.toEqual({ status: "invalid" });
  });

  it("DO障害と不正な成功responseをinternalとして区別する", async () => {
    const serverError = fakeNamespace(new Response(null, { status: 500 }));
    await expect(
      consumeOAuthFlow(serverError.namespace, "consent", flowId, consumeSecretHash),
    ).resolves.toEqual({ status: "internal" });

    const expired = fakeNamespace(
      Response.json({ consumeSecretHash, expiresAt: Date.now() - 1, flowId, purpose: "consent", value: {} }),
    );
    await expect(
      consumeOAuthFlow(expired.namespace, "consent", flowId, consumeSecretHash),
    ).resolves.toEqual({ status: "internal" });

    const wrongPurpose = fakeNamespace(
      Response.json({
        consumeSecretHash,
        expiresAt: Date.now() + 60_000,
        flowId,
        purpose: "github",
        value: {},
      }),
    );
    await expect(
      consumeOAuthFlow(wrongPurpose.namespace, "consent", flowId, consumeSecretHash),
    ).resolves.toEqual({ status: "internal" });

    const malformed = fakeNamespace(new Response("not-json"));
    await expect(
      consumeOAuthFlow(malformed.namespace, "consent", flowId, consumeSecretHash),
    ).resolves.toEqual({ status: "internal" });

    const nullEnvelope = fakeNamespace(Response.json(null));
    await expect(
      consumeOAuthFlow(nullEnvelope.namespace, "consent", flowId, consumeSecretHash),
    ).resolves.toEqual({ status: "internal" });

    const rejected = fakeNamespace(new Response(null));
    rejected.fetch.mockRejectedValueOnce(new Error("DO unavailable"));
    await expect(
      consumeOAuthFlow(rejected.namespace, "consent", flowId, consumeSecretHash),
    ).resolves.toEqual({ status: "internal" });
  });

  it("不正なflow IDをDOへ送らない", async () => {
    const fake = fakeNamespace(new Response(null, { status: 500 }));

    await expect(
      consumeOAuthFlow(fake.namespace, "consent", "not-a-uuid", consumeSecretHash),
    ).resolves.toEqual({ status: "invalid" });
    expect(fake.idFromName).not.toHaveBeenCalled();
    expect(fake.fetch).not.toHaveBeenCalled();
  });

  it("不正なproof hashをDOへ送らない", async () => {
    const fake = fakeNamespace(new Response(null, { status: 500 }));

    await expect(
      consumeOAuthFlow(fake.namespace, "consent", flowId, "not-a-sha256"),
    ).resolves.toEqual({ status: "invalid" });
    expect(fake.idFromName).not.toHaveBeenCalled();
    expect(fake.fetch).not.toHaveBeenCalled();
  });
});

describe("advanceConsentFlow", () => {
  it("DOが確定したGitHub遷移を返す", async () => {
    const value = { oauthRequest: {} };
    const fake = fakeNamespace(
      Response.json(
        {
          replayed: true,
          transition: {
            browserNonce,
            codeChallenge,
            consumeSecretHash,
            expiresAt: Date.now() + 60_000,
            flowId,
            githubState,
            value,
          },
        },
        { status: 200 },
      ),
    );

    await expect(
      advanceConsentFlow(
        fake.namespace,
        flowId,
        consumeSecretHash,
        { browserNonce, codeVerifier, githubState },
        600,
      ),
    ).resolves.toEqual({
      browserNonce,
      codeChallenge,
      githubState,
      replayed: true,
      status: "advanced",
      value,
    });
    const [url, init] = fake.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth-flow.internal/advance-consent");
    expect(JSON.parse(String(init.body))).toMatchObject({
      browserNonce,
      codeVerifier,
      consumeSecretHash,
      flowId,
      githubState,
      purpose: "consent",
    });
  });

  it.each([
    [404, "missing"],
    [403, "forbidden"],
    [400, "invalid"],
    [409, "internal"],
    [500, "internal"],
  ] as const)("DOのHTTP %iを%sへ分類する", async (httpStatus, status) => {
    const fake = fakeNamespace(new Response(null, { status: httpStatus }));

    await expect(
      advanceConsentFlow(
        fake.namespace,
        flowId,
        consumeSecretHash,
        { browserNonce, codeVerifier, githubState },
        600,
      ),
    ).resolves.toEqual({ status });
  });

  it("不正なproposalをDOへ送らない", async () => {
    const fake = fakeNamespace(new Response(null, { status: 500 }));

    await expect(
      advanceConsentFlow(
        fake.namespace,
        flowId,
        consumeSecretHash,
        { browserNonce: "short", codeVerifier, githubState },
        600,
      ),
    ).resolves.toEqual({ status: "invalid" });
    expect(fake.fetch).not.toHaveBeenCalled();
  });
});
