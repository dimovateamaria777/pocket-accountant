import { createFileRoute } from "@tanstack/react-router";
import { streamText, Output } from "ai";
import { z } from "zod";
import { CATEGORIES, ruleMatches, kindForCategory, isWithdrawal, type Kind } from "@/lib/finance";
import { DUPLICATE_STATEMENT, toEur, type ImportPreview, type PreviewRow } from "@/lib/import";
import {
  MODEL,
  createProvider,
  reasoningOptions,
  userClientFromRequest,
  aiErrorResponse,
} from "@/lib/ai.server";

const MAX_BYTES = 10 * 1024 * 1024;

const aiSchema = z.object({
  source: z.string().min(1).max(100).describe("Банка или приложение, напр. Revolut, ДСК"),
  transactions: z
    .array(
      z.object({
        date: z.string().describe("YYYY-MM-DD"),
        description: z.string().min(1).max(2000),
        merchant: z
          .string()
          .min(1)
          .max(300)
          .describe("Разпознато име на търговеца/марката, напр. IKEA вместо ХАОС МАРКЕТ БЪЛГАРИЯ ЕООД"),
        amount: z
          .number()
          .finite()
          .describe("Сумата точно както е в извлечението, в нейната валута. Минус = излизащи пари, плюс = влизащи"),
        currency: z.string().min(3).max(3).describe("Валутата на сумата, ISO код, напр. EUR, BGN, USD"),
        booked_eur: z
          .number()
          .finite()
          .nullable()
          .describe("Сумата в евро САМО ако е изрично написана в извлечението. Иначе null. Никога не изчислявай и не оценявай."),
        kind: z.enum(["expense", "income", "transfer", "refund"]),
        category: z.string().min(1).max(100).describe("Една от позволените категории"),
      }),
    )
    .max(5000),
  skipped: z
    .array(
      z.object({
        description: z.string().max(500),
        reason: z.string().max(300).describe("Защо редът не е включен, напр. блокирана сума, отказано плащане, нечетлив ред"),
      }),
    )
    .max(500)
    .describe("Редове, които приличат на плащания, но не са включени в transactions"),
});

const saveSchema = z.object({
  mode: z.literal("save"),
  previewId: z.string().uuid(),
  corrections: z
    .array(
      z
        .object({
          index: z.number().int().min(0),
          category: z.string().min(1).max(100).optional(),
          eur: z.number().finite().min(-100_000_000).max(100_000_000).optional(),
          exclude: z.boolean().optional(),
        })
        .strict(),
    )
    .max(5000),
}).strict();

const cancelSchema = z.object({ mode: z.literal("cancel"), previewId: z.string().uuid() }).strict();

const INSTRUCTIONS = `Ти си счетоводител. Извлечи ВСИЧКИ транзакции от банковото извлечение. Не измисляй транзакции.
Правила:
- amount и currency: сумата и валутата точно както са в извлечението. НЕ преобразувай валути.
- booked_eur: попълни само ако извлечението изрично показва сумата в евро (напр. осчетоводена сума при плащане в чужда валута). Иначе null.
- kind="transfer" и category="Вътрешен превод": преводи между собствени сметки на притежателя (Top-up, захранване, превод към себе си, обмяна на валута в собствена сметка).
- kind="refund" и category = категорията на първоначалната покупка: върнати пари, refund, reversal, възстановяване, chargeback. НЕ е доход.
- kind="income" и category="Доход": заплата, хонорари, получени преводи от други хора.
- Всичко останало е kind="expense". Тегления от банкомат категоризирай като "Теглене".
- merchant: разпознай реалната марка зад юридическото име или терминала, ако я знаеш.
- skipped: всеки ред, който прилича на плащане, но не го включваш (блокирана/чакаща сума, отказано плащане, нечетлив ред), с причина.`;

