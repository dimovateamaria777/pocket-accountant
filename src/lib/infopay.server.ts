import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  INFOPAY_API_ORIGIN,
  infoPayAccountSchema,
  infoPayToImportRow,
  infoPayTransactionPageSchema,
  resolveInfoPayNextUrl,
  type InfoPayTransaction,
} from "@/lib/infopay";
import {
  decryptInfoPayCredentials,
  encryptInfoPayCredentials,
  type InfoPayCredentials,
} from "@/lib/infopay-crypto.server";
import { isWithdrawal, kindForCategory, ruleMatches, type Kind } from "@/lib/finance";

const sessionSchema = z.object({
  SessionId: z.string().nullable().optional(),
  SessionKey: z.string().nullable().optional(),
  Status: z.string(),
});
type InfoPaySession = { sessionId: string; sessionKey: string };

async function createSession(credentials: InfoPayCredentials): Promise<InfoPaySession> {
  const response = await fetch(`${INFOPAY_API_ORIGIN}/api/session`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      uniqueId: credentials.uniqueId,
      accessToken: credentials.accessToken,
    }),
    redirect: "manual",
  });
  if (!response.ok) throw new Error(`InfoPay върна грешка ${response.status} при създаване на сесия.`);
  const parsed = sessionSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("InfoPay върна неразпознат отговор при свързването.");
  if (parsed.data.Status !== "Success") {
    if (parsed.data.Status === "Blocked")
      throw new Error("InfoPay ERP регистрацията е блокирана. Проверете статуса ѝ в InfoPay.");
    throw new Error("InfoPay отхвърли Unique ID или AccessToken. Проверете ги и опитайте отново.");
  }
  const sessionId = z.string().uuid().safeParse(parsed.data.SessionId);
  const sessionKey = z.string().min(32).safeParse(parsed.data.SessionKey);
  if (!sessionId.success || !sessionKey.success)
    throw new Error("InfoPay върна непълни данни за сесия. Опитайте отново.");
  return { sessionId: sessionId.data, sessionKey: sessionKey.data };
}

