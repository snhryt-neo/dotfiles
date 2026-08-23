import {
  AuthorizationError,
  type AuthRequest,
} from "@cloudflare/workers-oauth-provider";

import {
  authRateLimitKey,
  type AuthRateLimitAction,
  consentCookieMatches,
  consentFlowFailureResponse,
  isTrustedConsentSource,
  parseGitHubTokenResponse,
} from "./auth-validation";
import { OAUTH_SCOPE, OAUTH_STATE_TTL_SECONDS } from "./config";
import { renderConsent } from "./consent-page";
import type { AuthProps, Env } from "./env";
import {
  advanceConsentFlow,
  consumeOAuthFlow,
  createOAuthFlow,
  isOAuthFlowId,
} from "./oauth-flow";

const CSRF_COOKIE = "__Host-xai_mcp_csrf";
const STATE_COOKIE = "__Host-xai_mcp_state";
const GITHUB_API_VERSION = "2022-11-28";
const MAX_CONSENT_BODY_BYTES = 4 * 1024;

interface StoredFlow {
  oauthRequest: AuthRequest;
}

interface StoredGitHubFlow extends StoredFlow {
  codeVerifier: string;
}

interface GitHubUserResponse {
  id?: unknown;
  login?: unknown;
}

export const authHandler: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/authorize" && request.method === "GET") {
        return await showConsent(request, env);
      }
      if (url.pathname === "/authorize" && request.method === "POST") {
        return await approveConsent(request, env);
      }
      if (url.pathname === "/callback" && request.method === "GET") {
        return await handleGitHubCallback(request, env);
      }
      if (url.pathname === "/health" && request.method === "GET") {
        return Response.json({ status: "ok" }, { headers: securityHeaders("application/json") });
      }
      return new Response("Not found", { status: 404 });
    } catch {
      // OAuthの入力値や上流レスポンスをログへ含めないため、詳細は外へ出さない。
      return new Response("Authorization failed", {
        status: 400,
        headers: securityHeaders("text/plain; charset=utf-8"),
      });
    }
  },
};

async function showConsent(request: Request, env: Env): Promise<Response> {
  let oauthRequest: AuthRequest;
  try {
    oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) {
      throw error;
    }
    if (!error.redirectUri) {
      return new Response(error.description, {
        status: 400,
        headers: securityHeaders("text/plain; charset=utf-8"),
      });
    }
    return oauthErrorRedirect({
      redirectUri: error.redirectUri,
      code: error.code,
      description: error.description,
      state: error.state,
      issuer: error.issuer,
    });
  }
  if (oauthRequest.scope.length === 0) {
    // scope省略時も、同意画面と発行grantの権限を単一の公開scopeへ固定する。
    oauthRequest = { ...oauthRequest, scope: [OAUTH_SCOPE] };
  }
  const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
  if (!client) {
    return new Response("Unknown OAuth client", { status: 400 });
  }
  if (!(await authRateLimitAllowed(request, env, "authorize-get"))) {
    return oauthErrorRedirect({
      redirectUri: oauthRequest.redirectUri,
      code: "temporarily_unavailable",
      description: "Too many authorization requests",
      state: oauthRequest.state,
      issuer: oauthRequest.issuer,
    });
  }

  const flowId = crypto.randomUUID();
  const csrfToken = crypto.randomUUID();
  const csrfTokenHash = await sha256(csrfToken);
  await createOAuthFlow(
    env.OAUTH_FLOW_STORE,
    "consent",
    flowId,
    csrfTokenHash,
    { oauthRequest } satisfies StoredFlow,
    OAUTH_STATE_TTL_SECONDS,
  );

  const headers = securityHeaders("text/html; charset=utf-8");
  // Originを省くWebViewでも公開originだけをReferer fallbackとして検証できるようにする。
  headers.set("Referrer-Policy", "origin");
  headers.set("Set-Cookie", cookie(CSRF_COOKIE, csrfToken, OAUTH_STATE_TTL_SECONDS));
  return new Response(renderConsent(client, oauthRequest, flowId, csrfToken), { headers });
}

