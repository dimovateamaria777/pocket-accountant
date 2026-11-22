import { z } from "zod";
import type { Kind } from "@/lib/finance";

export const INFOPAY_API_ORIGIN = "https://integration.infopay.bg";

export const infoPayAccountSchema = z.object({
  AccountId: z.string().uuid(),
  Name: z.string().max(300).nullable().optional(),
  IBAN: z.string().max(50).nullable().optional(),
  Currency: z.string().length(3),
});

export const infoPayTransactionSchema = z.object({
  TransactionId: z.string().uuid().nullable().optional(),
  TransactionExternalId: z.string().max(300).nullable().optional(),
  EntryReference: z.string().max(300).nullable().optional(),
  BookingDate: z.string().max(60).nullable().optional(),
  ValueDate: z.string().max(60).nullable().optional(),
  TimeStamp: z.string().max(60).nullable().optional(),
  TransactionAmount: z.object({ amount: z.string(), currency: z.string().length(3) }),
  TransactionType: z.enum(["Debit", "Credit"]).nullable().optional(),
  RemittanceInformationUnstructured: z.string().max(2000).nullable().optional(),
  DebtorName: z.string().max(300).nullable().optional(),
  CreditorName: z.string().max(300).nullable().optional(),
  BankTransactionCode: z.string().max(500).nullable().optional(),
  ProprietaryBankTransactionCode: z.string().max(500).nullable().optional(),
});

export const infoPayTransactionPageSchema = z.object({
  Transactions: z
    .object({
      Booked: z.array(infoPayTransactionSchema).max(100).optional(),
      Links: z
        .object({ Next: z.object({ href: z.string().max(4096) }).nullable().optional() })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

export type InfoPayTransaction = z.infer<typeof infoPayTransactionSchema>;

function inferredKind(transaction: InfoPayTransaction, description: string): Kind | null {
  if (!transaction.TransactionType) return null;
  const text = description.toLowerCase();
  if (
    transaction.TransactionType === "Credit" &&
    /refund|reversal|chargeback|възстанов|върнат/.test(text)
  )
    return "refund";
  if (/top[ -]?up|захранване|собствена сметка|вътрешен превод/.test(text)) return "transfer";
  return transaction.TransactionType === "Credit" ? "income" : "expense";
}

export function infoPayToImportRow(
  transaction: InfoPayTransaction,
  accountId: string,
  connectionId: string,
  userId: string,
) {
  const externalId =
    transaction.EntryReference?.trim() ||
    transaction.TransactionExternalId?.trim() ||
    transaction.TransactionId?.trim();
  if (!externalId) return { skipped: "missing_reference" as const };

  const rawDate = transaction.BookingDate ?? transaction.ValueDate ?? transaction.TimeStamp;
  const txDate = rawDate?.slice(0, 10);
  if (!txDate || !/^\d{4}-\d{2}-\d{2}$/.test(txDate) || !rawDate || Number.isNaN(Date.parse(rawDate)))
    return { skipped: "missing_date" as const };

  const originalAmount = Number(transaction.TransactionAmount.amount);
  if (!Number.isFinite(originalAmount)) return { skipped: "invalid_amount" as const };
  const currency = transaction.TransactionAmount.currency.toUpperCase();
  if (currency !== "EUR" && currency !== "BGN") return { skipped: "unsupported_currency" as const };

  const descriptionParts = [
    transaction.RemittanceInformationUnstructured,
    transaction.BankTransactionCode,
    transaction.ProprietaryBankTransactionCode,
  ].filter((part): part is string => !!part?.trim());
  const merchant =
    (transaction.TransactionType === "Debit"
      ? transaction.CreditorName
      : transaction.DebtorName) ??
    descriptionParts[0] ??
    "InfoPay плащане";
  const description = descriptionParts.join(" · ") || merchant;
  const kind = inferredKind(transaction, description);
  if (!kind) return { skipped: "missing_type" as const };

  const absoluteEur = Math.abs(currency === "BGN" ? originalAmount / 1.95583 : originalAmount);
  const amount =
    (Math.round(absoluteEur * 100) / 100) * (transaction.TransactionType === "Debit" ? -1 : 1);
  return {
    row: {
      user_id: userId,
      bank_connection_id: connectionId,
      bank_account_id: accountId,
      external_id: externalId,
      tx_date: txDate,
      description: description.slice(0, 2000),
      merchant: merchant.slice(0, 300),
      amount,
      original_amount: currency === "BGN" ? Math.abs(originalAmount) : null,
      original_currency: currency === "BGN" ? "BGN" : null,
      kind,
      category: "",
    },
  };
}

/** Prevents provider-supplied pagination links from sending session headers to another origin. */
export function resolveInfoPayNextUrl(href: string) {
  const url = new URL(href, INFOPAY_API_ORIGIN);
  if (url.origin !== INFOPAY_API_ORIGIN || !url.pathname.startsWith("/api/accounts/"))
    throw new Error("InfoPay върна невалиден адрес за следваща страница.");
  return url.toString();
}
