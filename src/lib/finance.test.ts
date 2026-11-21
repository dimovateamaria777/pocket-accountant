import { describe, it, expect } from "vitest";
import { computeSpending, computeIncome, type Tx } from "./finance";

const tx = (p: Partial<Tx>): Tx => ({
  id: Math.random().toString(), tx_date: "2026-10-05", description: "", merchant: "Billa",
  amount: -10, kind: "expense", category: "Храна", ...p,
});

describe("правила за отчетите", () => {
  it("сумира разходите за категория", () => {
    const r = computeSpending([tx({ amount: -12.5 }), tx({ amount: -7.5 }), tx({ category: "Транспорт", amount: -3 })], { category: "Храна" });
    expect(r.total).toBe(20);
    expect(r.count).toBe(2);
  });
  it("вътрешните преводи не се броят", () => {
    const r = computeSpending([tx({ amount: -50 }), tx({ kind: "transfer", category: "Вътрешен превод", amount: -200 })]);
    expect(r.total).toBe(50);
  });
  it("върнатите пари се приспадат от разхода, а не са доход", () => {
    const txs = [tx({ amount: -40 }), tx({ kind: "refund", amount: 15 })];
    expect(computeSpending(txs, { category: "Храна" }).total).toBe(25);
    expect(computeIncome(txs).total).toBe(0);
  });
  it("филтър по период", () => {
    const r = computeSpending([tx({ tx_date: "2026-09-30" }), tx({ tx_date: "2026-10-01" })], { from: "2026-10-01", to: "2026-10-31" });
    expect(r.count).toBe(1);
  });
});

import { isWithdrawal, ruleMatches } from "./finance";
describe("правила по текст", () => {
  it("„purchase of btc“ хваща Revolut покупка на BTC без значение от главни букви", () => {
    expect(ruleMatches({ merchant: "Revolut", description: "Purchase of  BTC" }, "purchase of btc")).toBe(true);
    expect(ruleMatches({ merchant: "Revolut", description: "Purchase of ETH" }, "purchase of btc")).toBe(false);
  });
  it("всеки запис с „теглене“ се разпознава за категория Теглене", () => {
    expect(isWithdrawal({ merchant: "Банкомат", description: "Теглене на пари" })).toBe(true);
    expect(isWithdrawal({ merchant: "Revolut", description: "ATM ТЕГЛЕНЕ" })).toBe(true);
    expect(isWithdrawal({ merchant: "Billa", description: "Покупка" })).toBe(false);
  });
});
