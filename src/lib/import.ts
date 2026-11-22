import { KIND_LABELS, type Kind } from "@/lib/finance";

export const BGN_PER_EUR = 1.95583;
export const DUPLICATE_STATEMENT = "Това извлечение вече е качено.";

export interface PreviewRow {
  date: string;
  description: string;
  merchant: string;
  /** Signed EUR. 0 while needs_review is true. */
  amount: number;
  original_amount: number | null;
  original_currency: string | null;
  kind: Kind;
  category: string;
  /** No booked EUR amount and no fixed conversion: the user must enter EUR or exclude the row. */
  needs_review: boolean;
  direction: "in" | "out";
  /** A stored payment with the same date and amount, if any. Never merged automatically. */
  overlap: { merchant: string; date: string; amount: number } | null;
}

export interface SkippedRow {
  description: string;
  reason: string;
}

export interface ImportPreview {
  previewId: string;
  fileName: string;
  source: string;
  transactions: PreviewRow[];
  skipped: SkippedRow[];
}

export interface RowCorrection {
  category?: string;
  eur?: number;
  exclude?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * EUR amount from what the statement says. EUR is taken as is, BGN uses the fixed rate,
 * another currency only with the EUR amount booked by the bank; otherwise it needs review.
 */
export function toEur(row: { amount: number; currency: string; booked_eur: number | null }) {
  const currency = row.currency.trim().toUpperCase();
  const sign = row.amount < 0 ? -1 : 1;
  const original =
    currency === "EUR" ? null : { original_amount: row.amount, original_currency: currency };
  if (currency === "EUR") return { eur: round2(row.amount), needs_review: false, original };
  if (row.booked_eur != null && Number.isFinite(row.booked_eur))
    return { eur: round2(sign * Math.abs(row.booked_eur)), needs_review: false, original };
  if (currency === "BGN")
    return { eur: round2(row.amount / BGN_PER_EUR), needs_review: false, original };
  return { eur: 0, needs_review: true, original };
}

/** Rows that will be saved vs skipped, and whether a decision is still missing. */
export function previewDecision(
  rows: PreviewRow[],
  corrections: Record<number, RowCorrection>,
  aiSkipped: number,
) {
  let save = 0;
  let excluded = 0;
  let unresolved = 0;
  rows.forEach((row, index) => {
    const c = corrections[index];
    if (c?.exclude) excluded++;
    else if (row.needs_review && (c?.eur == null || !Number.isFinite(c.eur))) unresolved++;
    else save++;
  });
  return { save, skip: excluded + aiSkipped, excluded, unresolved };
}

export function importSummary(rows: PreviewRow[], corrections: Record<number, RowCorrection> = {}) {
  const live = rows
    .map((row, i) => ({ row, c: corrections[i] }))
    .filter(({ c }) => !c?.exclude)
    .map(({ row, c }) => ({
      ...row,
      amount: row.needs_review ? (row.direction === "out" ? -1 : 1) * Math.abs(c?.eur ?? 0) : row.amount,
    }));
  const expenses = live.filter((t) => t.kind === "expense");
  const incoming = live.filter((t) => t.kind === "income" || t.kind === "refund");
  return {
    count: live.length,
    expenseCount: expenses.length,
    expenseTotal: round2(expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0)),
    incomingCount: incoming.length,
    incomingTotal: round2(incoming.reduce((sum, t) => sum + Math.abs(t.amount), 0)),
    transferCount: live.filter((t) => t.kind === "transfer").length,
    withdrawalCount: live.filter((t) => t.category === "Теглене").length,
  };
}

export function importKindLabel(kind: Kind) {
  return KIND_LABELS[kind];
}
