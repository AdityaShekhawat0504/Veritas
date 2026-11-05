import { Inngest } from "inngest";

// INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY are read from the environment.
export const inngest = new Inngest({ id: "veritas" });

export const EVENTS = {
  filingNew: "filing.new",
  macroReleased: "macro.released",
  priceUpdated: "price.updated",
  alertCreated: "alert.created",
} as const;