async function requestInfoPay(
  pathOrUrl: string,
  session: InfoPaySession,
  init: { method?: string } = {},
): Promise<unknown> {
  const url = new URL(pathOrUrl, INFOPAY_API_ORIGIN);
  if (url.origin !== INFOPAY_API_ORIGIN) throw new Error("Невалиден адрес на InfoPay услугата.");
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      SessionId: session.sessionId,
      SessionKey: session.sessionKey,
    },
    redirect: "manual",
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error("InfoPay отказа достъп. Проверете съгласието и правата за движения.");
    throw new Error(`InfoPay върна грешка ${response.status}.`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function closeSession(session: InfoPaySession) {
  try {
    await requestInfoPay("/api/session/close", session, { method: "POST" });
  } catch {
    // The saved connection remains valid even when closing the short-lived session fails.
  }
}

async function fetchAccounts(session: InfoPaySession) {
  const raw = await requestInfoPay("/api/accounts", session);
  const parsed = z
    .object({ Accounts: z.array(infoPayAccountSchema).max(100).optional() })
    .safeParse(raw);
  if (!parsed.success) throw new Error("InfoPay върна неразпознат списък със сметки.");
  return (parsed.data.Accounts ?? []).map((account) => ({
    uid: account.AccountId,
    name: account.Name?.trim() || "InfoPay сметка",
    currency: account.Currency.toUpperCase(),
  }));
}

export async function connectInfoPay(
  userId: string,
  credentials: InfoPayCredentials,
  encryptionSecret: string,
) {
  const session = await createSession(credentials);
  let accounts;
  try {
    accounts = await fetchAccounts(session);
  } finally {
    await closeSession(session);
  }
  if (!accounts.length)
    throw new Error("InfoPay не върна сметки с право за четене. Проверете съгласието и ERP правата.");

  const { data: connection, error } = await supabaseAdmin
    .from("bank_connections")
    .insert({
      user_id: userId,
      provider: "infopay",
      session_id: session.sessionId,
      bank_name: "InfoPay",
      bank_country: "BG",
      accounts,
    })
    .select("id")
    .single();
  if (error || !connection) throw error ?? new Error("InfoPay връзката не беше записана.");

  const credentialsCiphertext = await encryptInfoPayCredentials(credentials, encryptionSecret);
  const { error: credentialsError } = await supabaseAdmin.from("infopay_credentials").insert({
    connection_id: connection.id,
    user_id: userId,
    credentials_ciphertext: credentialsCiphertext,
  });
  if (credentialsError) {
    await supabaseAdmin.from("bank_connections").delete().eq("id", connection.id);
    throw credentialsError;
  }
  return { connectionId: connection.id, accounts: accounts.length };
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

export async function syncInfoPayConnection(
  connectionId: string,
  expectedUserId: string,
  encryptionSecret: string,
) {
  const { data: connection, error } = await supabaseAdmin
    .from("bank_connections")
    .select("id, user_id, accounts, last_synced_at")
    .eq("id", connectionId)
    .eq("user_id", expectedUserId)
    .eq("provider", "infopay")
    .single();
  if (error || !connection) throw new Error("InfoPay връзката не е намерена.");
  const { data: storedCredentials, error: credentialsError } = await supabaseAdmin
    .from("infopay_credentials")
    .select("credentials_ciphertext")
    .eq("connection_id", connection.id)
    .eq("user_id", expectedUserId)
    .single();
  if (credentialsError || !storedCredentials)
    throw new Error("Данните за InfoPay връзката липсват. Свържете я отново.");
  const credentials = await decryptInfoPayCredentials(
    storedCredentials.credentials_ciphertext,
    encryptionSecret,
  );

  const session = await createSession(credentials);
  let added = 0;
  let alreadyKnown = 0;
  let skipped = 0;
  let pages = 0;
  try {
    const accounts = await fetchAccounts(session);
    if (!accounts.length) throw new Error("InfoPay не върна сметки с право за четене.");
    const [{ data: merchantRules, error: merchantError }, { data: textRules, error: textError }] =
      await Promise.all([
        supabaseAdmin.from("merchant_rules").select("merchant, category, kind").eq("user_id", expectedUserId),
        supabaseAdmin.from("category_rules").select("pattern, category").eq("user_id", expectedUserId),
      ]);
    if (merchantError) throw merchantError;
    if (textError) throw textError;
    const merchantRuleMap = new Map(
      (merchantRules ?? []).map((rule) => [rule.merchant.toLowerCase(), rule]),
    );
    const today = new Date().toISOString();
    const from = connection.last_synced_at
      ? new Date(new Date(connection.last_synced_at).getTime() - 7 * 86_400_000).toISOString()
      : new Date(Date.now() - 90 * 86_400_000).toISOString();

    for (const account of accounts) {
      const params = new URLSearchParams({ dateFrom: from, dateTo: today });
      let nextUrl: string | null = `/api/accounts/${account.uid}/transactions?${params}`;
      const visited = new Set<string>();
      const fetched: InfoPayTransaction[] = [];
      while (nextUrl) {
        if (visited.has(nextUrl)) throw new Error("InfoPay страницирането зацикли. Опитайте отново.");
        visited.add(nextUrl);
        const raw = await requestInfoPay(nextUrl, session);
        const page = infoPayTransactionPageSchema.safeParse(raw);
        if (!page.success) throw new Error("InfoPay върна неразпознат формат на движенията.");
        fetched.push(...(page.data.Transactions?.Booked ?? []));
        pages += 1;
        const nextHref = page.data.Transactions?.Links?.Next?.href;
        nextUrl = nextHref ? resolveInfoPayNextUrl(nextHref) : null;
        if (pages > 100)
          throw new Error("Синхронизирането спря след 100 страници, за да не пропусне данни.");
      }

      const candidates = fetched.map((transaction) =>
        infoPayToImportRow(transaction, account.uid, connection.id, expectedUserId),
      );
      skipped += candidates.filter((candidate) => !candidate.row).length;
      const rows = candidates.flatMap((candidate) => (candidate.row ? [candidate.row] : []));
      const externalIds = [...new Set(rows.map((row) => row.external_id))];
      const known = new Set<string>();
      for (let i = 0; i < externalIds.length; i += 400) {
        const { data: existing, error: existingError } = await supabaseAdmin
          .from("transactions")
          .select("external_id")
          .eq("user_id", expectedUserId)
          .eq("bank_account_id", account.uid)
          .in("external_id", externalIds.slice(i, i + 400));
        if (existingError) throw existingError;
        for (const row of existing ?? []) if (row.external_id) known.add(row.external_id);
      }
      const newRows = rows.filter((row) => {
        if (known.has(row.external_id)) return false;
        known.add(row.external_id);
        return true;
      });
      alreadyKnown += rows.length - newRows.length;
      const categorized = newRows.map((row) => {
        const withdrawal = isWithdrawal(row);
        const merchantRule = merchantRuleMap.get(row.merchant.toLowerCase());
        const textRule = (textRules ?? []).find((rule) => ruleMatches(row, rule.pattern));
        const category = withdrawal
          ? "Теглене"
          : (textRule?.category ??
            merchantRule?.category ??
            fallbackCategory(row.kind, row.merchant, row.description));
        const kind = withdrawal
          ? "expense"
          : textRule
            ? kindForCategory(textRule.category, row.kind)
            : ((merchantRule?.kind as Kind | undefined) ?? row.kind);
        return { ...row, category, kind };
      });
      for (let i = 0; i < categorized.length; i += 400) {
        const { error: insertError } = await supabaseAdmin
          .from("transactions")
          .insert(categorized.slice(i, i + 400));
        if (insertError) throw insertError;
      }
      added += categorized.length;
    }

    const { error: updateError } = await supabaseAdmin
      .from("bank_connections")
      .update({ accounts, session_id: session.sessionId, last_synced_at: new Date().toISOString() })
      .eq("id", connection.id)
      .eq("user_id", expectedUserId);
    if (updateError) throw updateError;
  } finally {
    await closeSession(session);
  }
  return { added, alreadyKnown, skipped, pages };
}

export async function syncAllInfoPayConnections(encryptionSecret: string) {
  const { data: connections, error } = await supabaseAdmin
    .from("bank_connections")
    .select("id, user_id")
    .eq("provider", "infopay")
    .order("created_at")
    .limit(100);
  if (error) throw error;
  const results = [];
  for (const connection of connections ?? []) {
    try {
      const result = await syncInfoPayConnection(connection.id, connection.user_id, encryptionSecret);
      results.push({ connectionId: connection.id, ok: true as const, ...result });
    } catch (cause) {
      results.push({
        connectionId: connection.id,
        ok: false as const,
        error: cause instanceof Error ? cause.message : "Unknown synchronization error",
      });
    }
  }
  return { connections: results.length, results };
}

export async function disconnectInfoPayConnection(connectionId: string, userId: string) {
  const { error } = await supabaseAdmin
    .from("bank_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("provider", "infopay");
  if (error) throw error;
  return { disconnected: true };
}
