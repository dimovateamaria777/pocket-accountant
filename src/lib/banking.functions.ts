import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enableBankingRequest } from "@/lib/enable-banking.server";
import { isWithdrawal, kindForCategory, ruleMatches, type Kind } from "@/lib/finance";

const countrySchema = z.string().regex(/^[A-Z]{2}$/);
const bankAccountSchema = z.object({
  uid: z.string().uuid(),
  identification_hash: z.string().optional(),
  name: z.string().optional(),
  currency: z.string().optional(),
});
const bankTransactionSchema = z.object({
  entry_reference: z.string().max(300).optional(),
  transaction_amount: z.object({ currency: z.string().length(3), amount: z.string() }),
  credit_debit_indicator: z.enum(["CRDT", "DBIT"]),
  status: z.string(),
  booking_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  value_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  transaction_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  creditor: z.object({ name: z.string().max(300).optional() }).optional(),
  debtor: z.object({ name: z.string().max(300).optional() }).optional(),
  bank_transaction_code: z.object({ description: z.string().max(500).optional() }).optional(),
  remittance_information: z.array(z.string().max(1000)).max(20).optional(),
});
type BankTransaction = z.infer<typeof bankTransactionSchema>;

export const listBanks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { country?: string }) => ({
    country: countrySchema.parse(input?.country ?? "BG"),
  }))
  .handler(async ({ data }) => {
    const result = await enableBankingRequest<{
      aspsps?: Array<{ name: string; country: string; maximum_consent_validity?: number }>;
    }>(`/aspsps?country=${data.country}&psu_type=personal`);
    return (result.aspsps ?? [])
      .filter((bank) => bank.name && bank.country)
      .map((bank) => ({
        name: bank.name,
        country: bank.country,
        maximumConsentValidity: bank.maximum_consent_validity ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

export const getBankConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("bank_connections")
      .select(
        "id, provider, bank_name, bank_country, accounts, access_valid_until, last_synced_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const startBankConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { bankName: string; bankCountry: string; maximumConsentValidity?: number | null }) =>
      z
        .object({
          bankName: z.string().min(1).max(200),
          bankCountry: countrySchema,
          maximumConsentValidity: z.number().int().positive().max(31_536_000).nullable().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const request = getRequest();
    if (!request) throw new Error("Липсва адрес за връщане от банката.");
    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const validitySeconds = Math.min(data.maximumConsentValidity ?? 90 * 86_400, 90 * 86_400);
    const validUntil = new Date(Date.now() + validitySeconds * 1000).toISOString();
    const callbackUrl = `${new URL(request.url).origin}/api/public/banking/callback`;
    const result = await enableBankingRequest<{ url?: string }>("/auth", {
      method: "POST",
      body: {
        access: { balances: true, transactions: true, valid_until: validUntil },
        aspsp: { name: data.bankName, country: data.bankCountry },
        psu_type: "personal",
        redirect_url: callbackUrl,
        state,
      },
    });
    if (!result.url) throw new Error("Enable Banking не върна адрес за разрешение.");
    const { error } = await context.supabase.from("bank_connection_attempts").insert({
      user_id: context.userId,
      state,
      bank_name: data.bankName,
      bank_country: data.bankCountry,
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw error;
    return { url: result.url, callbackUrl };
  });

function inferredKind(transaction: BankTransaction, description: string): Kind {
  const text = description.toLowerCase();
  if (
    transaction.credit_debit_indicator === "CRDT" &&
    /refund|reversal|chargeback|възстанов|върнат/.test(text)
  )
    return "refund";
  if (/top[ -]?up|захранване|собствена сметка|вътрешен превод/.test(text)) return "transfer";
  return transaction.credit_debit_indicator === "CRDT" ? "income" : "expense";
}

function fallbackCategory(kind: Kind, merchant: string, description: string) {
  if (kind === "transfer") return "Вътрешен превод";
  if (kind === "income") return "Доход";
  if (kind === "refund") return "Възстановена сума";
  const text = `${merchant} ${description}`.toLowerCase();
  if (/lidl|kaufland|billa|fantastico|t-market|супермаркет/.test(text)) return "Храна";
  if (/netflix|spotify|hbo|disney|абонамент/.test(text)) return "Абонаменти";
  if (/omv|shell|lukoil|eko|гориво|бензин/.test(text)) return "Транспорт";
  if (/apteka|аптека|pharmacy|здраве/.test(text)) return "Здраве";
  if (/ikea|jysk|за дома/.test(text)) return "За дома";
  return "Други";
}

function toImportRow(
  transaction: BankTransaction,
  accountId: string,
  connectionId: string,
  userId: string,
) {
  const descriptionParts = [...(transaction.remittance_information ?? [])];
  if (transaction.bank_transaction_code?.description)
    descriptionParts.push(transaction.bank_transaction_code.description);
  const merchant =
    (transaction.credit_debit_indicator === "DBIT"
      ? transaction.creditor?.name
      : transaction.debtor?.name) ??
    descriptionParts[0] ??
    "Банково плащане";
  const description = descriptionParts.join(" · ") || merchant;
  const date = transaction.booking_date ?? transaction.value_date ?? transaction.transaction_date;
  if (!date || !transaction.entry_reference)
    return { skipped: "missing_reference_or_date" as const };
  const originalAmount = Number(transaction.transaction_amount.amount);
  if (!Number.isFinite(originalAmount)) return { skipped: "invalid_amount" as const };
  const currency = transaction.transaction_amount.currency.toUpperCase();
  if (currency !== "EUR" && currency !== "BGN") return { skipped: "unsupported_currency" as const };
  const absoluteEur = currency === "BGN" ? originalAmount / 1.95583 : originalAmount;
  const amount =
    (Math.round(absoluteEur * 100) / 100) *
    (transaction.credit_debit_indicator === "DBIT" ? -1 : 1);
  return {
    row: {
      user_id: userId,
      bank_connection_id: connectionId,
      bank_account_id: accountId,
      external_id: transaction.entry_reference,
      tx_date: date,
      description: description.slice(0, 2000),
      merchant: merchant.slice(0, 300),
      amount,
      original_amount: currency === "BGN" ? originalAmount : null,
      original_currency: currency === "BGN" ? "BGN" : null,
      kind: inferredKind(transaction, description),
      category: "",
    },
  };
}

export const syncBankConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId: string }) =>
    z.object({ connectionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: connection, error } = await context.supabase
      .from("bank_connections")
      .select("id, session_id, bank_name, accounts, last_synced_at")
      .eq("id", data.connectionId)
      .single();
    if (error || !connection) throw new Error("Банковата връзка не е намерена.");
    const accounts = z
      .array(bankAccountSchema)
      .parse(connection.accounts)
      .filter((account) => account.uid);
    if (!accounts.length) throw new Error("Банката не е предоставила сметки за четене.");

    const [{ data: merchantRules }, { data: textRules }] = await Promise.all([
      context.supabase.from("merchant_rules").select("merchant, category, kind"),
      context.supabase.from("category_rules").select("pattern, category"),
    ]);
    const merchantRuleMap = new Map(
      (merchantRules ?? []).map((rule) => [rule.merchant.toLowerCase(), rule]),
    );
    const today = new Date().toISOString().slice(0, 10);
    const from = connection.last_synced_at
      ? new Date(new Date(connection.last_synced_at).getTime() - 7 * 86_400_000)
          .toISOString()
          .slice(0, 10)
      : new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

    let added = 0;
    let alreadyKnown = 0;
    let skipped = 0;
    let pages = 0;
    for (const account of accounts) {
      let continuationKey: string | null = null;
      const fetched: BankTransaction[] = [];
      for (;;) {
        const params = new URLSearchParams({
          date_from: from,
          date_to: today,
          transaction_status: "BOOK",
        });
        if (continuationKey) params.set("continuation_key", continuationKey);
        const result = await enableBankingRequest<{
          transactions?: unknown[];
          continuation_key?: string | null;
        }>(`/accounts/${account.uid}/transactions?${params}`);
        const page = z.array(bankTransactionSchema).safeParse(result.transactions ?? []);
        if (!page.success) throw new Error("Банката върна неразпознат формат на плащанията.");
        fetched.push(...page.data);
        pages += 1;
        continuationKey = result.continuation_key ?? null;
        if (!continuationKey) break;
        if (pages > 100)
          throw new Error(
            "Синхронизирането спря, за да не пропусне или зацикли страници. Опитайте отново.",
          );
      }

      const candidates = fetched.map((transaction) =>
        toImportRow(transaction, account.uid, connection.id, context.userId),
      );
      skipped += candidates.filter((candidate) => !candidate.row).length;
      const rows = candidates.flatMap((candidate) => (candidate.row ? [candidate.row] : []));
      const externalIds = [...new Set(rows.map((row) => row.external_id))];
      const known = new Set<string>();
      for (let i = 0; i < externalIds.length; i += 400) {
        const chunk = externalIds.slice(i, i + 400);
        const { data: existing, error: existingError } = await context.supabase
          .from("transactions")
          .select("external_id")
          .eq("bank_account_id", account.uid)
          .in("external_id", chunk);
        if (existingError) throw existingError;
        for (const row of existing ?? []) if (row.external_id) known.add(row.external_id);
      }
      const newRows = rows.filter((row) => !known.has(row.external_id));
      alreadyKnown += rows.length - newRows.length;
      const categorized = newRows.map((row) => {
        const withdrawal = isWithdrawal(row);
        const merchantRule = merchantRuleMap.get(row.merchant.toLowerCase());
        const textRule = (textRules ?? []).find((rule) => ruleMatches(row, rule.pattern));
        const category = withdrawal
          ? "Теглене"
          : (textRule?.category ??
            merchantRule?.category ??
            fallbackCategory(row.kind as Kind, row.merchant, row.description));
        const kind = withdrawal
          ? "expense"
          : textRule
            ? kindForCategory(textRule.category, row.kind as Kind)
            : ((merchantRule?.kind as Kind | undefined) ?? row.kind);
        return { ...row, category, kind };
      });
      for (let i = 0; i < categorized.length; i += 400) {
        const { error: insertError } = await context.supabase
          .from("transactions")
          .insert(categorized.slice(i, i + 400));
        if (insertError) throw insertError;
      }
      added += categorized.length;
    }
    const { error: updateError } = await context.supabase
      .from("bank_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", connection.id);
    if (updateError) throw updateError;
    return { added, alreadyKnown, skipped, pages };
  });

export const disconnectBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId: string }) =>
    z.object({ connectionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: connection, error } = await context.supabase
      .from("bank_connections")
      .select("id, session_id, provider")
      .eq("id", data.connectionId)
      .single();
    if (error || !connection) throw new Error("Банковата връзка не е намерена.");
    if (connection.provider === "infopay") {
      const { disconnectInfoPayConnection } = await import("@/lib/infopay.server");
      return disconnectInfoPayConnection(connection.id, context.userId);
    }
    await enableBankingRequest(`/sessions/${connection.session_id}`, { method: "DELETE" });
    const { error: deleteError } = await context.supabase
      .from("bank_connections")
      .delete()
      .eq("id", connection.id);
    if (deleteError) throw deleteError;
    return { disconnected: true };
  });
