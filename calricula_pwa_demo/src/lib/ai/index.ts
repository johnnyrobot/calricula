export * from "./client";
export * from "./chat-persistence";
export * from "./schemas";
/**
 * Only the two verbs a caller outside this directory has any business calling.
 * The disclosure and session-marker accessors stay module-level exports because
 * `session-readiness` has to reach them across a file boundary, but they are not
 * part of this package's surface — read readiness through the module below,
 * as ADR-0001 decided. A test that needs the raw marker imports "./session"
 * directly, which is the marking.
 */
export { acknowledgeAIDisclosure, establishAISession } from "./session";
export * from "./session-readiness";
export * from "./types";
