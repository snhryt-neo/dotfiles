"""Small stateless MCP client for the cloud token endpoint; Python stdlib only."""

import argparse
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward a credential to a redirect destination.
        return None


class McpClient:
    def __init__(self, url, token):
        self.url = url
        self.token = token
        self.protocol = "2025-03-26"
        self.session = None
        self.sequence = 0
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, params=None, notification=False):
        self.sequence += 1
        message = {"jsonrpc": "2.0", "method": method, "params": params or {}}
        if not notification:
            message["id"] = self.sequence
        headers = {
            "User-Agent": "x-search-cloud-client/1.0",
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": self.protocol,
        }
        if self.session:
            headers["Mcp-Session-Id"] = self.session
        req = urllib.request.Request(self.url, json.dumps(message).encode(), headers)
        with self.opener.open(req, timeout=180) as response:
            if response.headers.get("Mcp-Session-Id"):
                self.session = response.headers["Mcp-Session-Id"]
            if notification:
                return None
            if response.headers.get_content_type() == "text/event-stream":
                data = []
                for raw_line in response:
                    line = raw_line.decode().rstrip("\r\n")
                    if line.startswith("data:"):
                        data.append(line[5:].lstrip(" "))
                    elif not line and data:
                        result = json.loads("\n".join(data))
                        data = []
                        if result.get("id") == message["id"]:
                            break
                else:
                    raise RuntimeError("MCP response missing")
            else:
                result = json.load(response)
        if result.get("id") != message["id"] or "error" in result:
            raise RuntimeError("MCP request rejected")
        return result["result"]

    def initialize(self):
        result = self.request("initialize", {
            "protocolVersion": self.protocol,
            "capabilities": {},
            "clientInfo": {"name": "x-search-cloud-client", "version": "1.0.0"},
        })
        self.protocol = result["protocolVersion"]
        self.request("notifications/initialized", notification=True)


def endpoint():
    declaration = (Path(__file__).resolve().parents[2] / "apm/apm.yml").read_text()
    match = re.search(r"- name: xai-search\s+registry: false\s+transport: http\s+url: (https://\S+)", declaration)
    if not match:
        raise RuntimeError("xai-search URL missing from apm/apm.yml")
    parts = urlsplit(match[1])
    if parts.username or parts.password or parts.query or parts.fragment or parts.path != "/mcp":
        raise RuntimeError("Unexpected xai-search URL")
    return f"https://{parts.netloc}/cloud/mcp"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", action="store_true", help="Use local Wrangler on 127.0.0.1:8787")
    parser.add_argument("command", choices=["check", "search"])
    parser.add_argument("query", nargs="?")
    args = parser.parse_args()
    if args.command == "search" and not args.query:
        parser.error("search requires a query")
    token = os.environ.get("X_SEARCH_CLOUD_TOKEN")
    # Proxy-injected secret placeholders need not look like the actual token.
    if not token:
        print("X_SEARCH_CLOUD_TOKEN is missing; configure it in environment secrets.", file=sys.stderr)
        return 1
    client = McpClient("http://127.0.0.1:8787/cloud/mcp" if args.local else endpoint(), token)
    try:
        client.initialize()
        tools = client.request("tools/list")
        if not any(tool["name"] == "x_search" for tool in tools["tools"]):
            raise RuntimeError("x_search missing")
        if args.command == "check":
            print("Authenticated MCP connection OK; x_search available. No paid search executed.")
            return 0
        result = client.request("tools/call", {"name": "x_search", "arguments": {"query": args.query}})
        for content in result.get("content", []):
            if content.get("type") == "text":
                print(content["text"])
        return int(bool(result.get("isError")))
    except urllib.error.HTTPError as error:
        print(f"MCP HTTP {error.code}; no automatic retry.", file=sys.stderr)
    except (OSError, ValueError, KeyError, RuntimeError):
        # Never print exception bodies, request headers or secret values.
        print("MCP connection failed; no automatic retry.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
