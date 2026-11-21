import { describe, expect, it } from "vitest";
import type { Tx } from "./finance";
import {
  DEFAULT_TRANSACTION_VIEW,
  applyTransactionViewPatch,
  visibleTransactions,
  type TransactionView,
} from "./transaction-view";

const tx = (patch: Partial<Tx>): Tx => ({
  id: Math.random().toString(),
  tx_date: "2026-10-05",
  description: "",
  merchant: "Търговец",
  amount: -10,
  kind: "expense",
  category: "Храна",
  ...patch,
});

const view = (patch: Partial<TransactionView>): TransactionView => ({
  ...DEFAULT_TRANSACTION_VIEW,
  ...patch,
});

describe("изглед на транзакциите", () => {
  it("скрива само визуално избраната категория, без да променя записите", () => {
    const txs = [
      tx({ merchant: "Брокер", category: "Инвестиции" }),
      tx({ merchant: "Lidl", category: "Храна" }),
    ];
    const shown = visibleTransactions(txs, view({ hiddenCategories: ["инвестиции"] }));

    expect(shown.map((item) => item.merchant)).toEqual(["Lidl"]);
    expect(txs).toHaveLength(2);
    expect(txs[0]?.category).toBe("Инвестиции");
  });

  it("показва само разходи и ги подрежда по категория, а не по дата", () => {
    const txs = [
      tx({ tx_date: "2026-10-01", category: "Транспорт" }),
      tx({ tx_date: "2026-10-03", category: "Храна" }),
      tx({ tx_date: "2026-10-02", category: "Доход", kind: "income", amount: 500 }),
    ];
    const shown = visibleTransactions(txs, view({ sort: "category", direction: "asc", expensesOnly: true }));

    expect(shown.map((item) => item.category)).toEqual(["Транспорт", "Храна"]);
    expect(shown.every((item) => item.kind === "expense")).toBe(true);
  });

  it("подрежда разходите по големина на сумата, независимо от знака минус", () => {
    const txs = [
      tx({ merchant: "Малък", amount: -10 }),
      tx({ merchant: "Голям", amount: -100 }),
      tx({ merchant: "Среден", amount: -40 }),
    ];
    const shown = visibleTransactions(
      txs,
      view({ sort: "amount", direction: "desc", expensesOnly: true }),
    );

    expect(shown.map((item) => item.merchant)).toEqual(["Голям", "Среден", "Малък"]);
  });

  it("нова команда за сортиране запазва активното скриване на категория", () => {
    const current = view({ hiddenCategories: ["Инвестиции"] });
    const next = applyTransactionViewPatch(current, { sort: "amount" });

    expect(next.hiddenCategories).toEqual(["Инвестиции"]);
    expect(next.sort).toBe("amount");
    expect(next.direction).toBe("desc");
  });
});