const errorMessages: Record<string, [string, number]> = {
  duplicate_statement: [DUPLICATE_STATEMENT, 409],
  preview_not_found: ["Прегледът вече не е наличен. Качете файла отново.", 410],
  preview_expired: ["Прегледът е изтекъл. Качете файла отново.", 410],
  review_required: ["Има редове без сума в евро. Въведете сума или изключете реда.", 400],
  invalid_corrections: ["Позволени са само промени на категория, потвърдена сума в евро и изключване на ред.", 400],
  nothing_to_save: ["Няма редове за запис.", 400],
};

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const Route = createFileRoute("/api/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userClientFromRequest(request);
        if (!auth) return Response.json({ error: "Моля, влезте в профила си." }, { status: 401 });

        // Save / cancel: JSON that only references a server-held preview.
        if ((request.headers.get("content-type") ?? "").includes("application/json")) {
          const raw: unknown = await request.json().catch(() => null);
          const cancel = cancelSchema.safeParse(raw);
          if (cancel.success) {
            await auth.supabase.rpc("cancel_import_preview", { p_preview_id: cancel.data.previewId });
            return Response.json({ ok: true });
          }
          const parsed = saveSchema.safeParse(raw);
          if (!parsed.success)
            return Response.json({ error: errorMessages["invalid_corrections"]![0] }, { status: 400 });
          const { data, error } = await auth.supabase.rpc("commit_import_preview", {
            p_preview_id: parsed.data.previewId,
            p_corrections: parsed.data.corrections,
          });
          if (error) {
            const known = Object.keys(errorMessages).find((k) => error.message.includes(k));
            if (known) {
              const [message, status] = errorMessages[known]!;
              return Response.json({ error: message, code: known }, { status });
            }
            // Temporary failure: the preview stays valid, so the same save can be retried.
            return Response.json({ error: "Записът не успя. Опитайте отново.", retry: true }, { status: 503 });
          }
          return Response.json(data);
        }

        // Preview: the original file bytes; the authoritative fingerprint is computed here.
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File) || file.size === 0)
          return Response.json({ error: "Липсва валиден PDF или CSV файл." }, { status: 400 });
        if (file.size > MAX_BYTES)
          return Response.json({ error: "Файлът е твърде голям (макс. 10 MB)." }, { status: 400 });
        const fileName = file.name.slice(0, 300) || "извлечение";
        const bytes = await file.arrayBuffer();
        const fileHash = await sha256Hex(bytes);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("import_previews").delete().lt("expires_at", new Date().toISOString());

        const { data: existing, error: dupError } = await auth.supabase
          .from("statements")
          .select("id")
          .eq("file_hash", fileHash)
          .limit(1);
        if (dupError) return Response.json({ error: "Грешка при проверка на файла." }, { status: 500 });
        if (existing?.length)
          return Response.json({ error: DUPLICATE_STATEMENT, code: "duplicate_statement" }, { status: 409 });

        const isPdf = file.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
        const content = isPdf
          ? [
              { type: "text" as const, text: `Файл: ${fileName}` },
              { type: "file" as const, data: toBase64(new Uint8Array(bytes)), mediaType: "application/pdf", filename: fileName },
            ]
          : [{ type: "text" as const, text: `Файл: ${fileName}\n\n${new TextDecoder().decode(bytes).slice(0, 200_000)}` }];

        const [{ data: custom }, { data: textRules }, { data: rules }] = await Promise.all([
          auth.supabase.from("custom_categories").select("name"),
          auth.supabase.from("category_rules").select("pattern, category"),
          auth.supabase.from("merchant_rules").select("merchant, category, kind"),
        ]);
        const allowed = [...CATEGORIES, ...(custom ?? []).map((c) => c.name)];
        const ruleMap = new Map((rules ?? []).map((r) => [r.merchant.toLowerCase(), r]));

        let parsed: z.infer<typeof aiSchema>;
        try {
          const result = streamText({
            model: createProvider(request).responses(MODEL),
            instructions: `${INSTRUCTIONS}\nПозволени категории (използвай точно тези имена): ${allowed.join(", ")}.`,
            messages: [{ role: "user", content }],
            output: Output.object({ schema: aiSchema }),
            abortSignal: request.signal,
            providerOptions: reasoningOptions,
          });
          parsed = (await result.output) as z.infer<typeof aiSchema>;
        } catch (err) {
          return aiErrorResponse(err);
        }

        const skipped = [...parsed.skipped];
        const rows: PreviewRow[] = [];
        for (const t of parsed.transactions) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
            skipped.push({ description: t.description, reason: "Невалидна дата" });
            continue;
          }
          const money = toEur(t);
          const withdrawal = isWithdrawal(t);
          const rule = ruleMap.get(t.merchant.toLowerCase());
          const textRule = (textRules ?? []).find((r) => ruleMatches(t, r.pattern));
          const baseCategory = allowed.includes(t.category) ? t.category : "Други";
          rows.push({
            date: t.date,
            description: t.description,
            merchant: t.merchant,
            amount: money.eur,
            original_amount: money.original?.original_amount ?? null,
            original_currency: money.original?.original_currency ?? null,
            kind: withdrawal
              ? "expense"
              : textRule
                ? kindForCategory(textRule.category, t.kind)
                : ((rule?.kind ?? t.kind) as Kind),
            category: withdrawal ? "Теглене" : (textRule?.category ?? rule?.category ?? baseCategory),
            needs_review: money.needs_review,
            direction: t.amount < 0 ? "out" : "in",
            overlap: null,
          });
        }

        // Probable overlap with already stored payments: same date and same EUR amount. Warn only.
        const dates = rows.map((r) => r.date).sort();
        if (dates.length) {
          const { data: stored } = await auth.supabase
            .from("transactions")
            .select("tx_date, merchant, amount")
            .gte("tx_date", dates[0]!)
            .lte("tx_date", dates[dates.length - 1]!)
            .limit(1000);
          const index = new Map<string, { merchant: string; date: string; amount: number }>();
          for (const s of stored ?? [])
            index.set(`${s.tx_date}|${Number(s.amount).toFixed(2)}`, { merchant: s.merchant, date: s.tx_date, amount: Number(s.amount) });
          for (const r of rows)
            if (!r.needs_review) r.overlap = index.get(`${r.date}|${r.amount.toFixed(2)}`) ?? null;
        }

        const { data: saved, error: saveError } = await supabaseAdmin
          .from("import_previews")
          .insert({ user_id: auth.userId, file_name: fileName, source: parsed.source, file_hash: fileHash, rows: rows as never })
          .select("id")
          .single();
        if (saveError || !saved)
          return Response.json({ error: "Прегледът не можа да се запази. Опитайте отново." }, { status: 500 });

        const preview: ImportPreview = { previewId: saved.id, fileName, source: parsed.source, transactions: rows, skipped };
        return Response.json(preview);
      },
    },
  },
});
