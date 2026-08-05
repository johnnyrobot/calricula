import { describe, expect, it } from "vitest";

import {
  EVAL_COMPLIANCE_SOURCE_PACK,
  EVAL_FIXTURES,
  EVAL_TOP_CODE_CATALOG,
  workerEnforcedVerdict,
} from "../../scripts/ai-eval-fixtures.mjs";
import { EVAL_SAMPLES } from "../../scripts/ai-eval-samples.mjs";

import {
  validateAISessionData,
  validateAITaskOutput,
  type AITaskOutputMap,
} from "../../src/lib/ai/schemas";
import type { AITask } from "../../src/lib/ai/types";

import { createSession, envelope, openRouterSuccess, runAi } from "./helpers";

/**
 * `scripts/ai-evaluate.mjs` decides whether a candidate model is fit to deploy.
 * If its rubric accepted output that `worker/index.ts` rejects, a model would
 * pass qualification and then fail every real request as
 * `UPSTREAM_INVALID_RESPONSE`. This pins the rubric to the Worker instead of
 * leaving the agreement to review.
 *
 * Only the checks tagged `workerEnforced` are compared. The rest are
 * deliberately stricter than the Worker — a prompt-level expectation such as
 * "do not invent labour-market evidence" cannot be enforced by a validator, so
 * comparing the full rubric would fail by construction.
 *
 * On disagreement, fix the rubric. The Worker is the contract.
 */

const TASK_BODIES: Record<string, unknown> = {
  // Arms getExpectedContactHours so the exact-hours validator actually runs.
  "content-outline": { input: { totalContactHours: 54 } },
};

async function workerAccepts(
  task: string,
  content: string,
): Promise<{ accepted: boolean; errorCode?: string }> {
  // A fresh session per call: createSession mints a fresh in-memory quota
  // namespace, so the five-per-day reservation never binds across cases.
  const session = await createSession();
  const { response } = await runAi({
    cookie: session.cookie,
    env: session.env,
    path: `/api/ai/${task}`,
    ...(TASK_BODIES[task] ? { body: TASK_BODIES[task] } : {}),
    upstream: openRouterSuccess(content),
  });
  if (response.status === 200) return { accepted: true };
  const body = await envelope(response);
  return { accepted: false, errorCode: body.error?.code };
}

describe("evaluation rubric / Worker validator parity", () => {
  it.each(EVAL_FIXTURES.map((fixture) => fixture.task))(
    "agrees with the Worker on accepted and rejected %s output",
    async (task) => {
      const fixture = EVAL_FIXTURES.find((entry) => entry.task === task)!;
      const sample = EVAL_SAMPLES[task];

      for (const variant of ["good", "bad"] as const) {
        const content = sample[variant];
        const { accepted } = await workerAccepts(task, content);
        const rubricAccepted = workerEnforcedVerdict(fixture, content);

        expect({ task, variant, accepted }).toEqual({
          task,
          variant,
          accepted: rubricAccepted,
        });
      }
    },
  );

  it.each(EVAL_FIXTURES.map((fixture) => fixture.task))(
    "rejects the %s violation for the reason the rubric names",
    async (task) => {
      const { accepted, errorCode } = await workerAccepts(
        task,
        EVAL_SAMPLES[task].bad,
      );
      expect(accepted).toBe(false);
      expect(errorCode).toBe("UPSTREAM_INVALID_RESPONSE");
    },
  );
});