async function approveConsent(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim() !== "application/x-www-form-urlencoded") {
    return new Response("Unsupported consent content type", { status: 415 });
  }
  if (!isTrustedConsentSource(request, env.PUBLIC_ORIGIN)) {
    return new Response("Invalid consent request", { status: 400 });
  }
  if (!(await authRateLimitAllowed(request, env, "authorize-post"))) {
    return authRateLimitResponse();
  }
  const body = await readLimitedBody(request, MAX_CONSENT_BODY_BYTES);
  if (body === undefined) {
    return new Response("Consent request is too large", { status: 413 });
  }
  const form = new URLSearchParams(body);
  const flowId = stringField(form, "flow_id");
  const formCsrf = stringField(form, "csrf_token");
  const decision = stringField(form, "decision");
  if (
    !flowId ||
    !formCsrf ||
    (decision !== "approve" && decision !== "deny")
  ) {
    return new Response("Invalid consent request", { status: 400 });
  }

  const cookieCsrf = readCookie(request, CSRF_COOKIE);
  if (!consentCookieMatches(formCsrf, cookieCsrf)) {
    return new Response("Invalid consent request", { status: 400 });
  }
  if (decision === "deny") {
    const flowResult = await consumeOAuthFlow<StoredFlow>(
      env.OAUTH_FLOW_STORE,
      "consent",
      flowId,
      await sha256(formCsrf),
    );
    if (flowResult.status !== "consumed") {
      return consentFlowFailureResponse(flowResult.status);
    }
    const stored = flowResult.value;
    if (!stored?.oauthRequest) {
      return consentFlowFailureResponse("internal");
    }
    return oauthErrorRedirect({
      redirectUri: stored.oauthRequest.redirectUri,
      code: "access_denied",
      description: "The resource owner denied the request",
      state: stored.oauthRequest.state,
      issuer: stored.oauthRequest.issuer,
      clearCsrfCookie: true,
    });
  }

  const state = crypto.randomUUID();
  const codeVerifier = randomBase64Url(32);
  const browserNonce = randomBase64Url(32);
  const advanceResult = await advanceConsentFlow<StoredFlow>(
    env.OAUTH_FLOW_STORE,
    flowId,
    await sha256(formCsrf),
    { browserNonce, codeVerifier, githubState: state },
    OAUTH_STATE_TTL_SECONDS,
  );
  if (advanceResult.status !== "advanced") {
    return consentFlowFailureResponse(advanceResult.status);
  }
  const stored = advanceResult.value;
  if (!stored?.oauthRequest) {
    return consentFlowFailureResponse("internal");
  }

  const callbackUrl = new URL("/callback", env.PUBLIC_ORIGIN).href;
  const githubUrl = new URL("https://github.com/login/oauth/authorize");
  githubUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  githubUrl.searchParams.set("redirect_uri", callbackUrl);
  githubUrl.searchParams.set("state", advanceResult.githubState);
  githubUrl.searchParams.set("code_challenge", advanceResult.codeChallenge);
  githubUrl.searchParams.set("code_challenge_method", "S256");
  // 専用OAuth Appに権限を付与せず、本人確認に必要な公開プロフィールだけを参照する。
  githubUrl.searchParams.set("scope", "");

  const headers = new Headers({ Location: githubUrl.href });
  headers.append("Set-Cookie", clearCookie(CSRF_COOKIE));
  // stateがURLや履歴から漏れても、HttpOnly cookieなしではflowを消費できないよう独立秘密を使う。
  headers.append("Set-Cookie", cookie(STATE_COOKIE, advanceResult.browserNonce, OAUTH_STATE_TTL_SECONDS));
  return new Response(null, { status: 302, headers });
}

async function handleGitHubCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const browserNonce = readCookie(request, STATE_COOKIE);
  if (!state || !isOAuthFlowId(state) || !browserNonce) {
    return new Response("Invalid or expired authorization state", { status: 400 });
  }
  if (!(await authRateLimitAllowed(request, env, "github-callback"))) {
    return authRateLimitResponse();
  }

  const flowResult = await consumeOAuthFlow<StoredGitHubFlow>(
    env.OAUTH_FLOW_STORE,
    "github",
    state,
    await sha256(browserNonce),
  );
  if (flowResult.status !== "consumed") {
    return new Response("Invalid or expired authorization state", { status: 400 });
  }
  const stored = flowResult.value;
  if (!stored?.oauthRequest || typeof stored.codeVerifier !== "string") {
    return new Response("Invalid or expired authorization state", { status: 400 });
  }
  if (url.searchParams.get("error") === "access_denied") {
    return callbackError(stored.oauthRequest, "access_denied", "GitHub authorization was denied");
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return callbackError(stored.oauthRequest, "server_error", "GitHub authorization failed");
  }

  let user: { id: string; login: string };
  try {
    const accessToken = await exchangeGitHubCode(code, stored.codeVerifier, env);
    try {
      user = await fetchGitHubUser(accessToken);
    } finally {
      await revokeGitHubToken(accessToken, env);
    }
  } catch {
    return callbackError(stored.oauthRequest, "server_error", "GitHub identity verification failed");
  }

  if (!/^\d+$/.test(env.ALLOWED_GITHUB_USER_ID) || user.id !== env.ALLOWED_GITHUB_USER_ID) {
    return callbackError(stored.oauthRequest, "access_denied", "This GitHub account is not allowed");
  }

  const props: AuthProps = { githubLogin: user.login, githubUserId: user.id };
  const grantedScope = stored.oauthRequest.scope.filter((scope) => scope === OAUTH_SCOPE);
  let redirectTo: string;
  try {
    ({ redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: stored.oauthRequest,
      userId: user.id,
      metadata: { label: user.login },
      scope: grantedScope,
      props,
    }));
  } catch {
    return callbackError(stored.oauthRequest, "server_error", "MCP authorization failed");
  }

  const headers = new Headers({ Location: redirectTo });
  headers.append("Set-Cookie", clearCookie(STATE_COOKIE));
  return new Response(null, { status: 302, headers });
}

