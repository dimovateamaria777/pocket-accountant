import { createFileRoute } from "@tanstack/react-router";
import { streamText, Output } from "ai";
import { z } from "zod";
import { CATEGORIES } from "@/lib/finance";
import { MODEL, createProvider, reasoningOptions, userClientFromRequest, aiErrorResponse } from "@/lib/ai.server";

const schema = z.object({
  source: z.string().describe("Банка или приложение, напр. Revolut, ДСК"),
  transactions: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD"),
      description: z.string(),
      merchant: z.string().describe("Разпознато име на търговеца/марката, напр. IKEA вместо ХАОС МАРКЕТ БЪЛГАРИЯ ЕООД"),
      amount_eur: z.number().describe("Сума в евро със знак: минус за излизащи пари, плюс за влизащи"),
      original_amount: z.number().nullable(),
      original_currency: z.string().nullable(),
      kind: z.enum(["expense", "income", "transfer", "refund"]),
      category: z.enum(CATEGORIES),
    }),
  ),
});

const INSTRUCTIONS = `Ти си счетоводител. Извлечи ВСИЧКИ транзакции от банковото извлечение. Не измисляй транзакции.
Правила:
- amount_eur: минус = плащане/изходящо, плюс = входящо. Ако сумата е в лева (BGN), раздели на 1.95583. При друга валута използвай сумата в евро от извлечението, ако има; иначе най-добра оценка и попълни original_amount/original_currency.
- kind="transfer" и category="Вътрешен превод": преводи между собствени сметки на притежателя (напр. Top-up, захранване на Revolut от карта, превод към себе си, обмяна на валута в собствена сметка).
- kind="refund" и category = категорията на първоначалната покупка: върнати пари, refund, reversal, възстановяване, chargeback. НЕ е доход.
- kind="income" и category="Доход": заплата, хонорари, получени преводи от други хора.
- Всичко останало е kind="expense". Плащанията в брой не ни интересуват; тегления от банкомат категоризирай като "Други".
- merchant: разпознай реалната марка зад юридическото име или терминала (SumUp *, ZETTLE_*, ЕООД и т.н.), ако я знаеш.`;

export const Route = createFileRoute("/api/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userClientFromRequest(request);
        if (!auth) return Response.json({ error: "Моля, влезте в профила си." }, { status: 401 });
        const body = (await request.json()) as { fileName: string; mime: string; text?: string; base64?: string };
        if (!body.fileName || (!body.text && !body.base64))
          return Response.json({ error: "Липсва файл." }, { status: 400 });

        const content =
          body.base64
            ? [
                { type: "text" as const, text: `Файл: ${body.fileName}` },
                { type: "file" as const, data: body.base64, mediaType: "application/pdf", filename: body.fileName },
              ]
            : [{ type: "text" as const, text: `Файл: ${body.fileName}\n\n${body.text!.slice(0, 200_000)}` }];

        let parsed: z.infer<typeof schema>;
        try {
          const provider = createProvider(request);
          const result = streamText({
            model: provider.responses(MODEL),
            instructions: INSTRUCTIONS,
            messages: [{ role: "user", content }],
            output: Output.object({ schema }),
            abortSignal: request.signal,
            providerOptions: reasoningOptions,
          });
          parsed = (await result.output) as z.infer<typeof schema>;
        } catch (err) {
          return aiErrorResponse(err);
        }

        const { supabase, userId } = auth;
        const { data: rules } = await supabase.from("merchant_rules").select("merchant, category, kind");
        const ruleMap = new Map((rules ?? []).map((r) => [r.merchant.toLowerCase(), r]));

        const { data: st, error: stErr } = await supabase
          .from("statements")
          .insert({ user_id: userId, file_name: body.fileName, source: parsed.source, tx_count: parsed.transactions.length })
          .select("id")
          .single();
        if (stErr || !st) return Response.json({ error: stErr?.message ?? "Грешка при запис" }, { status: 500 });

        const rows = parsed.transactions
          .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date))
          .map((t) => {
            const rule = ruleMap.get(t.merchant.toLowerCase());
            return {
              user_id: userId,
              statement_id: st.id,
              tx_date: t.date,
              description: t.description,
              merchant: t.merchant,
              amount: Math.round(t.amount_eur * 100) / 100,
              original_amount: t.original_amount,
              original_currency: t.original_currency,
              kind: rule?.kind ?? t.kind,
              category: rule?.category ?? t.category,
            };
          });
        if (rows.length) {
          const { error } = await supabase.from("transactions").insert(rows);
          if (error) return Response.json({ error: error.message }, { status: 500 });
        }
        await supabase.from("statements").update({ tx_count: rows.length }).eq("id", st.id);
        return Response.json({ count: rows.length, source: parsed.source });
      },
    },
  },
});