describe("evaluation catalog / Worker catalog parity", () => {
  const codes = Object.keys(EVAL_TOP_CODE_CATALOG);
  const groups = Array.from(
    { length: Math.ceil(codes.length / 3) },
    (_, index) => codes.slice(index * 3, index * 3 + 3),
  );

  // The Worker keeps its own copy of the TOP catalog and it is module-private,
  // so it is pinned behaviourally: every code and title the rubric believes in
  // must survive the Worker's own title comparison.
  it.each(groups.map((group, index) => [index, group] as const))(
    "accepts eval catalog codes in group %i",
    async (_index, group) => {
      const content = JSON.stringify({
        suggestions: group.map((code) => ({
          code,
          title: EVAL_TOP_CODE_CATALOG[code],
          rationale: "Parity check against the server-owned catalog.",
          confidence: 0.5,
        })),
      });
      const { accepted } = await workerAccepts("top-code", content);
      expect(accepted).toBe(true);
    },
  );

  it("rejects a TOP code the eval catalog does not contain", async () => {
    expect(Object.hasOwn(EVAL_TOP_CODE_CATALOG, "9999.00")).toBe(false);
    const { accepted } = await workerAccepts(
      "top-code",
      JSON.stringify({
        suggestions: [
          {
            code: "9999.00",
            title: "Invented Discipline",
            rationale: "Parity check against the server-owned catalog.",
            confidence: 0.5,
          },
        ],
      }),
    );
    expect(accepted).toBe(false);
  });

  it("accepts every compliance source ID the eval pack publishes", async () => {
    const content = JSON.stringify({
      explanation: "Parity check against the server-owned source pack.",
      recommendations: ["Confirm the hours with the department."],
      citations: Object.keys(EVAL_COMPLIANCE_SOURCE_PACK).map((sourceId) => ({
        sourceId,
        supports: "Parity check against the server-owned source pack.",
      })),
      humanReviewRequired: true,
    });
    const { accepted } = await workerAccepts(
      "compliance-explanation",
      content,
    );
    expect(accepted).toBe(true);
  });

  it("returns the Worker's own source metadata, not the eval copy's", async () => {
    const session = await createSession();
    const { response } = await runAi({
      cookie: session.cookie,
      env: session.env,
      path: "/api/ai/compliance-explanation",
      upstream: openRouterSuccess(
        EVAL_SAMPLES["compliance-explanation"].good,
      ),
    });
    expect(response.status).toBe(200);

    const body = await envelope<{
      citations: Array<{
        sourceId: string;
        sourceTitle: string;
        sourceSection: string;
        excerpt: string;
        url: string;
        checksum: string;
      }>;
    }>(response);
    const [citation] = body.data!.citations;
    const expected = EVAL_COMPLIANCE_SOURCE_PACK[citation.sourceId];
    expect({
      sourceTitle: citation.sourceTitle,
      sourceSection: citation.sourceSection,
      excerpt: citation.excerpt,
      url: citation.url,
      checksum: citation.checksum,
    }).toEqual({
      sourceTitle: expected.sourceTitle,
      sourceSection: expected.sourceSection,
      excerpt: expected.excerpt,
      url: expected.url,
      checksum: expected.checksum,
    });
  });
});

/**
 * The Worker accepting a response is only half the contract. The browser
 * re-validates the same payload with Zod (`validateAITaskOutput`,
 * `validateAISessionData`) before anything reaches the UI, so a field the
 * Worker returns but the browser schema does not allow fails *every* request
 * with `AI_OUTPUT_REJECTED` — or, for the session, prevents any AI feature from
 * starting at all.
 *
 * That is not hypothetical: `AISessionDataSchema` omitted the Worker's
 * `remainingDailyAttempts`, and nothing caught it. The Worker suite asserted
 * the response shape without running the browser validator on it, and the E2E
 * suite forces `AI_ENABLED=false`. This pins both halves together.
 */
describe("Worker response / browser validator parity", () => {
  it("accepts the real session response with the browser validator", async () => {
    const session = await createSession();
    const body = await envelope<unknown>(session.response);
    expect(session.response.status).toBe(200);
    expect(() => validateAISessionData(body.data)).not.toThrow();
  });

  it.each(EVAL_FIXTURES.map((fixture) => fixture.task))(
    "accepts the real %s response with the browser validator",
    async (task) => {
      const session = await createSession();
      const input = TASK_BODIES[task]
        ? (TASK_BODIES[task] as { input: unknown }).input
        : undefined;
      const { response } = await runAi({
        cookie: session.cookie,
        env: session.env,
        path: `/api/ai/${task}`,
        ...(TASK_BODIES[task] ? { body: TASK_BODIES[task] } : {}),
        upstream: openRouterSuccess(EVAL_SAMPLES[task].good),
      });
      expect(response.status).toBe(200);

      const body = await envelope<unknown>(response);
      expect(() =>
        validateAITaskOutput(
          task as AITask,
          body.data as AITaskOutputMap[AITask],
          { input },
        ),
      ).not.toThrow();
    },
  );
});
