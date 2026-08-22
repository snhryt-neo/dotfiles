import { describe, expect, it } from "vitest";

import { PER_DAY_LIMIT, PER_MINUTE_LIMIT } from "../src/config";
import { reserveUsage, type UsageState } from "../src/budget";

describe("reserveUsage", () => {
  const now = Date.UTC(2026, 7, 22, 12, 34, 30);
  const day = Math.floor(now / 86_400_000);
  const minute = Math.floor(now / 60_000);

  it("許可した呼び出しを分間・日次の両方へ予約する", () => {
    const reservation = reserveUsage(undefined, now);

    expect(reservation.decision).toEqual({
      allowed: true,
      dailyRemaining: PER_DAY_LIMIT - 1,
      minuteRemaining: PER_MINUTE_LIMIT - 1,
    });
    expect(reservation.nextState).toEqual({ day, dayCount: 1, minute, minuteCount: 1 });
  });

  it("分間上限では次の分まで拒否し、状態を更新しない", () => {
    const state: UsageState = { day, dayCount: 10, minute, minuteCount: PER_MINUTE_LIMIT };
    const reservation = reserveUsage(state, now);

    expect(reservation.decision.allowed).toBe(false);
    expect(reservation.decision.retryAfterSeconds).toBe(30);
    expect(reservation.nextState).toBeUndefined();
  });

  it("日次上限では次のUTC日まで拒否する", () => {
    const state: UsageState = { day, dayCount: PER_DAY_LIMIT, minute, minuteCount: 0 };
    const reservation = reserveUsage(state, now);

    expect(reservation.decision.allowed).toBe(false);
    expect(reservation.decision.dailyRemaining).toBe(0);
    expect(reservation.decision.retryAfterSeconds).toBe(41_130);
  });

  it("分間・日次の両方が上限なら次のUTC日まで拒否する", () => {
    const state: UsageState = {
      day,
      dayCount: PER_DAY_LIMIT,
      minute,
      minuteCount: PER_MINUTE_LIMIT,
    };
    const reservation = reserveUsage(state, now);

    expect(reservation.decision.retryAfterSeconds).toBe(41_130);
  });

  it("分またはUTC日が変わると対応するカウンターだけをリセットする", () => {
    const previousMinute: UsageState = {
      day,
      dayCount: 10,
      minute: minute - 1,
      minuteCount: PER_MINUTE_LIMIT,
    };
    expect(reserveUsage(previousMinute, now).nextState).toEqual({
      day,
      dayCount: 11,
      minute,
      minuteCount: 1,
    });

    const previousDay: UsageState = {
      day: day - 1,
      dayCount: PER_DAY_LIMIT,
      minute: minute - 1,
      minuteCount: PER_MINUTE_LIMIT,
    };
    expect(reserveUsage(previousDay, now).nextState).toEqual({
      day,
      dayCount: 1,
      minute,
      minuteCount: 1,
    });
  });
});
