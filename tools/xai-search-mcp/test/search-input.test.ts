import { describe, expect, it } from "vitest";

import { xSearchInputSchema } from "../src/search-input";

describe("xSearchInputSchema", () => {
  it("有効な検索条件を受け付ける", () => {
    const result = xSearchInputSchema.parse({
      query: "  xAIの最新発表  ",
      allowed_x_handles: ["xai"],
      from_date: "2026-08-01",
      to_date: "2026-08-22",
    });

    expect(result.query).toBe("xAIの最新発表");
  });

  it("許可と除外のハンドルを同時指定できない", () => {
    expect(() =>
      xSearchInputSchema.parse({
        query: "test",
        allowed_x_handles: ["xai"],
        excluded_x_handles: ["spam"],
      }),
    ).toThrow();
  });

  it.each(["@xai", "contains-hyphen", "abcdefghijklmnop"])(
    "不正なXハンドル %s を拒否する",
    (handle) => {
      expect(() =>
        xSearchInputSchema.parse({ query: "test", allowed_x_handles: [handle] }),
      ).toThrow();
    },
  );

  it.each(["2026-02-29", "2026-13-01", "2026-8-1"])("不正な日付 %s を拒否する", (date) => {
    expect(() => xSearchInputSchema.parse({ query: "test", from_date: date })).toThrow();
  });

  it("逆転または366日超の期間を拒否する", () => {
    expect(() =>
      xSearchInputSchema.parse({ query: "test", from_date: "2026-08-22", to_date: "2026-08-21" }),
    ).toThrow();
    expect(() =>
      xSearchInputSchema.parse({ query: "test", from_date: "2025-01-01", to_date: "2026-01-02" }),
    ).toThrow();
  });

  it("未知の入力フィールドを拒否する", () => {
    expect(() => xSearchInputSchema.parse({ query: "test", model: "grok-expensive" })).toThrow();
  });
});
