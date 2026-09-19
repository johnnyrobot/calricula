export interface EvalSample {
  /** Output both the rubric and `worker/index.ts` accept. */
  readonly good: string;
  /** Output both reject, by breaking a `workerEnforced` check. */
  readonly bad: string;
}

export const EVAL_SAMPLES: Readonly<Record<string, EvalSample>>;

export function sampleForTask(task: string): EvalSample;
