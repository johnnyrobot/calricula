import { describe, expect, it } from "vitest";

import { AI_ROUTE_TASKS, OutputValidationError, TASKS } from "./tasks";

const validate = (task: keyof typeof TASKS, content: string, input?: unknown) =>
  TASKS[task].validate(content, input);

const rejects = (task: keyof typeof TASKS, content: string, input?: unknown) =>
  expect(() => validate(task, content, input)).toThrow(OutputValidationError);

describe("task registry", () => {
  it("maps each AI route to its task", () => {
    expect(AI_ROUTE_TASKS).toEqual({
      "/api/ai/chat": "chat",
      "/api/ai/catalog-description": "catalog-description",
      "/api/ai/slos": "slos",
      "/api/ai/content-outline": "content-outline",
      "/api/ai/top-code": "top-code",
      "/api/ai/program-narrative": "program-narrative",
      "/api/ai/compliance-explanation": "compliance-explanation",
    });
  });

  it("asks for structured output on every task except chat", () => {
    expect(TASKS.chat.structured).toBeUndefined();
    for (const task of Object.values(AI_ROUTE_TASKS)) {
      if (task === "chat") continue;
      expect(TASKS[task].structured?.name).toEqual(expect.any(String));
    }
  });
});

describe("chat task", () => {
  it("trims the model's message", () => {
    expect(validate("chat", "  Draft the outline first.  ")).toEqual({
      message: "Draft the outline first.",
    });
  });

  it("rejects an empty or oversized message", () => {
    rejects("chat", "   ");
    rejects("chat", "x".repeat(12_001));
  });
});

describe("catalog-description task", () => {
  it("returns the single described field", () => {
    expect(
      validate(
        "catalog-description",
        JSON.stringify({
          description: "Develops foundational software testing knowledge.",
        }),
      ),
    ).toEqual({
      description: "Develops foundational software testing knowledge.",
    });
  });

  it("rejects unparsable, over-supplied or empty output", () => {
    rejects("catalog-description", "not-json");
    rejects(
      "catalog-description",
      JSON.stringify({ description: "Valid", extra: "not allowed" }),
    );
    rejects("catalog-description", JSON.stringify({ description: "" }));
  });
});

describe("slos task", () => {
  it("returns one to six distinct outcomes", () => {
    expect(
      validate(
        "slos",
        JSON.stringify({
          slos: ["Analyse a test plan.", "Write a unit test."],
        }),
      ),
    ).toEqual({ slos: ["Analyse a test plan.", "Write a unit test."] });
  });

  it("rejects an empty list, more than six, or a repeated outcome", () => {
    rejects("slos", JSON.stringify({ slos: [] }));
    rejects(
      "slos",
      JSON.stringify({ slos: Array.from({ length: 7 }, (_, i) => `SLO ${i}`) }),
    );
    rejects(
      "slos",
      JSON.stringify({ slos: ["Write a unit test.", "Write a unit test."] }),
    );
  });
});

describe("content-outline task", () => {
  const outline = (topics: unknown) => JSON.stringify({ topics });
  const twoTopics = [
    {
      sequence: 1,
      topic: "Foundations",
      contactHours: 27,
      relatedSloNumbers: [1],
    },
    {
      sequence: 2,
      topic: "Applications",
      contactHours: 27,
      relatedSloNumbers: [2],
    },
  ];

  it("accepts a sequenced outline whose hours match the request", () => {
    expect(
      validate("content-outline", outline(twoTopics), {
        totalContactHours: 54,
      }),
    ).toEqual({ topics: twoTopics });
  });

  it("rejects hours that do not add up to the requested total", () => {
    rejects("content-outline", outline(twoTopics), { totalContactHours: 60 });
  });

  it("ignores the hours check when the request did not name a total", () => {
    expect(validate("content-outline", outline(twoTopics), {})).toEqual({
      topics: twoTopics,
    });
  });

  it("rejects sequences that are not consecutive and one-based", () => {
    rejects(
      "content-outline",
      outline([{ ...twoTopics[0], sequence: 2 }]),
      { totalContactHours: 27 },
    );
  });

  it("rejects an empty outline and non-positive contact hours", () => {
    rejects("content-outline", outline([]));
    rejects(
      "content-outline",
      outline([{ ...twoTopics[0], contactHours: 0 }]),
    );
  });
});

