import type { SubtleCrypto as WorkersSubtleCrypto } from "@cloudflare/workers-types";

import { OAUTH_SCOPE } from "./config";
import type { AuthProps } from "./env";

// 32 random bytes encoded as lowercase hex. Missing/invalid configuration disables access.
const tokenPattern = /^[a-f0-9]{64}$/;

export function authenticateCloudClient(
  request: Request,
  configuredToken: string | undefined,
  githubUserId: string,
): AuthProps | undefined {
  if (!configuredToken || !tokenPattern.test(configuredToken) || !/^\d+$/.test(githubUserId)) {
    return undefined;
  }
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get("Authorization") ?? "");
  if (!match || !tokenPattern.test(match[1])) return undefined;
  const encoder = new TextEncoder();
  if (
    !(crypto.subtle as WorkersSubtleCrypto).timingSafeEqual(
      encoder.encode(match[1]),
      encoder.encode(configuredToken),
    )
  ) return undefined;
  // Use the owner's identity so OAuth and cloud clients share the same budget.
  return { githubLogin: "cloud-client", githubUserId, oauthScopes: [OAUTH_SCOPE] };
}

export function cloudUnauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Bearer realm="cloud-mcp"', "Cache-Control": "no-store" },
  });
}
