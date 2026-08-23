import { PER_DAY_LIMIT, PER_MINUTE_LIMIT } from "./config";

export interface UsageState {
  day: number;
  dayCount: number;
  minute: number;
  minuteCount: number;
}

export interface BudgetDecision {
  allowed: boolean;
  dailyRemaining: number;
  minuteRemaining: number;
  retryAfterSeconds?: number;
}

export interface BudgetReservation {
  decision: BudgetDecision;
  nextState?: UsageState;
}

export function reserveUsage(stored: UsageState | undefined, now: number): BudgetReservation {
  const minute = Math.floor(now / 60_000);
  const day = Math.floor(now / 86_400_000);
  const state: UsageState = {
    day,
    dayCount: stored?.day === day ? stored.dayCount : 0,
    minute,
    minuteCount: stored?.minute === minute ? stored.minuteCount : 0,
  };

  if (state.dayCount >= PER_DAY_LIMIT || state.minuteCount >= PER_MINUTE_LIMIT) {
    return { decision: deniedDecision(state, now) };
  }

  const nextState = {
    ...state,
    dayCount: state.dayCount + 1,
    minuteCount: state.minuteCount + 1,
  };
  return {
    decision: {
      allowed: true,
      dailyRemaining: PER_DAY_LIMIT - nextState.dayCount,
      minuteRemaining: PER_MINUTE_LIMIT - nextState.minuteCount,
    },
    nextState,
  };
}

function deniedDecision(state: UsageState, now: number): BudgetDecision {
  const minuteLimited = state.minuteCount >= PER_MINUTE_LIMIT;
  const dayLimited = state.dayCount >= PER_DAY_LIMIT;
  const nextMinute = (state.minute + 1) * 60_000;
  const nextDay = (state.day + 1) * 86_400_000;
  const retryAt = Math.max(minuteLimited ? nextMinute : now, dayLimited ? nextDay : now);
  return {
    allowed: false,
    dailyRemaining: Math.max(0, PER_DAY_LIMIT - state.dayCount),
    minuteRemaining: Math.max(0, PER_MINUTE_LIMIT - state.minuteCount),
    retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1_000)),
  };
}
