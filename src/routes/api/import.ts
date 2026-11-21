import { createFileRoute } from "@tanstack/react-router";
import { streamText, Output } from "ai";
import { z } from "zod";
import { CATEGORIES, ruleMatches, kindForCategory, isWithdrawal } from "@/lib/finance";
import { importTransactionSchema, type ImportPreview } from "@/lib/import";
import { MODEL, createProvider, reasoningOptions, userClientFromRequest, aiErrorResponse } from "@/lib/ai.server";

const aiSchema = z.object({
  source: z.string().min(1).max(100).describe("Банка или приложение, напр. Revolut, ДСК"),
  transactions: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD"),
      description: z.string().min(1).max(2000),
      merchant: z.string().min(1).max(300).describe("Разпознато име на търговеца/марката, напр. IKEA вместо ХАОС МАРКЕТ БЪЛГАРИЯ ЕООД"),
      amount_eur: z.number().finite().describe("Сума в евро със знак: минус за излизащи пари, плюс за влизащи"),
      original_amount: z.number().finite().nullable(),
      original_currency: z.string().max(3).nullable(),
      kind: z.enum(["expense", "income", "transfer", "refund"]),
      category: z.string().min(1).max(100).describe("Една от позволените категории"),
    }),
  ).max(5000),
});

const fileSchema = z.object({
  mode: z.literal("preview").optional(),
  fileName: z.string().min(1).max(300),
  mime: z.string().max(100),
  text: z.string().max(200_000).optional(),
  base64: z.string().max(15_000_000).optional(),
}).refine((body) => body.text || body.base64, { message: "Липсва файл." });

const saveSchema = z.object({
  mode: z.literal("save"),
  fileName: z.string().min(1).max(300),
  source: z.string().min(1).max(100),
  transactions: z.array(importTransactionSchema).min(1).max(5000),
});

const INSTRUCTIONS = `Ти си счетоводител. Извлечи ВСИЧКИ транзакции от банковото извлечение. Не измисляй транзакции.
Правила:
- amount_eur: минус = плащане/изходящо, плюс = входящо. Ако сумата е в лева (BGN), раздели на 1.95583. При друга валута използвай сумата в евро от извлечението, ако има; иначе най-добра оценка и попълни original_amount/original_currency.
- kind="transfer" и category="Вътрешен превод": преводи между собствени сметки на притежателя (напр. Top-up, захранване на Revolut от карта, превод към себе си, обмяна на валута в собствена сметка).
- kind="refund" и category = категорията на първоначалната покупка: върнати пари, refund, reversal, възстановяване, chargeback. НЕ е доход.
- kind="income" и category="Доход": заплата, хонорари, получени преводи от други хора.
- Всичко останало е kind="expense". Плащанията в брой не ни интересуват; тегления от банкомат категоризирай като "Теглене".
- merchant: разпознай реалната марка зад юридическото име или терминала (SumUp *, ZETTLE_*, ЕООД и т.н.), ако я знаеш.`;

export const Route = createFileRoute("/api/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userClientFromRequest(request);
        if (!auth) return Response.json({ error: "Моля, влезте в профила си." }, { status: 401 });
        const rawBody: unknown = await request.json();

        if (typeof rawBody === "object" && rawBody !== null && "mode" in rawBody && rawBody.mode === "save") {
          const parsedBody = saveSchema.safeParse(rawBody);
          if (!parsedBody.success) return Response.json({ error: "Данните за запис са невалидни." }, { status: 400 });
          const body = parsedBody.data;
          const { data: statement, error: statementError } = await auth.supabase
            .from("statements")
            .insert({ user_id: auth.userId, file_name: body.fileName, source: body.source, tx_count: body.transactions.length })
            .select("id")
            .single();
          if (statementError || !statement) return Response.json({ error: statementError?.message ?? "Грешка при запис" }, { status: 500 });

          const rows = body.transactions.map((t) => ({
            user_id: auth.userId,
            statement_id: statement.id,
            tx_date: t.date,
            description: t.description,
            merchant: t.merchant,
            amount: Math.round(t.amount * 100) / 100,
            original_amount: t.original_amount,
            original_currency: t.original_currency,
            kind: t.kind,
            category: t.category,
          }));
          const { error } = await auth.supabase.from("transactions").insert(rows);
          if (error) {
            await auth.supabase.from("statements").delete().eq("id", statement.id);
            return Response.json({ error: error.message }, { status: 500 });
          }
          return Response.json({ count: rows.length, source: body.source });
        }

        const parsedBody = fileSchema.safeParse(rawBody);
        if (!parsedBody.success) return Response.json({ error: "Липсва валиден PDF или CSV файл." }, { status: 400 });
        const body = parsedBody.data;
        const content = body.base64
          ? [
              { type: "text" as const, text: `Файл: ${body.fileName}` },
              { type: "file" as const, data: body.base64, mediaType: "application/pdf", filename: body.fileName },
            ]
          : [{ type: "text" as const, text: `Файл: ${body.fileName}\n\n${body.text!}` }];

        const [{ data: custom }, { data: textRules }, { data: rules }] = await Promise.all([
          auth.supabase.from("custom_categories").select("name"),
          auth.supabase.from("category_rules").select("pattern, category"),
          auth.supabase.from("merchant_rules").select("merchant, category, kind"),
        ]);
        const allowed = [...CATEGORIES, ...(custom ?? []).map((c) => c.name)];
        const ruleMap = new Map((rules ?? []).map((r) => [r.merchant.toLowerCase(), r]));

        let parsed: z.infer<typeof aiSchema>;
        try {
          const provider = createProvider(request);
          const result = streamText({
            model: provider.responses(MODEL),
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

        const transactions = parsed.transactions
          .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date))
          .map((t) => {
            const withdrawal = isWithdrawal(t);
            const rule = ruleMap.get(t.merchant.toLowerCase());
            const textRule = (textRules ?? []).find((r) => ruleMatches(t, r.pattern));
            const baseCategory = allowed.includes(t.category) ? t.category : "Други";
            return {
              date: t.date,
              description: t.description,
              merchant: t.merchant,
              amount: Math.round(t.amount_eur * 100) / 100,
              original_amount: t.original_amount,
              original_currency: t.original_currency,
              kind: withdrawal ? "expense" as const : textRule ? kindForCategory(textRule.category, t.kind) : (rule?.kind ?? t.kind) as ImportPreview["transactions"][number]["kind"],
              category: withdrawal ? "Теглене" : textRule?.category ?? rule?.category ?? baseCategory,
            };
          });
        const preview: ImportPreview = { fileName: body.fileName, source: parsed.source, transactions };
        return Response.json(preview);
      },
    },
  },
});
