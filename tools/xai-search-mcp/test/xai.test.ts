import { describe, expect, it, vi } from "vitest";

import {
  MAX_RESULT_CHARACTERS,
  XAI_MAX_OUTPUT_TOKENS,
  XAI_MODEL,
  XAI_RESPONSES_URL,
} from "../src/config";
import { buildRequestBody, formatToolOutput, searchX } from "../src/xai";

describe("buildRequestBody", () => {
  it("課金と機能の上限をクライアント入力から独立して固定する", () => {
    const body = buildRequestBody({
      query: "xAIについて",
      allowed_x_handles: ["xai"],
      from_date: "2026-08-01",
      to_date: "2026-08-22",
    });

    expect(body).toMatchObject({
      model: XAI_MODEL,
      max_tool_calls: 1,
      max_output_tokens: XAI_MAX_OUTPUT_TOKENS,
      parallel_tool_calls: false,
      reasoning: { effort: "none" },
      store: false,
      tool_choice: "required",
      tools: [
        {
          type: "x_search",
          allowed_x_handles: ["xai"],
          from_date: "2026-08-01",
          to_date: "2026-08-22",
          enable_image_understanding: false,
          enable_video_understanding: false,
        },
      ],
    });
    expect(body.instructions).toContain("公式発表・当事者・一次情報を最優先");
    expect(body.instructions).toContain("独立した複数アカウントで裏付け");
    expect(body.instructions).toContain("人気と正確性を同一視せず");
    expect(body.instructions).toContain("確認できない数値は推測しない");
  });
});

describe("searchX", () => {
  it("公式Responses APIだけをBearer認証で呼び、結果と利用量を抽出する", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "要約 [[1]](https://x.com/xai/status/1)" }],
          },
        ],
        citations: ["https://x.com/xai/status/1", "javascript:alert(1)"],
        usage: { cost_in_usd_ticks: 50_000_000, num_server_side_tools_used: 1 },
      }),
    );

    const result = await searchX("secret-key", { query: "test" }, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(XAI_RESPONSES_URL);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer secret-key");
    expect(result).toEqual({
      citations: ["https://x.com/xai/status/1"],
      costInUsdTicks: 50_000_000,
      text: "要約 [[1]](https://x.com/xai/status/1)",
      toolCallsUsed: 1,
      truncated: false,
    });
  });

  it("巨大な上流出力を切り詰める", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({
          output: [
            { type: "message", content: [{ type: "output_text", text: "x".repeat(25_000) }] },
          ],
        }),
      );

    const result = await searchX("secret-key", { query: "test" }, fetcher);

    expect(result.truncated).toBe(true);
    expect(result.text.startsWith("x".repeat(MAX_RESULT_CHARACTERS))).toBe(true);
    expect(result.text.length).toBeLessThan(20_100);
  });

  it("上流エラー本文やAPIキーを例外へ含めない", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret upstream details", { status: 401 }));

    await expect(searchX("secret-key", { query: "private query" }, fetcher)).rejects.toThrow(
      "xAI API request failed with status 401",
    );
  });
});

describe("formatToolOutput", () => {
  it("引用を含むMCP出力全体を上限内へ切り詰める", () => {
    const result = formatToolOutput("x".repeat(MAX_RESULT_CHARACTERS + 1_000));

    expect(result.length).toBe(MAX_RESULT_CHARACTERS);
    expect(result.endsWith("[出力上限により省略]")).toBe(true);
  });
});
