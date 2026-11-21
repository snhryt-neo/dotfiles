import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthProps, Env } from "../src/env";

const state = vi.hoisted(() => ({
  props: undefined as AuthProps | undefined,
  tool: undefined as undefined | ((input: unknown, context: object) => Promise<unknown>),
  oauthFetch: vi.fn(async () => new Response("oauth")),
  reserve: vi.fn(),
  search: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { PUBLIC_ORIGIN: "https://example.com" },
  WorkerEntrypoint: class {},
}));
vi.mock("@cloudflare/workers-oauth-provider", () => ({
  default: class { fetch = state.oauthFetch; },
  OAuthError: class extends Error {},
}));
vi.mock("./../src/auth", () => ({ authHandler: {} }));
vi.mock("./../src/oauth-flow-store", () => ({ OAuthFlowStore: class {} }));
vi.mock("./../src/rate-limit", () => ({ BudgetGuard: class {}, reserveSearchBudget: state.reserve }));
vi.mock("./../src/xai", () => ({ searchX: state.search, formatToolOutput: (text: string) => text }));
vi.mock("@modelcontextprotocol/server", () => ({
  McpServer: class {
    registerTool(_name: string, _options: unknown, callback: typeof state.tool) { state.tool = callback; }
  },
}));
vi.mock("agents/mcp/server", () => ({
  getMcpAuthContext: () => ({ props: state.props }),
  createMcpHandler: (factory: () => unknown, options: { authContext: { props: AuthProps } }) => {
    state.props = options.authContext.props;
    factory();
    return async () => new Response("cloud");
  },
}));

import worker from "../src/index";

const token = "ab".repeat(32);
const env = { CLOUD_MCP_TOKEN: token, ALLOWED_GITHUB_USER_ID: "123", BUDGET_GUARD: {} } as Env;
const ctx = {} as ExecutionContext;
const cloudRequest = (value = token) => new Request("https://example.com/cloud/mcp", {
  headers: { Authorization: `Bearer ${value}` },
});

describe("cloud route and shared search budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.props = undefined;
    state.tool = undefined;
    vi.stubGlobal("crypto", { subtle: {
      timingSafeEqual: (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]),
    } });
    state.reserve.mockResolvedValue({ allowed: true, minuteRemaining: 4, dailyRemaining: 29 });
    state.search.mockResolvedValue({ text: "mock search", citations: [] });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("keeps /mcp on OAuth even with the cloud token", async () => {
    expect(await (await worker.fetch(new Request("https://example.com/mcp"), env, ctx)).text()).toBe("oauth");
    expect(state.oauthFetch).toHaveBeenCalledOnce();
    expect(state.tool).toBeUndefined();
  });

  it("rejects invalid tokens before creating a server or reserving quota", async () => {
    expect((await worker.fetch(cloudRequest("cd".repeat(32)), env, ctx)).status).toBe(401);
    expect(state.oauthFetch).not.toHaveBeenCalled();
    expect(state.tool).toBeUndefined();
    expect(state.reserve).not.toHaveBeenCalled();
  });

  it("charges the owner's existing budget before executing a cloud search", async () => {
    expect((await worker.fetch(cloudRequest(), env, ctx)).status).toBe(200);
    expect(state.reserve).not.toHaveBeenCalled(); // Connecting is free.
    await state.tool!({ query: "test" }, {});
    expect(state.reserve).toHaveBeenCalledWith(env.BUDGET_GUARD, "123");
    expect(state.search).toHaveBeenCalledOnce();
  });

  it("does not call xAI when the shared budget is exhausted", async () => {
    state.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    await worker.fetch(cloudRequest(), env, ctx);
    expect(await state.tool!({ query: "test" }, {})).toMatchObject({ isError: true });
    expect(state.search).not.toHaveBeenCalled();
  });

  it("does not call xAI when the budget store fails", async () => {
    state.reserve.mockRejectedValue(new Error("unavailable"));
    await worker.fetch(cloudRequest(), env, ctx);
    expect(await state.tool!({ query: "test" }, {})).toMatchObject({ isError: true });
    expect(state.search).not.toHaveBeenCalled();
  });
});
