// The only write path into the database. UI and API routes call these
// functions; each validates its rules and writes action_log in the same
// transaction as the change it makes.

export { ActionError, httpStatusFor } from "./errors";
export { systemActor, type Actor } from "./context";
export { ensureUser, addMember } from "./users";
export {
  createThesis,
  confirmExtraction,
  createConfirmedThesis,
  reviseThesis,
  closeThesis,
  type ActionOptions,
} from "./theses";
export { bindIndicator } from "./indicators";
export { runCheck, overrideVerdict, type CheckResult } from "./checks";
export { recordDecision } from "./decisions";
export { resolveAssumption } from "./assumptions";
export { triggerKillCriterion } from "./killCriteria";
export { upsertSecurity, recordEvent, storeDocument } from "./ingest";
export { seedIndicatorCatalog, type CatalogItem } from "./catalog";
export { recordLlmCall, type LlmCallRecord } from "./llm";
export * from "./schemas";
