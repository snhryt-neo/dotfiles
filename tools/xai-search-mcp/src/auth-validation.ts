import type { OAuthFlowConsumeFailureStatus } from "./oauth-flow";

const MAX_CLIENT_METADATA_BYTES = 8 * 1024;
const MAX_REDIRECT_URI_LENGTH = 2_048;

interface GitHubTokenResponse {
  access_token?: unknown;
  scope?: unknown;
}

export type AuthRateLimitAction = "authorize-get" | "authorize-post" | "github-callback";

export function authRateLimitKey(request: Request, action: AuthRateLimitAction): string | undefined {
  const clientIp = clientIpRateLimitKey(request);
  return clientIp ? `${action}:${clientIp}` : undefined;
}

export function clientIpRateLimitKey(request: Request): string | undefined {
  const connectingIp = request.headers.get("CF-Connecting-IP")?.trim();
  if (connectingIp) {
    return connectingIp;
  }
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
    ? "local-development"
    : undefined;
}

export function isTrustedConsentSource(request: Request, publicOrigin: string): boolean {
  const requestUrl = new URL(request.url);
  const configuredOrigin = new URL(publicOrigin).origin;
  const localDevelopment =
    requestUrl.protocol === "http:" &&
    (requestUrl.hostname === "localhost" ||
      requestUrl.hostname === "127.0.0.1" ||
      requestUrl.hostname === "[::1]");
  const expectedOrigin = localDevelopment ? requestUrl.origin : configuredOrigin;
  if (requestUrl.origin !== expectedOrigin) {
    return false;
  }

  const origin = request.headers.get("Origin");
  if (origin !== null) {
    return origin === expectedOrigin;
  }

  const referer = request.headers.get("Referer");
  if (referer !== null) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

export function consentCookieMatches(formToken: string, cookieToken?: string): boolean {
  return cookieToken === undefined || constantTimeEqual(formToken, cookieToken);
}

export function consentFlowFailureResponse(status: OAuthFlowConsumeFailureStatus): Response {
  // 固定コードだけを返し、flow ID・proof・保存値・DOの例外詳細は外へ出さない。
  return new Response(`Consent state failure: ${status}`, {
    status: status === "internal" ? 503 : 400,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "Content-Type": "text/plain; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function parseGitHubTokenResponse(body: unknown): string {
  const token = body as GitHubTokenResponse;
  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new Error("GitHub token exchange returned no token");
  }
  if (typeof token.scope !== "string" || token.scope.trim() !== "") {
    throw new Error("GitHub token has unexpected scopes");
  }
  return token.access_token;
}

export function validateDynamicClient(metadata: Record<string, unknown>):
  | { code: string; description: string; status: number }
  | undefined {
  if (new TextEncoder().encode(JSON.stringify(metadata)).byteLength > MAX_CLIENT_METADATA_BYTES) {
    return { code: "invalid_client_metadata", description: "client metadata is too large", status: 400 };
  }
  if (metadata.software_statement !== undefined) {
    return { code: "invalid_client_metadata", description: "software_statement is not accepted", status: 400 };
  }
  if (typeof metadata.client_name === "string" && metadata.client_name.length > 100) {
    return { code: "invalid_client_metadata", description: "client_name is too long", status: 400 };
  }
  if (!Array.isArray(metadata.redirect_uris) || metadata.redirect_uris.length > 10) {
    return { code: "invalid_redirect_uri", description: "redirect_uris is invalid", status: 400 };
  }
  for (const value of metadata.redirect_uris) {
    if (
      typeof value !== "string" ||
      value.length > MAX_REDIRECT_URI_LENGTH ||
      !isSafeRedirectUri(value)
    ) {
      return { code: "invalid_redirect_uri", description: "redirect_uri is not allowed", status: 400 };
    }
  }
  return undefined;
}

function isSafeRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) {
      return false;
    }
    if (url.protocol === "https:") {
      return true;
    }
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}
