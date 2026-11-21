import { z } from "zod";
import { KIND_LABELS } from "@/lib/finance";

export const importTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(2000),
  merchant: z.string().min(1).max(300),
  amount: z.number().finite().min(-100_000_000).max(100_000_000),
  original_amount: z.number().finite().nullable(),
  original_currency: z.string().max(3).nullable(),
  kind: z.enum(["expense", "income", "transfer", "refund"]),
  category: z.string().min(1).max(100),
});

export type ImportTransaction = z.infer<typeof importTransactionSchema>;

export interface ImportPreview {
  fileName: string;
  source: string;
  transactions: ImportTransaction[];
}

export function importSummary(transactions: ImportTransaction[]) {
  const expenses = transactions.filter((t) => t.kind === "expense");
  const incoming = transactions.filter((t) => t.kind === "income" || t.kind === "refund");
  return {
    count: transactions.length,
    expenseCount: expenses.length,
    expenseTotal: Math.round(expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0) * 100) / 100,
    incomingCount: incoming.length,
    incomingTotal: Math.round(incoming.reduce((sum, t) => sum + Math.abs(t.amount), 0) * 100) / 100,
    transferCount: transactions.filter((t) => t.kind === "transfer").length,
    withdrawalCount: transactions.filter((t) => t.category === "Теглене").length,
  };
}

export function importKindLabel(kind: ImportTransaction["kind"]) {
  return KIND_LABELS[kind];
}
