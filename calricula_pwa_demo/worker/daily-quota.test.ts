import {
  env,
  reset,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

function quotaRequest(
  path: "/reserve" | "/status",
  requestId?: string,
): Request {
  return new Request(`https://quota.internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      limit: 5,
      expiresAtMs: Date.now() + 60_000,
      retryAfterSeconds: 60,
      ...(requestId ? { requestId } : {}),
    }),
  });
}

async function result(response: Response): Promise<{
  allowed: boolean;
  duplicate?: boolean;
  remaining: number;
  retryAfterSeconds: number;
}> {
  expect(response.status).toBe(200);
  return response.json();
}

afterEach(async () => {
  await reset();
});

describe("SQLite-backed DailyAiQuota Durable Object", () => {
  it("serializes six concurrent reservations so exactly five succeed", async () => {
    const id = env.DAILY_AI_QUOTA.idFromName("concurrent-fixture");
    const stub = env.DAILY_AI_QUOTA.get(id);
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        stub.fetch(quotaRequest("/reserve", `request-${index}`)),
      ),
    );
    const reservations: Array<{
      allowed: boolean;
      duplicate?: boolean;
      remaining: number;
      retryAfterSeconds: number;
    }> = await Promise.all(
      responses.map((response: Response) => result(response)),
    );
    expect(
      reservations.filter((reservation) => reservation.allowed),
    ).toHaveLength(5);
    expect(
      reservations.filter((reservation) => !reservation.allowed),
    ).toHaveLength(1);
  });

  it("returns a duplicate receipt without incrementing twice", async () => {
    const id = env.DAILY_AI_QUOTA.idFromName("duplicate-fixture");
    const stub = env.DAILY_AI_QUOTA.get(id);
    expect(await result(await stub.fetch(quotaRequest("/reserve", "same"))))
      .toMatchObject({ allowed: true, duplicate: false, remaining: 4 });
    expect(await result(await stub.fetch(quotaRequest("/reserve", "same"))))
      .toMatchObject({ allowed: true, duplicate: true, remaining: 4 });
  });

  it("deletes the expired day state when its alarm runs", async () => {
    const id = env.DAILY_AI_QUOTA.idFromName("alarm-fixture");
    const stub = env.DAILY_AI_QUOTA.get(id);
    await stub.fetch(quotaRequest("/reserve", "before-alarm"));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await result(await stub.fetch(quotaRequest("/status")))).toMatchObject(
      { allowed: true, remaining: 5 },
    );
  });
});
