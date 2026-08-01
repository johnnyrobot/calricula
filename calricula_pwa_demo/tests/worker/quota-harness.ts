import type {
  DailyQuotaNamespace,
  DailyQuotaStub,
} from "../../worker/index";
import {
  decideReservation,
  decideStatus,
  parseQuotaRequest,
} from "../../worker/quota-protocol";

type QuotaState = {
  attempts: number;
  reservations: Set<string>;
};

export function createMemoryDailyQuotaNamespace(options: {
  unavailable?: boolean;
  /**
   * The clock the object validates expiry against. Production reads the real
   * one; tests pin it to the same instant their caller uses, so a pinned
   * clock cannot make a well-formed request look expired.
   */
  nowMs?: number;
} = {}): DailyQuotaNamespace & {
  state: Map<string, QuotaState>;
} {
  const state = new Map<string, QuotaState>();
  return {
    state,
    idFromName(name: string): string {
      return name;
    },
    get(id: unknown): DailyQuotaStub {
      const name = String(id);
      return {
        async fetch(request: Request): Promise<Response> {
          if (options.unavailable) {
            throw new Error("quota unavailable");
          }
          const quota =
            state.get(name) ??
            { attempts: 0, reservations: new Set<string>() };
          state.set(name, quota);
          const operation = new URL(request.url).pathname as
            | "/status"
            | "/reserve";
          // Same parser and same decision as the Durable Object; only the
          // storage differs. The double cannot drift from production.
          const quotaRequest = parseQuotaRequest(await request.json(), {
            operation,
            nowMs: options.nowMs ?? Date.now(),
          });
          if (!quotaRequest) {
            return Response.json({ error: "invalid request" }, { status: 400 });
          }
          if (operation === "/status") {
            return Response.json(
              decideStatus({
                attempts: quota.attempts,
                retryAfterSeconds: quotaRequest.retryAfterSeconds,
              }),
            );
          }
          const reservationKey = String(quotaRequest.requestId);
          const decision = decideReservation({
            attempts: quota.attempts,
            alreadyReserved: quota.reservations.has(reservationKey),
            retryAfterSeconds: quotaRequest.retryAfterSeconds,
          });
          if (decision.allowed && !decision.duplicate) {
            quota.reservations.add(reservationKey);
            quota.attempts += 1;
          }
          return Response.json(decision);
        },
      };
    },
  };
}
