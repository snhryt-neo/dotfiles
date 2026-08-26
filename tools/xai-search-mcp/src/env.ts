import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

import type { BudgetGuard } from "./rate-limit";
import type { OAuthFlowStore } from "./oauth-flow-store";

export interface AuthProps {
  githubLogin: string;
  githubUserId: string;
  oauthScopes?: string[];
}

export interface Env {
  ALLOWED_GITHUB_USER_ID: string;
  BUDGET_GUARD: DurableObjectNamespace<BudgetGuard>;
  CLOUDFLARE_AI_GATEWAY_TOKEN: string;
  DCR_RATE_LIMITER: RateLimit;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  OAUTH_KV: KVNamespace;
  OAUTH_FLOW_STORE: DurableObjectNamespace<OAuthFlowStore>;
  OAUTH_PROVIDER: OAuthHelpers;
  PUBLIC_ORIGIN: string;
  XAI_API_KEY: string;
}
