import { createFileRoute } from "@tanstack/react-router";
import { streamText, tool, convertToModelMessages, isStepCount, type UIMessage } from "ai";
import { z } from "zod";
import { computeSpending, computeIncome, spendingByCategory, CATEGORIES, type Tx } from "@/lib/finance";
import { MODEL, createProvider, reasoningOptions, userClientFromRequest, aiErrorResponse } from "@/lib/ai.server";

const filter = z.object({
  category: z.enum(CATEGORIES).nullable(),
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
        const { data, error } = await auth.supabase
          .from("transactions")
          .select("id, tx_date, description, merchant, amount, kind, category")
          .order("tx_date", { ascending: true })
          .limit(10000);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const txs: Tx[] = (data ?? []).map((t) => ({ ...t, amount: Number(t.amount), kind: t.kind as Tx["kind"] }));
        const range = txs.length ? `${txs[0]!.tx_date} до ${txs[txs.length - 1]!.tx_date}` : "няма данни";

        const tools = {
          spending: tool({
            description: "Точна сума на разходите (без вътрешни преводи, с приспаднати възстановени суми) по филтри.",
            inputSchema: filter,
            execute: async (f) => {
              const r = computeSpending(txs, f);
              return { total_eur: r.total, count: r.count, sample: r.items.slice(-15).map((t) => ({ date: t.tx_date, merchant: t.merchant, amount: t.amount, kind: t.kind })) };
            },
          }),
          income: tool({
            description: "Точна сума на доходите по филтри.",
            inputSchema: filter,
            execute: async (f) => {
              const r = computeIncome(txs, f);
              return { total_eur: r.total, count: r.count };
            },
          }),
          by_category: tool({
            description: "Разходи по категории за период.",
            inputSchema: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
            execute: async (f) => spendingByCategory(txs, f),
          }),
        };

        try {
          const provider = createProvider(request);
          const result = streamText({
            model: provider.responses(MODEL),
            instructions: `Ти си личен финансов асистент на български, обясняваш просто, без жаргон.
Днес е ${new Date().toISOString().slice(0, 10)}. Данните покриват ${range}.
ВИНАГИ използвай инструментите за всяко число. Никога не смятай или не предполагай суми сам. Цитирай сумата точно както я връща инструментът и кажи от колко транзакции е.
Вътрешните преводи не са разход. Можеш само да четеш данни; ако те помолят да изтриеш или промениш нещо, обясни, че нямаш такова право и че потребителят може да го направи сам от "Транзакции".`,
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