function callbackError(request: AuthRequest, code: string, description: string): Response {
  return oauthErrorRedirect({
    redirectUri: request.redirectUri,
    code,
    description,
    state: request.state,
    issuer: request.issuer,
    clearStateCookie: true,
  });
}

async function authRateLimitAllowed(
  request: Request,
  env: Env,
  action: AuthRateLimitAction,
): Promise<boolean> {
  const rateLimitKey = authRateLimitKey(request, action);
  if (!rateLimitKey) {
    return false;
  }
  try {
    return (await env.DCR_RATE_LIMITER.limit({ key: rateLimitKey })).success;
  } catch {
    return false;
  }
}

function authRateLimitResponse(): Response {
  return new Response("Authorization rate limit exceeded", {
    status: 429,
    headers: securityHeaders("text/plain; charset=utf-8"),
  });
}

async function exchangeGitHubCode(code: string, codeVerifier: string, env: Env): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      redirect_uri: new URL("/callback", env.PUBLIC_ORIGIN).href,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error("GitHub token exchange failed");
  }
  return parseGitHubTokenResponse(await response.json());
}

async function fetchGitHubUser(accessToken: string): Promise<{ id: string; login: string }> {
  const response = await fetch("https://api.github.com/user", {
    headers: githubHeaders(accessToken),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error("GitHub user lookup failed");
  }
  const body = (await response.json()) as GitHubUserResponse;
  if (typeof body.id !== "number" || !Number.isSafeInteger(body.id) || typeof body.login !== "string") {
    throw new Error("GitHub user lookup returned invalid data");
  }
  return { id: String(body.id), login: body.login };
}

async function revokeGitHubToken(accessToken: string, env: Env): Promise<void> {
  const credentials = btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`);
  const response = await fetch(
    `https://api.github.com/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/token`,
    {
      method: "DELETE",
      headers: {
        ...githubHeaders(accessToken),
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: accessToken }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.status !== 204 && response.status !== 404) {
    // 失効を確認できないトークンを残したまま、MCP認可を完了させない。
    throw new Error("GitHub OAuth token revocation failed");
  }
}

function githubHeaders(accessToken: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "xai-search-mcp-worker",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
}

function securityHeaders(contentType: string): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://github.com; frame-ancestors 'none'; base-uri 'none'",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(name: string): string {
  return cookie(name, "", 0);
}

function readCookie(request: Request, name: string): string | undefined {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function stringField(form: FormData | URLSearchParams, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

async function readLimitedBody(request: Request, maxBytes: number): Promise<string | undefined> {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null && Number(declaredLength) > maxBytes) {
    return undefined;
  }
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return body + decoder.decode();
    }
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    body += decoder.decode(value, { stream: true });
  }
}

function oauthErrorRedirect(options: {
  redirectUri: string;
  code: string;
  description: string;
  state?: string;
  issuer?: string;
  clearCsrfCookie?: boolean;
  clearStateCookie?: boolean;
}): Response {
  const redirect = new URL(options.redirectUri);
  redirect.searchParams.set("error", options.code);
  redirect.searchParams.set("error_description", options.description);
  if (options.state) {
    redirect.searchParams.set("state", options.state);
  }
  if (options.issuer) {
    redirect.searchParams.set("iss", options.issuer);
  }
  const headers = new Headers({ "Cache-Control": "no-store", Location: redirect.href });
  if (options.clearCsrfCookie) {
    headers.append("Set-Cookie", clearCookie(CSRF_COOKIE));
  }
  if (options.clearStateCookie) {
    headers.append("Set-Cookie", clearCookie(STATE_COOKIE));
  }
  return new Response(null, { status: 302, headers });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
