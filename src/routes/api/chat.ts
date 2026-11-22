import { createFileRoute } from "@tanstack/react-router";
import { streamText, tool, convertToModelMessages, isStepCount, type UIMessage } from "ai";
import { z } from "zod";
import { ruleMatches, CATEGORIES, type Tx } from "@/lib/finance";
import { fetchTxSummary, SPENDING_KINDS } from "@/lib/summary";
import { MODEL, createProvider, reasoningOptions, userClientFromRequest, aiErrorResponse } from "@/lib/ai.server";

const filter = z.object({
  category: z.string().nullable().describe("Точно име на категория"),
  merchant: z.string().nullable().describe("Част от името на търговеца"),
  from: z.string().nullable().describe("Начална дата YYYY-MM-DD включително"),
  to: z.string().nullable().describe("Крайна дата YYYY-MM-DD включително"),
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userClientFromRequest(request);
        if (!auth) return Response.json({ error: "Моля, влезте в профила си." }, { status: 401 });
        const { messages } = (await request.json()) as { messages: UIMessage[] };

        // Read-only: the assistant only ever selects rows. It has no tool that writes or deletes.
        // Rule previews need rows; read them page by page so nothing is cut at the API row cap.
        const txs: Tx[] = [];
        for (let from = 0; from < 50_000; from += 1000) {
          const { data, error } = await auth.supabase
            .from("transactions")
            .select("id, tx_date, description, merchant, amount, kind, category")
            .order("tx_date", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + 999);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          txs.push(...(data ?? []).map((t) => ({ ...t, amount: Number(t.amount), kind: t.kind as Tx["kind"] })));
          if ((data ?? []).length < 1000) break;
        }
        const all = await fetchTxSummary(auth.supabase).catch(() => null);
        const range = all?.first_date ? `${all.first_date} до ${all.last_date}` : "няма данни";

        const { data: custom } = await auth.supabase.from("custom_categories").select("name");
        const allCats = [...CATEGORIES, ...(custom ?? []).map((c) => c.name)];

        const tools = {
          propose_rule: tool({
            description:
              "Предлага правило „ако търговецът или описанието съдържа текст → категория“. НЕ записва нищо: потребителят трябва да натисне „Потвърди“. Може да е и нова категория.",
            inputSchema: z.object({
              pattern: z.string().describe("Кратък текст, който се търси, напр. 'purchase of btc'"),
              category: z.string().describe("Име на категория, съществуваща или нова"),
            }),
            execute: async ({ pattern, category }) => {
              const hits = txs.filter((t) => ruleMatches(t, pattern));
              return {
                pattern,
                category,
                is_new_category: !allCats.includes(category),
                matching_count: hits.length,
                examples: hits.slice(0, 5).map((t) => ({ date: t.tx_date, merchant: t.merchant, description: t.description, amount: t.amount })),
                status: "awaiting_user_confirmation",
              };
            },
          }),
          set_transaction_view: tool({
            description:
              "Променя САМО визуалния списък в раздел „Транзакции“: скрива категории, показва само разходи или променя подреждането. Не изтрива и не променя записи. Непосочените полета запазват текущата си стойност.",
            inputSchema: z.object({
              hidden_categories: z.array(z.string()).nullable().describe("Категории, които да се скрият визуално; празен масив показва всички категории"),
              sort: z.enum(["date", "category", "amount"]).nullable().describe("Подреждане по дата, категория или абсолютна големина на сумата"),
              direction: z.enum(["asc", "desc"]).nullable().describe("asc за нарастващо/азбучно, desc за намаляващо; при нова сортировка без посока се избира подходяща автоматично"),
              expenses_only: z.boolean().nullable().describe("true показва само разходи; false показва всички видове"),
              reset: z.boolean().nullable().describe("true връща пълния списък, подреден по дата низходящо"),
            }),
            execute: async (patch) => ({ ...patch, status: "apply_visual_filter_in_ui" }),
          }),
          spending: tool({
            description: "Точна сума на разходите (без вътрешни преводи, с приспаднати възстановени суми) по филтри.",
            inputSchema: filter,
            execute: async (f) => {
              const r = await fetchTxSummary(auth.supabase, { ...f, kinds: SPENDING_KINDS });
              return { total_eur: r.spending_total, count: r.spending_count, sample: r.sample, list: { ...f, scope: "spending" } };
            },
          }),
          income: tool({
            description: "Точна сума на доходите по филтри.",
            inputSchema: filter,
            execute: async (f) => {
              const r = await fetchTxSummary(auth.supabase, { ...f, kinds: ["income"] });
              return { total_eur: r.income_total, count: r.income_count, list: { ...f, scope: "income" } };
            },
          }),
          by_category: tool({
            description: "Разходи по категории за период.",
            inputSchema: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
            execute: async (f) => (await fetchTxSummary(auth.supabase, f)).by_category,
          }),
        };

        try {
          const provider = createProvider(request);
          const result = streamText({
            model: provider.responses(MODEL),
            instructions: `Ти си личен финансов асистент на български, обясняваш просто, без жаргон.
Днес е ${new Date().toISOString().slice(0, 10)}. Данните покриват ${range}.
ВИНАГИ използвай инструментите за всяко число. Никога не смятай или не предполагай суми сам. Цитирай сумата точно както я връща инструментът и кажи от колко транзакции е.
Категории: ${allCats.join(", ")}.
Вътрешните преводи не са разход. Можеш само да четеш данни. Не можеш да триеш или променяш записи. Ако потребителят иска плащания с даден текст да отиват в категория (вкл. нова), извикай propose_rule и му кажи да натисне „Потвърди“ под съобщението. Ако иска да изтрие нещо, обясни, че може сам от „Транзакции“ или „Настройки“.
За заявки като „махни/скрий визуално категория“, „подреди разходите по категория/сума“, „покажи само разходи“ или „покажи всичко отново“ използвай set_transaction_view. Това променя само изгледа, не данните. При „подреди разходите“ задай expenses_only=true. При подреждане по сума използвай amount, а по категория — category. При „махни визуално“ не използвай propose_rule и не променяй категорията. След инструмента обясни кратко какво се показва.`,
            messages: await convertToModelMessages(messages),
            tools,
            stopWhen: isStepCount(5),
            abortSignal: request.signal,
            providerOptions: reasoningOptions,
          });
          return result.toUIMessageStreamResponse({ originalMessages: messages });
        } catch (err) {
          return aiErrorResponse(err);
        }
      },
    },
  },
});
