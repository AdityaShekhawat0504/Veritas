// Actions used by ingestion jobs: securities, events and stored documents.
// Events and documents are idempotent: recording the same one twice is a no-op.

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { documents, events, securities } from "@/db/schema";
import { EVENT_KINDS } from "@/db/enums";
import type { Db } from "@/db/types";
import type { Actor } from "./context";
import { parseInput } from "./context";
import { ActionError } from "./errors";
import { writeLog } from "./log";

/** Accepts a Date or an ISO date string. */
const dateInput = z.preprocess((v) => (typeof v === "string" ? new Date(v) : v), z.date());

const securitySchema = z.object({
  ticker: z.string().trim().toUpperCase().min(1),
  cik: z
    .string()
    .regex(/^\d{1,10}$/)
    .transform((v) => v.padStart(10, "0"))
    .nullable()
    .optional(),
  name: z.string().nullable().optional(),
});

/** upsertSecurity: create a security, or fill in a missing CIK or name. */
export async function upsertSecurity(db: Db, actor: Actor, input: z.input<typeof securitySchema>) {
  const s = parseInput(securitySchema, input);
  return db.transaction(async (tx) => {
    const existing = (await tx.select().from(securities).where(eq(securities.ticker, s.ticker)).limit(1))[0];
    if (!existing) {
      const row = (await tx.insert(securities).values({ ticker: s.ticker, cik: s.cik ?? null, name: s.name ?? null }).returning())[0];
      await writeLog(tx, actor, { firmId: null, action: "upsertSecurity", objectType: "security", objectId: row.id, after: row });
      return row;
    }
    if (s.cik && existing.cik && s.cik !== existing.cik) {
      throw new ActionError("CONFLICT", `Ticker ${s.ticker} already has CIK ${existing.cik}`);
    }
    const patch = {
      cik: existing.cik ?? s.cik ?? null,
      name: existing.name ?? s.name ?? null,
    };
    if (patch.cik === existing.cik && patch.name === existing.name) return existing;
    const row = (await tx.update(securities).set(patch).where(eq(securities.id, existing.id)).returning())[0];
    await writeLog(tx, actor, {
      firmId: null,
      action: "upsertSecurity",
      objectType: "security",
      objectId: row.id,
      before: existing,
      after: row,
    });
    return row;
  });
}

const eventSchema = z.object({
  kind: z.enum(EVENT_KINDS),
  securityId: z.string().uuid().nullable().optional(),
  sourceKey: z.string().min(1),
  payload: z.record(z.unknown()),
  occurredAt: dateInput,
});

/** recordEvent: store a new filing, macro release or price move once. */
export async function recordEvent(db: Db, actor: Actor, input: z.input<typeof eventSchema>) {
  const e = parseInput(eventSchema, input);
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(events)
      .values({
        kind: e.kind,
        securityId: e.securityId ?? null,
        sourceKey: e.sourceKey,
        payload: e.payload,
        occurredAt: e.occurredAt,
      })
      .onConflictDoNothing({ target: [events.kind, events.sourceKey] })
      .returning();
    if (inserted.length === 0) {
      const existing = (
        await tx
          .select()
          .from(events)
          .where(and(eq(events.kind, e.kind), eq(events.sourceKey, e.sourceKey)))
          .limit(1)
      )[0];
      return { event: existing, created: false };
    }
    const row = inserted[0];
    await writeLog(tx, actor, {
      firmId: null,
      action: "recordEvent",
      objectType: "event",
      objectId: row.id,
      after: { kind: row.kind, sourceKey: row.sourceKey, securityId: row.securityId },
    });
    return { event: row, created: true };
  });
}

const documentSchema = z.object({
  securityId: z.string().uuid().nullable().optional(),
  sourceUrl: z.string().url(),
  docType: z.string().min(1),
  accession: z.string().nullable().optional(),
  publishedAt: dateInput.nullable().optional(),
  text: z.string().min(1),
});

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** storeDocument: keep the exact source text that quotes are verified against. */
export async function storeDocument(db: Db, actor: Actor, input: z.input<typeof documentSchema>) {
  const d = parseInput(documentSchema, input);
  const hash = sha256(d.text);
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(documents)
      .values({
        securityId: d.securityId ?? null,
        sourceUrl: d.sourceUrl,
        docType: d.docType,
        accession: d.accession ?? null,
        publishedAt: d.publishedAt ?? null,
        text: d.text,
        sha256: hash,
      })
      .onConflictDoNothing({ target: [documents.sourceUrl, documents.sha256] })
      .returning();
    if (inserted.length === 0) {
      const existing = (
        await tx
          .select()
          .from(documents)
          .where(and(eq(documents.sourceUrl, d.sourceUrl), eq(documents.sha256, hash)))
          .limit(1)
      )[0];
      return { document: existing, created: false };
    }
    const row = inserted[0];
    await writeLog(tx, actor, {
      firmId: null,
      action: "storeDocument",
      objectType: "document",
      objectId: row.id,
      after: { sourceUrl: row.sourceUrl, docType: row.docType, accession: row.accession, sha256: row.sha256 },
    });
    return { document: row, created: true };
  });
}
