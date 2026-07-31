import type {
  DailyQuotaNamespace,
  DailyQuotaStub,
} from "../../worker/index";

type QuotaState = {
  attempts: number;
  reservations: Set<string>;
};

export function createMemoryDailyQuotaNamespace(options: {
  unavailable?: boolean;
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
          const url = new URL(request.url);
          if (url.pathname === "/status") {
            return Response.json({
              allowed: quota.attempts < 5,
              remaining: Math.max(0, 5 - quota.attempts),
              retryAfterSeconds: 60,
            });
          }
          const body = (await request.json()) as {
            requestId: string;
            limit: number;
            retryAfterSeconds: number;
          };
          if (quota.reservations.has(body.requestId)) {
            return Response.json({
              allowed: true,
              duplicate: true,
              remaining: Math.max(0, body.limit - quota.attempts),
              retryAfterSeconds: body.retryAfterSeconds,
            });
          }
          if (quota.attempts >= body.limit) {
            return Response.json({
              allowed: false,
              remaining: 0,
              retryAfterSeconds: body.retryAfterSeconds,
            });
          }
          quota.reservations.add(body.requestId);
          quota.attempts += 1;
          return Response.json({
            allowed: true,
            duplicate: false,
            remaining: body.limit - quota.attempts,
            retryAfterSeconds: body.retryAfterSeconds,
          });
        },
      };
    },
  };
}
