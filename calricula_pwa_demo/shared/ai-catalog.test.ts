import { describe, expect, it } from "vitest";

import {
  AI_COMPLIANCE_SOURCE_IDS,
  AI_COMPLIANCE_SOURCE_PACK,
  AI_TOP_CODES,
  AI_TOP_CODE_CATALOG,
} from "./ai-catalog";

describe("shared TOP catalog", () => {
  it("lists twenty codes in a stable order", () => {
    expect(AI_TOP_CODES).toHaveLength(20);
    expect(AI_TOP_CODES[0]).toEqual({
      code: "1701.00",
      title: "Mathematics, General",
    });
    expect(AI_TOP_CODES[19]).toEqual({
      code: "0701.00",
      title: "Information Technology, General",
    });
  });

  it("derives the code-to-title map from that same list", () => {
    expect(Object.keys(AI_TOP_CODE_CATALOG)).toHaveLength(20);
    expect(AI_TOP_CODE_CATALOG["0835.00"]).toBe(
      "Child Development/Early Care and Education",
    );
    expect(Object.entries(AI_TOP_CODE_CATALOG)).toEqual(
      AI_TOP_CODES.map(({ code, title }) => [code, title]),
    );
  });
});

describe("shared compliance source pack", () => {
  it("keys every source by the id the wire format uses", () => {
    expect(AI_COMPLIANCE_SOURCE_IDS).toEqual([
      "title5-course-standards",
      "title5-credit-hour",
      "pcah-current-edition",
      "ccn-current-guidance",
    ]);
    expect(Object.keys(AI_COMPLIANCE_SOURCE_PACK)).toEqual([
      ...AI_COMPLIANCE_SOURCE_IDS,
    ]);
  });

  it("names its fields as they cross the wire", () => {
    expect(AI_COMPLIANCE_SOURCE_PACK["title5-credit-hour"]).toEqual({
      sourceTitle: "California Code of Regulations, title 5, section 55002.5",
      sourceSection: "§ 55002.5(a), Credit Hour Definition",
      excerpt:
        "One credit hour of community college work (one unit of credit) shall require a minimum of 48 semester hours of total student work.",
      url: expect.stringContaining("govt.westlaw.com"),
      checksum:
        "sha256:f8a5ef427582c25688603a32a1c537282d6337730da147672af76425bb8a6e03",
    });
  });

  it("carries a checksum for every source so a drifted quote is detectable", () => {
    for (const id of AI_COMPLIANCE_SOURCE_IDS) {
      expect(AI_COMPLIANCE_SOURCE_PACK[id].checksum).toMatch(
        /^sha256:[0-9a-f]{64}$/,
      );
    }
  });
});
