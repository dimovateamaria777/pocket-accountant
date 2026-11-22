import { describe, it, expect } from "vitest";
import {
  computeSpending,
  computeIncome,
  spendingByCategory,
  incomeByCategory,
  investmentsByDestination,
  type Tx,
} from "./finance";

const tx = (p: Partial<Tx>): Tx => ({
  id: Math.random().toString(),
  tx_date: "2026-10-05",
  description: "",
  merchant: "Billa",
  amount: -10,
  kind: "expense",
  category: "Храна",
  ...p,
});

describe("правила за отчетите", () => {
  it("сумира разходите за категория", () => {
    const r = computeSpending(
      [tx({ amount: -12.5 }), tx({ amount: -7.5 }), tx({ category: "Транспорт", amount: -3 })],
      { category: "Храна" },
    );
    expect(r.total).toBe(20);
    expect(r.count).toBe(2);
  });
  it("вътрешните преводи не се броят", () => {
    const r = computeSpending([
      tx({ amount: -50 }),
      tx({ kind: "transfer", category: "Вътрешен превод", amount: -200 }),
    ]);
    expect(r.total).toBe(50);
  });
  it("върнатите пари се приспадат от разхода, а не са доход", () => {
    const txs = [tx({ amount: -40 }), tx({ kind: "refund", amount: 15 })];
    expect(computeSpending(txs, { category: "Храна" }).total).toBe(25);
    expect(computeIncome(txs).total).toBe(0);
  });
  it("филтър по период", () => {
    const r = computeSpending([tx({ tx_date: "2026-09-30" }), tx({ tx_date: "2026-10-01" })], {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(r.count).toBe(1);
  });
  it("нова собствена категория се показва в диаграмата с 0 €", () => {
    const rows = spendingByCategory([tx({ amount: -20 })], {}, ["Инвестиции"]);
    expect(rows).toEqual([
      { category: "Храна", total: 20 },
      { category: "Инвестиции", total: 0 },
    ]);
  });
  it("категория с приход получава дял в диаграмата за доходи", () => {
    const rows = incomeByCategory([
      tx({ kind: "income", category: "Заплата", amount: 2000 }),
      tx({ kind: "income", category: "Наем", amount: 500 }),
    ]);
    expect(rows).toEqual([
      { category: "Заплата", total: 2000 },
      { category: "Наем", total: 500 },
    ]);
  });
  it("инвестициите се групират по закупения актив, а не само по Revolut", () => {
    const rows = investmentsByDestination([
      tx({ merchant: "Revolut", description: "Purchase of BTC", category: "Инвестиции", amount: -100 }),
      tx({ merchant: "Revolut", description: "purchase of btc", category: "Инвестиции", amount: -50 }),
      tx({ merchant: "Revolut", description: "Purchase of ETH", category: "Инвестиции", amount: -30 }),
    ]);
    expect(rows).toEqual([
      { destination: "BTC", total: 150 },
      { destination: "ETH", total: 30 },
    ]);
  });
  it("възстановената инвестиция намалява сумата за съответния актив", () => {
    const rows = investmentsByDestination([
      tx({ merchant: "Revolut", description: "Purchase of BTC", category: "Инвестиции", amount: -100 }),
      tx({ merchant: "Revolut", description: "Purchase of BTC", category: "Инвестиции", kind: "refund", amount: 20 }),
    ]);
    expect(rows).toEqual([{ destination: "BTC", total: 80 }]);
  });
  it("вътрешен превод в инвестиционна категория не се брои като инвестиция", () => {
    const rows = investmentsByDestination([
      tx({ merchant: "Собствена сметка", category: "Инвестиции", kind: "transfer", amount: -500 }),
    ]);
    expect(rows).toEqual([]);
  });
});

import { isWithdrawal, ruleMatches } from "./finance";
describe("правила по текст", () => {
  it("„purchase of btc“ хваща Revolut покупка на BTC без значение от главни букви", () => {
    expect(
      ruleMatches({ merchant: "Revolut", description: "Purchase of  BTC" }, "purchase of btc"),
    ).toBe(true);
    expect(
      ruleMatches({ merchant: "Revolut", description: "Purchase of ETH" }, "purchase of btc"),
    ).toBe(false);
  });
  it("всеки запис с „теглене“ се разпознава за категория Теглене", () => {
    expect(isWithdrawal({ merchant: "Банкомат", description: "Теглене на пари" })).toBe(true);
    expect(isWithdrawal({ merchant: "Revolut", description: "ATM ТЕГЛЕНЕ" })).toBe(true);
    expect(isWithdrawal({ merchant: "Billa", description: "Покупка" })).toBe(false);
  });
});
