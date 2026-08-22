import { describe, expect, it } from "vitest";

import {
  authRateLimitKey,
  clientIpRateLimitKey,
  consentCookieMatches,
  consentFlowFailureResponse,
  isTrustedConsentSource,
  parseGitHubTokenResponse,
  validateDynamicClient,
} from "../src/auth-validation";
import { renderConsent } from "../src/consent-page";

const publicOrigin = "https://xai-search-mcp.example.workers.dev";

describe("validateDynamicClient", () => {
  it.each([
    "http://localhost:12345/callback",
    "http://127.0.0.1:12345/callback",
    "http://[::1]:12345/callback",
    "https://claude.ai/api/mcp/auth_callback",
  ])("安全なリダイレクトURI %s を受け付ける", (redirectUri) => {
    expect(validateDynamicClient({ redirect_uris: [redirectUri] })).toBeUndefined();
  });

  it.each(["http://example.com/callback", "javascript:alert(1)", "file:///tmp/callback"])(
    "安全でないリダイレクトURI %s を拒否する",
    (redirectUri) => {
      expect(validateDynamicClient({ redirect_uris: [redirectUri] })).toMatchObject({
        code: "invalid_redirect_uri",
      });
    },
  );

  it("検証していないsoftware_statementを拒否する", () => {
    expect(
      validateDynamicClient({ redirect_uris: ["https://example.com/callback"], software_statement: "jwt" }),
    ).toMatchObject({ code: "invalid_client_metadata" });
  });

  it("過大なclient metadataを拒否する", () => {
    expect(
      validateDynamicClient({
        redirect_uris: ["https://example.com/callback"],
        client_name: "a",
        extra: "x".repeat(8 * 1024),
      }),
    ).toMatchObject({ code: "invalid_client_metadata" });
  });

  it("過大・フラグメント付き・userinfo付きのredirect URIを拒否する", () => {
    for (const redirectUri of [
      `https://example.com/${"a".repeat(2_048)}`,
      "https://example.com/callback#fragment",
      "https://user:password@example.com/callback",
    ]) {
      expect(validateDynamicClient({ redirect_uris: [redirectUri] })).toMatchObject({
        code: "invalid_redirect_uri",
      });
    }
  });
});

describe("parseGitHubTokenResponse", () => {
  it("scopeなしのtokenだけを受け付ける", () => {
    expect(parseGitHubTokenResponse({ access_token: "token", scope: "" })).toBe("token");
  });

  it.each([
    { access_token: "token", scope: "repo" },
    { access_token: "token" },
    { scope: "" },
  ])("過剰権限または不完全なtoken responseを拒否する", (response) => {
    expect(() => parseGitHubTokenResponse(response)).toThrow();
  });
});

describe("clientIpRateLimitKey", () => {
  it("Cloudflareが検証した接続元IPを使う", () => {
    const request = new Request("https://example.com/oauth/register", {
      headers: { "CF-Connecting-IP": "192.0.2.1" },
    });
    expect(clientIpRateLimitKey(request)).toBe("192.0.2.1");
  });

  it("公開環境で接続元IPがなければfail-closedにする", () => {
    expect(clientIpRateLimitKey(new Request("https://example.com/oauth/register"))).toBeUndefined();
  });

  it("ローカル開発では固定キーへフォールバックする", () => {
    expect(clientIpRateLimitKey(new Request("http://localhost:8787/oauth/register"))).toBe(
      "local-development",
    );
  });
});

describe("authRateLimitKey", () => {
  it("認可の各段階を同じIPでも別の枠へ分離する", () => {
    const request = new Request("https://example.com/authorize", {
      headers: { "CF-Connecting-IP": "192.0.2.1" },
    });

    expect([
      authRateLimitKey(request, "authorize-get"),
      authRateLimitKey(request, "authorize-post"),
      authRateLimitKey(request, "github-callback"),
    ]).toEqual([
      "authorize-get:192.0.2.1",
      "authorize-post:192.0.2.1",
      "github-callback:192.0.2.1",
    ]);
  });
});

describe("consent request validation", () => {
  it("同一originのPOSTを、CSRF cookieがなくても受け付ける", () => {
    const request = new Request(`${publicOrigin}/authorize`, {
      method: "POST",
      headers: { Origin: publicOrigin },
    });
    expect(isTrustedConsentSource(request, publicOrigin)).toBe(true);
    expect(consentCookieMatches("token")).toBe(true);
  });

  it("cookieが届いた場合はform tokenとの一致を要求する", () => {
    expect(consentCookieMatches("token", "other-token")).toBe(false);
    expect(consentCookieMatches("token", "token")).toBe(true);
  });

  it("cross-origin POSTと送信元を証明できないPOSTを拒否する", () => {
    const crossOrigin = new Request(`${publicOrigin}/authorize`, {
      method: "POST",
      headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "same-origin" },
    });
    const noSource = new Request(`${publicOrigin}/authorize`, { method: "POST" });
    expect(isTrustedConsentSource(crossOrigin, publicOrigin)).toBe(false);
    expect(isTrustedConsentSource(noSource, publicOrigin)).toBe(false);
  });

  it("OriginがないWebViewではsame-origin RefererまたはFetch Metadataを使う", () => {
    const referer = new Request(`${publicOrigin}/authorize`, {
      method: "POST",
      headers: { Referer: `${publicOrigin}/authorize?state=redacted` },
    });
    const fetchMetadata = new Request(`${publicOrigin}/authorize`, {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    expect(isTrustedConsentSource(referer, publicOrigin)).toBe(true);
    expect(isTrustedConsentSource(fetchMetadata, publicOrigin)).toBe(true);
  });

  it("ローカル開発ではlocalhost自身を同一originとして扱う", () => {
    const request = new Request("http://localhost:8787/authorize", {
      method: "POST",
      headers: { Origin: "http://localhost:8787" },
    });
    expect(isTrustedConsentSource(request, publicOrigin)).toBe(true);
  });
});

describe("consent state diagnostics", () => {
  it.each([
    ["missing", 400],
    ["forbidden", 400],
    ["invalid", 400],
    ["internal", 503],
  ] as const)("%sをHTTP %iの秘密値なし診断へ変換する", async (diagnostic, status) => {
    const response = consentFlowFailureResponse(diagnostic);

    expect(response.status).toBe(status);
    expect(await response.text()).toBe(`Consent state failure: ${diagnostic}`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("renderConsent", () => {
  it("submitter情報に依存せずdecisionを送れる独立フォームを描画する", () => {
    const html = renderConsent(
      {
        clientId: "client",
        redirectUris: ["http://127.0.0.1/callback"],
        clientName: "client",
        tokenEndpointAuthMethod: "none",
      },
      {
        clientId: "client",
        redirectUri: "http://127.0.0.1/callback",
        responseType: "code",
        scope: ["x-search"],
        state: "state",
      },
      "flow",
      "csrf",
    );

    expect(html.match(/<form method="post" action="\/authorize">/g)).toHaveLength(2);
    expect(html).toContain('name="decision" value="approve"');
    expect(html).toContain('name="decision" value="deny"');
    expect(html).not.toContain('button type="submit" name="decision"');
  });
});
