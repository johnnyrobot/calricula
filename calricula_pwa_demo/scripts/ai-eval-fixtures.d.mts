export type EvalTaskName =
  | "chat"
  | "catalog-description"
  | "slos"
  | "content-outline"
  | "top-code"
  | "program-narrative"
  | "compliance-explanation";

export interface EvalCheck {
  readonly id: string;
  /**
   * True when the check mirrors a validator in `worker/index.ts`. Only this
   * subset may be compared against a real `handleRequest` verdict.
   */
  readonly workerEnforced: boolean;
  run(value: unknown, fixture: EvalFixture): boolean;
}

export interface EvalFixture {
  readonly task: EvalTaskName;
  readonly kind: "plain" | "structured";
  readonly maxTokens: number;
  readonly messages: ReadonlyArray<{
    readonly role: "system" | "user";
    readonly content: string;
  }>;
  readonly schema?: Record<string, unknown>;
  readonly checks: readonly EvalCheck[];
}

export interface EvalCheckResult {
  readonly id: string;
  readonly workerEnforced: boolean;
  readonly passed: boolean;
}

export interface EvalScore {
  readonly passed: boolean;
  readonly checks: readonly EvalCheckResult[];
}

export const EVAL_TOP_CODE_CATALOG: Readonly<Record<string, string>>;

export const EVAL_COMPLIANCE_SOURCE_PACK: Readonly<
  Record<
    string,
    Readonly<{
      sourceTitle: string;
      sourceSection: string;
      excerpt: string;
      url: string;
      checksum: string;
    }>
  >
>;

export const ACTION_VERBS: readonly string[];
export const ACTION_VERB_PATTERN: string;

export const EVAL_FIXTURES: readonly EvalFixture[];

export function fixtureForTask(task: string): EvalFixture;
export function scoreFixture(
  fixture: EvalFixture,
  content: string,
): EvalScore;
export function workerEnforcedVerdict(
  fixture: EvalFixture,
  content: string,
): boolean;
