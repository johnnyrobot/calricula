"use client";

import type { Program } from "../../lib/domain";

import {
  AISuggestionPanel,
  type AISuggestionRequest,
} from "./AISuggestionPanel";

export interface ProgramAIControlsProps {
  program: Program | object;
  onApply: (value: string) => void | Promise<void>;
  context?: unknown;
  request?: AISuggestionRequest;
  tokenProvider?: () => Promise<string>;
}

export function buildProgramAIInput(
  program: Program | object,
  context?: unknown,
): Record<string, unknown> {
  const value = program as Record<string, unknown>;
  return {
    title: value.title,
    type: value.type,
    catalogDescription: value.catalogDescription,
    totalUnits: value.totalUnits,
    topCode: value.topCode,
    cipCode: value.cipCode,
    programNarrative: value.programNarrative,
    isHighUnitMajor: value.isHighUnitMajor,
    ...(context === undefined ? {} : { context }),
  };
}

export function normalizeProgramNarrative(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (
    typeof record.goalsAndObjectives !== "string" ||
    typeof record.catalogDescription !== "string" ||
    typeof record.requirementsJustification !== "string" ||
    typeof record.laborMarketAnalysis !== "string"
  ) {
    return null;
  }
  return [
    ["Goals and objectives", record.goalsAndObjectives],
    ["Catalog description", record.catalogDescription],
    ["Requirements justification", record.requirementsJustification],
    [
      "Labor market analysis",
      record.laborMarketAnalysis.trim() ||
        "No labor-market evidence was supplied for this draft.",
    ],
  ]
    .map(([heading, content]) => `${heading}\n${content.trim()}`)
    .join("\n\n");
}

export function ProgramAIControls({
  program,
  onApply,
  context,
  request,
  tokenProvider,
}: ProgramAIControlsProps) {
  return (
    <AISuggestionPanel<string>
      description="Draft a program narrative from the fields and course groupings shown here. Verify degree claims, transfer language, labor-market statements, and local approval requirements before saving."
      input={buildProgramAIInput(program, context)}
      normalize={normalizeProgramNarrative}
      onApply={onApply}
      request={request}
      task="program-narrative"
      title="Draft a program narrative"
      tokenProvider={tokenProvider}
    />
  );
}
