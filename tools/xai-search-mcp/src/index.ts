import OAuthProvider, { OAuthError } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { env, WorkerEntrypoint } from "cloudflare:workers";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";

import { authHandler } from "./auth";
import { clientIpRateLimitKey, validateDynamicClient } from "./auth-validation";
import { MCP_NAME, MCP_VERSION, OAUTH_SCOPE } from "./config";
import type { AuthProps, Env } from "./env";
import { OAuthFlowStore } from "./oauth-flow-store";
import { BudgetGuard, reserveSearchBudget } from "./rate-limit";
import { xSearchInputSchema } from "./search-input";
import { formatToolOutput, searchX } from "./xai";

export { BudgetGuard, OAuthFlowStore };

class XSearchMcpHandler extends WorkerEntrypoint<Env, AuthProps> {
  async fetch(request: Request): Promise<Response> {
    const handler = createMcpHandler(() => createServer(this.env), {
      route: "/mcp",
      corsOptions: false,
      authContext: { props: { ...this.ctx.props } },
      legacy: "stateless",
      onerror: () => {
        // 検索語や認証情報を例外からログへ流さないため、発生事実だけを残す。
        console.error("MCP request failed");
      },
    });
    return handler(request, this.env, this.ctx);
  }
}

function createServer(workerEnv: Env): McpServer {
  const server = new McpServer(
    { name: MCP_NAME, version: MCP_VERSION },
    {
      instructions:
        "X検索は、ユーザーがX、Twitter、ポスト、ツイートなどを検索対象として明示した場合にのみ使用する。" +
        "通常のWeb検索には使用しない。1回の依頼につき原則1回までとし、再試行にはユーザーの明示的な同意を得る。" +
        "このツールは課金を伴い、サーバー側で分間・日次上限が適用される。",
    },
  );
  server.registerTool(
    "x_search",
    {
      title: "X Search",
      description:
        "X（旧Twitter）のポスト・スレッド・プロフィールを検索して、引用付きで要約する。" +
        "ユーザーがX、Twitter、ポスト、ツイートを検索対象として明示した場合にのみ使う。" +
        "呼び出すたびにxAI課金とサーバーの回数枠消費が発生する。",
      inputSchema: xSearchInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input, context) => {
      const auth = getMcpAuthContext();
      const props = auth?.props as Partial<AuthProps> | undefined;
      const effectiveScopes = context.http?.authInfo?.scopes ?? props?.oauthScopes;
      if (
        !effectiveScopes?.includes(OAUTH_SCOPE) ||
        !props?.githubUserId ||
        props.githubUserId !== workerEnv.ALLOWED_GITHUB_USER_ID ||
        !/^\d+$/.test(workerEnv.ALLOWED_GITHUB_USER_ID)
      ) {
        return toolError("認証されたGitHubアカウントには利用権限がありません。");
      }

      let budget;
      try {
        budget = await reserveSearchBudget(workerEnv.BUDGET_GUARD, props.githubUserId);
      } catch {
        return toolError("課金上限を確認できなかったため、検索を実行しませんでした。");
      }
      if (!budget.allowed) {
        return toolError(
          `検索回数の上限に達しました。約${budget.retryAfterSeconds ?? 1}秒後に再試行してください。`,
        );
      }

      try {
        const result = await searchX(workerEnv.XAI_API_KEY, input);
        const metadata = [
          `残り回数: 分間 ${budget.minuteRemaining} / 日次 ${budget.dailyRemaining}`,
          result.costInUsdTicks === undefined
            ? undefined
            : `今回のxAI請求額: $${(result.costInUsdTicks / 10_000_000_000).toFixed(6)}`,
          result.toolCallsUsed === undefined ? undefined : `xAIツール呼び出し数: ${result.toolCallsUsed}`,
        ].filter((value): value is string => value !== undefined);
        const citations = result.citations.length
          ? `\n\n参照URL:\n${result.citations.map((url) => `- ${url}`).join("\n")}`
          : "";
        return {
          content: [
            {
              type: "text",
              text: formatToolOutput(`${metadata.join(" / ")}\n\n${result.text}${citations}`),
            },
          ],
        };
      } catch {
        return toolError("xAIのX検索に失敗しました。予約済みの回数枠は安全側に倒して消費されます。");
      }
    },
  );
  return server;
}

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

const runtimeEnv = env as unknown as Env;
const publicOrigin = normalizePublicOrigin(runtimeEnv.PUBLIC_ORIGIN);

export default new OAuthProvider<Env>({
  apiRoute: "/mcp",
  apiHandler: XSearchMcpHandler,
  defaultHandler: authHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  clientIdMetadataDocumentEnabled: true,
  clientRegistrationTTL: 7 * 24 * 60 * 60,
  accessTokenTTL: 60 * 60,
  refreshTokenTTL: 30 * 24 * 60 * 60,
  allowPlainPKCE: false,
  scopesSupported: [OAUTH_SCOPE],
  resourceMetadata: {
    resource: `${publicOrigin}/mcp`,
    authorization_servers: [publicOrigin],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Personal xAI X Search MCP",
  },
  clientRegistrationCallback: async ({ clientMetadata, request }) => {
    const validationError = validateDynamicClient(clientMetadata);
    if (validationError) {
      return validationError;
    }
    const rateLimitKey = clientIpRateLimitKey(request);
    if (!rateLimitKey) {
      return {
        code: "temporarily_unavailable",
        description: "Client registration cannot be rate limited",
        status: 503,
      };
    }
    try {
      const outcome = await runtimeEnv.DCR_RATE_LIMITER.limit({ key: `dcr:${rateLimitKey}` });
      if (!outcome.success) {
        return {
          code: "temporarily_unavailable",
          description: "Too many client registration requests",
          status: 429,
        };
      }
    } catch {
      return {
        code: "temporarily_unavailable",
        description: "Client registration rate limit is unavailable",
        status: 503,
      };
    }
    return undefined;
  },
  tokenExchangeCallback: ({ requestedScope, props }) => {
    if (!requestedScope.includes(OAUTH_SCOPE)) {
      throw new OAuthError("invalid_scope", { description: "The x-search scope is required" });
    }
    return {
      accessTokenProps: {
        ...(props as AuthProps),
        oauthScopes: [...requestedScope],
      } satisfies AuthProps,
    };
  },
  onError: ({ code, status }) => {
    // OAuthの秘密やリクエスト本文を含めず、公開エラー分類だけを記録する。
    console.warn("OAuth request rejected", { code, status });
  },
});

function normalizePublicOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_ORIGIN must be an HTTPS origin without a path");
  }
  return url.origin;
}
