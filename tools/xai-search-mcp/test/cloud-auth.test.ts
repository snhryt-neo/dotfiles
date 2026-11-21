import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { authenticateCloudClient, cloudUnauthorized } from "../src/cloud-auth";
import { OAUTH_SCOPE } from "../src/config";

const token = "ab".repeat(32);
const request = (authorization?: string) => new Request("https://example.com/cloud/mcp", {
  headers: authorization ? { Authorization: authorization } : {},
});

describe("cloud authentication", () => {
  // Node's test runtime lacks Workers' SubtleCrypto.timingSafeEqual extension.
  beforeAll(() => vi.stubGlobal("crypto", { subtle: {
    timingSafeEqual: (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, i) => value === b[i]),
  } }));
  afterAll(() => vi.unstubAllGlobals());
  it("maps the valid token to the same owner and scope as OAuth", () => {
    expect(authenticateCloudClient(request(`Bearer ${token}`), token, "123")).toEqual({
      githubLogin: "cloud-client", githubUserId: "123", oauthScopes: [OAUTH_SCOPE],
    });
  });

  it.each([undefined, "", "replace-me", "ab".repeat(31)])("fails closed for invalid configuration %s", (configured) => {
    expect(authenticateCloudClient(request(`Bearer ${token}`), configured, "123")).toBeUndefined();
  });

  it.each([undefined, `Basic ${token}`, `Bearer ${"cd".repeat(32)}`, `Bearer ${token}x`, `Bearer ${token.toUpperCase()}`])(
    "rejects missing, wrong, or malformed credentials", (authorization) => {
      expect(authenticateCloudClient(request(authorization), token, "123")).toBeUndefined();
    },
  );

  it("does not accept tokens in the query string or an invalid owner", () => {
    expect(authenticateCloudClient(new Request(`https://example.com/cloud/mcp?token=${token}`), token, "123")).toBeUndefined();
    expect(authenticateCloudClient(request(`Bearer ${token}`), token, "")).toBeUndefined();
  });

  it("revokes the old token immediately when configuration is rotated", () => {
    expect(authenticateCloudClient(request(`Bearer ${token}`), "cd".repeat(32), "123")).toBeUndefined();
  });

  it("returns a non-cacheable generic challenge without secrets", async () => {
    const response = cloudUnauthorized();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("Unauthorized");
  });
});
