import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Client, StreamableHTTPClientTransport, type FetchLike } from "@modelcontextprotocol/client";
import { EnvHttpProxyAgent, fetch as proxyFetch } from "undici";

export function endpoint(declaration: string): URL {
  const match = /- name: xai-search\s+registry: false\s+transport: http\s+url: (https:\/\/\S+)/.exec(declaration);
  if (!match) throw new Error("xai-search URL missing");
  const url = new URL(match[1]);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/mcp") {
    throw new Error("Unexpected xai-search URL");
  }
  return new URL("/cloud/mcp", url);
}

export function parseCommand(args: string[]) {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: { local: { type: "boolean" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) return undefined;
  const [command, query] = positionals;
  if ((command !== "check" && command !== "search") || positionals.length > 2 ||
      (command === "check" && query !== undefined) || (command === "search" && !query?.trim())) {
    throw new Error("Invalid command");
  }
  return { command, query, local: values.local ?? false };
}

// Injected fetch keeps proxy routing and TLS verification, and never follows redirects.
export function authenticatedFetch(token: string, fetcher: FetchLike): FetchLike {
  return (url, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("User-Agent", "x-search-cloud-client/1.0");
    return fetcher(url, { ...init, headers, redirect: "error" });
  };
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  let options: ReturnType<typeof parseCommand>;
  try {
    options = parseCommand(args);
  } catch {
    console.error("Usage: node cloud-client.ts [--local] check | search 'query'");
    return 2;
  }
  if (!options) {
    console.log("Usage: node cloud-client.ts [--local] check | search 'query'");
    return 0;
  }
  const token = process.env.X_SEARCH_CLOUD_TOKEN;
  // Proxy-secret placeholders do not necessarily have the actual token's format.
  if (!token) {
    console.error("X_SEARCH_CLOUD_TOKEN is missing; configure it in environment secrets.");
    return 1;
  }
  const client = new Client({ name: "x-search-cloud-client", version: "1.0.0" });
  const dispatcher = new EnvHttpProxyAgent();
  try {
    const url = options.local ? new URL("http://127.0.0.1:8787/cloud/mcp") :
      endpoint(readFileSync(new URL("../../apm/apm.yml", import.meta.url), "utf8"));
    const fetcher: FetchLike = async (input, init) => proxyFetch(input as string, {
      ...init, dispatcher,
    } as Parameters<typeof proxyFetch>[1]) as unknown as Promise<Response>;
    const transport = new StreamableHTTPClientTransport(url, {
      fetch: authenticatedFetch(token, fetcher),
      reconnectionOptions: {
        maxRetries: 0, maxReconnectionDelay: 0, initialReconnectionDelay: 0, reconnectionDelayGrowFactor: 1,
      },
    });
    // No OAuth provider: authentication failures never start a browser flow.
    await client.connect(transport, { timeout: 30_000 });
    const { tools } = await client.listTools();
    if (!tools.some(tool => tool.name === "x_search")) throw new Error("x_search missing");
    if (options.command === "check") {
      console.log("Authenticated MCP connection OK; x_search available. No paid search executed.");
      return 0;
    }
    const result = await client.callTool({ name: "x_search", arguments: { query: options.query } }, { timeout: 180_000 });
    for (const content of result.content) {
      if (content.type === "text") console.log(content.text);
    }
    return result.isError ? 1 : 0;
  } catch {
    // SDK errors may contain response bodies or headers; never print them.
    console.error("MCP connection/request failed; no automatic retry.");
    return 1;
  } finally {
    await client.close().catch(() => {});
    await dispatcher.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
