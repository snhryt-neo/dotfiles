import { DurableObject } from "cloudflare:workers";

import {
  reserveUsage,
  type BudgetDecision,
  type UsageState,
} from "./budget";
import type { Env } from "./env";

export class BudgetGuard extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const decision = await this.ctx.storage.transaction(async (transaction) => {
      const now = Date.now();
      const stored = await transaction.get<UsageState>("usage");
      const reservation = reserveUsage(stored, now);
      if (reservation.nextState) {
        await transaction.put("usage", reservation.nextState);
      }
      return reservation.decision;
    });

    return Response.json(decision, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function reserveSearchBudget(
  namespace: DurableObjectNamespace<BudgetGuard>,
  userId: string,
): Promise<BudgetDecision> {
  const stub = namespace.get(namespace.idFromName(userId));
  const response = await stub.fetch("https://budget.internal/reserve", { method: "POST" });
  if (!response.ok) {
    throw new Error("Budget guard request failed");
  }
  return response.json<BudgetDecision>();
}
