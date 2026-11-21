import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(), listTools: vi.fn(), callTool: vi.fn(), close: vi.fn(),
}));
vi.mock("@modelcontextprotocol/client", () => ({
  Client: class {
    connect = mocks.connect;
    listTools = mocks.listTools;
    callTool = mocks.callTool;
    close = mocks.close;
  },
  StreamableHTTPClientTransport: class {},
}));

import { authenticatedFetch, endpoint, main, parseCommand } from "../cloud-client.ts";

describe("cloud client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("X_SEARCH_CLOUD_TOKEN", "test-placeholder");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.connect.mockResolvedValue(undefined);
    mocks.close.mockResolvedValue(undefined);
    mocks.listTools.mockResolvedValue({ tools: [{ name: "x_search" }] });
    mocks.callTool.mockResolvedValue({ content: [{ type: "text", text: "result" }] });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("checks authentication and tools without a paid search", async () => {
    expect(await main(["check"])).toBe(0);
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.listTools).toHaveBeenCalledOnce();
    expect(mocks.callTool).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("performs exactly one search and fails on a tool error", async () => {
    mocks.callTool.mockResolvedValue({ content: [], isError: true });
    expect(await main(["search", "query"])).toBe(1);
    expect(mocks.callTool).toHaveBeenCalledExactlyOnceWith(
      { name: "x_search", arguments: { query: "query" } }, { timeout: 180_000 },
    );
  });

  it("does not retry a failed search or print SDK exception secrets", async () => {
    mocks.callTool.mockRejectedValue(new Error("test-placeholder secret response"));
    expect(await main(["search", "query"])).toBe(1);
    expect(mocks.callTool).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("test-placeholder");
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("does not search when authentication fails or the tool is absent", async () => {
    mocks.connect.mockRejectedValueOnce(new Error("unauthorized"));
    expect(await main(["search", "query"])).toBe(1);
    expect(mocks.callTool).not.toHaveBeenCalled();
    mocks.listTools.mockResolvedValue({ tools: [] });
    expect(await main(["search", "query"])).toBe(1);
    expect(mocks.callTool).not.toHaveBeenCalled();
  });

  it("fails before connecting when the credential is missing", async () => {
    vi.stubEnv("X_SEARCH_CLOUD_TOKEN", "");
    expect(await main(["check"])).toBe(1);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("adds the credential and user agent and rejects redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("ok"));
    await authenticatedFetch("test-placeholder", fetcher)("https://example.com/cloud/mcp", {
      headers: { Accept: "application/json" }, redirect: "follow",
    });
    const init = fetcher.mock.calls[0][1];
    expect(init.redirect).toBe("error");
    expect(init.headers.get("Authorization")).toBe("Bearer test-placeholder");
    expect(init.headers.get("Accept")).toBe("application/json");
  });

  it.each([[], ["check", "extra"], ["search"], ["search", "  "], ["search", "a", "b"], ["login"]].map(args => ({ args })))(
    "rejects invalid commands $args", ({ args }) => expect(() => parseCommand(args)).toThrow(),
  );

  it("uses the declared HTTPS origin and rejects unexpected URLs", () => {
    const declaration = (url: string) => `- name: xai-search\n  registry: false\n  transport: http\n  url: ${url}`;
    expect(endpoint(declaration("https://example.com/mcp")).href).toBe("https://example.com/cloud/mcp");
    for (const url of ["http://example.com/mcp", "https://user:pass@example.com/mcp", "https://example.com/mcp?token=x"]) {
      expect(() => endpoint(declaration(url))).toThrow();
    }
  });
});
