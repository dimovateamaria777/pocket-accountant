import { z } from "zod";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish();
const text = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => (value == null ? undefined : value.slice(0, max)));
const party = z.object({ name: text(300) }).passthrough().nullish();

/** Enable Banking sends absent fields as null, so every optional field accepts null. */
export const bankTransactionSchema = z
  .object({
    entry_reference: text(300),
    transaction_id: text(300),
    transaction_amount: z.object({ currency: z.string().length(3), amount: z.string() }),
    credit_debit_indicator: z.enum(["CRDT", "DBIT"]),
    status: z.string().nullish(),
    booking_date: date,
    value_date: date,
    transaction_date: date,
    creditor: party,
    debtor: party,
    bank_transaction_code: z.object({ description: text(500) }).passthrough().nullish(),
    remittance_information: z
      .array(z.string().nullable())
      .nullish()
      .transform((items) =>
        (items ?? []).flatMap((item) => (item ? [item.slice(0, 1000)] : [])).slice(0, 20),
      ),
  })
  .passthrough();
export type BankTransaction = z.infer<typeof bankTransactionSchema>;

function describe(value: unknown): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length ? [describe(value[0])] : [];
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, describe(v)]),
    );
  return typeof value;
}

/** Validates row by row; returns a structure-only summary (no values) for invalid rows. */
export function parseBankTransactions(raw: unknown[]) {
  const valid: BankTransaction[] = [];
  const issues: { path: string; shape: unknown }[] = [];
  for (const item of raw) {
    const parsed = bankTransactionSchema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
    else
      issues.push({
        path: parsed.error.issues.map((issue) => issue.path.join(".")).join(","),
        shape: describe(item),
      });
  }
  return { valid, invalid: issues.length, issues };
}

export function bankEntryId(transaction: BankTransaction) {
  return transaction.entry_reference || transaction.transaction_id || null;
}

export type SyncRow = {
  tx_date: string;
  amount: number;
  description: string;
  external_id: string | null;
};

export function rowFingerprint(row: { tx_date: string; amount: number; description: string }) {
  return `${row.tx_date}|${Number(row.amount).toFixed(2)}|${row.description.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/**
 * Splits rows from one bank response into: insert, known by bank id, already resolved/pending
 * review, and new review items. Rows without a bank id get a key of fingerprint + occurrence
 * within the response, so identical payments stay separate and resyncs produce no copies.
 */
export function planBankRows<T extends SyncRow>(
  rows: T[],
  known: {
    externalIds: Set<string>;
    fingerprints: Set<string>;
    reviewKeys: Set<string>;
  },
) {
  const totals = new Map<string, number>();
  for (const row of rows)
    if (!row.external_id) {
      const fp = rowFingerprint(row);
      totals.set(fp, (totals.get(fp) ?? 0) + 1);
    }
  const seen = new Map<string, number>();
  const insert: (T & { external_id: string })[] = [];
  const review: { key: string; reason: "same_in_response" | "matches_existing"; row: T }[] = [];
  let knownByBankId = 0;
  let alreadyDecided = 0;
  let alreadyInReview = 0;
  for (const row of rows) {
    if (row.external_id) {
      if (known.externalIds.has(row.external_id)) knownByBankId += 1;
      else insert.push(row as T & { external_id: string });
      continue;
    }
    const fp = rowFingerprint(row);
    const n = seen.get(fp) ?? 0;
    seen.set(fp, n + 1);
    const key = `fp:${fp}:${n}`;
    if (known.externalIds.has(key)) alreadyDecided += 1;
    else if (known.reviewKeys.has(key)) alreadyInReview += 1;
    else if ((totals.get(fp) ?? 0) > 1) review.push({ key, reason: "same_in_response", row });
    else if (known.fingerprints.has(fp)) review.push({ key, reason: "matches_existing", row });
    else insert.push({ ...row, external_id: key });
  }
  return { insert, review, knownByBankId, alreadyDecided, alreadyInReview };
}