describe("top-code task", () => {
  const suggestion = (overrides: Record<string, unknown> = {}) => ({
    code: "0707.00",
    title: "Computer Information Systems",
    rationale: "The course teaches applied information systems practice.",
    confidence: 0.8,
    ...overrides,
  });
  const suggest = (...items: unknown[]) =>
    JSON.stringify({ suggestions: items });

  it("accepts a catalogued code paired with its catalogued title", () => {
    expect(validate("top-code", suggest(suggestion()))).toEqual({
      suggestions: [suggestion()],
    });
  });

  it("rejects a code outside the server-owned catalog", () => {
    rejects(
      "top-code",
      suggest(suggestion({ code: "9999.00", title: "Invented Discipline" })),
    );
  });

  it("rejects a catalogued code carrying a title the catalog does not give it", () => {
    rejects("top-code", suggest(suggestion({ title: "Basket Weaving" })));
  });

  it("rejects a malformed code, an empty list, and a repeated code", () => {
    rejects("top-code", suggest(suggestion({ code: "707" })));
    rejects("top-code", suggest());
    rejects("top-code", suggest(suggestion(), suggestion()));
  });
});

describe("program-narrative task", () => {
  const narrative = {
    goalsAndObjectives: "Prepare students for entry-level analyst roles.",
    catalogDescription: "A sequence covering applied data practice.",
    requirementsJustification: "Each course maps to a stated outcome.",
    laborMarketAnalysis: "",
  };

  it("accepts all four sections and permits an empty labor-market section", () => {
    expect(
      validate("program-narrative", JSON.stringify(narrative)),
    ).toEqual(narrative);
  });

  it("rejects output missing a section", () => {
    const partial: Partial<typeof narrative> = { ...narrative };
    delete partial.laborMarketAnalysis;
    rejects("program-narrative", JSON.stringify(partial));
  });
});

describe("compliance-explanation task", () => {
  const explanation = (citations: unknown) =>
    JSON.stringify({
      explanation: "The unit total needs a local check.",
      recommendations: ["Confirm the hours with the department."],
      citations,
      humanReviewRequired: true,
    });

  it("replaces a cited id with the server's own source metadata", () => {
    const result = validate(
      "compliance-explanation",
      explanation([
        { sourceId: "title5-credit-hour", supports: "The 48-hour minimum." },
      ]),
    ) as { citations: Array<Record<string, string>> };

    expect(result.citations[0]).toEqual({
      sourceId: "title5-credit-hour",
      sourceTitle:
        "California Code of Regulations, title 5, section 55002.5",
      sourceSection: "§ 55002.5(a), Credit Hour Definition",
      excerpt:
        "One credit hour of community college work (one unit of credit) shall require a minimum of 48 semester hours of total student work.",
      url: expect.stringContaining("govt.westlaw.com"),
      checksum:
        "sha256:f8a5ef427582c25688603a32a1c537282d6337730da147672af76425bb8a6e03",
      supports: "The 48-hour minimum.",
    });
  });

  it("rejects a citation to a source outside the server-owned pack", () => {
    rejects(
      "compliance-explanation",
      explanation([
        {
          sourceId: "attacker-provided-source",
          supports: "A fabricated claim.",
        },
      ]),
    );
  });

  it("rejects output that does not require human review", () => {
    rejects(
      "compliance-explanation",
      JSON.stringify({
        explanation: "No review needed.",
        recommendations: ["Ship it."],
        citations: [
          { sourceId: "title5-credit-hour", supports: "The 48-hour minimum." },
        ],
        humanReviewRequired: false,
      }),
    );
  });

  it("rejects an empty citation list", () => {
    rejects("compliance-explanation", explanation([]));
  });
});
