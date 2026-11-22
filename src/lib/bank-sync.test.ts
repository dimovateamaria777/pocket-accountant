import { describe, expect, it } from "vitest";
import { bankEntryId, parseBankTransactions, planBankRows } from "./bank-sync";

const tx = (over: Record<string, unknown> = {}) => ({
  entry_reference: null,
  transaction_id: null,
  transaction_amount: { currency: "EUR", amount: "12.50" },
  credit_debit_indicator: "DBIT",
  status: "BOOK",
  booking_date: "2026-11-20",
  value_date: null,
  transaction_date: null,
  creditor: { name: "Shop", postal_address: null },
  debtor: null,
  bank_transaction_code: { description: "Card", code: null },
  remittance_information: ["Coffee"],
  ...over,
});
const row = (external_id: string | null, amount = -12.5) => ({
  tx_date: "2026-11-20",
  amount,
  description: "Coffee",
  external_id,
});
const empty = () => ({ externalIds: new Set<string>(), fingerprints: new Set<string>(), reviewKeys: new Set<string>() });

describe("bank sync", () => {
  it("accepts rows where the bank sends null for absent fields", () => {
    const result = parseBankTransactions([tx({ entry_reference: "A1" })]);
    expect(result.invalid).toBe(0);
    expect(bankEntryId(result.valid[0]!)).toBe("A1");
  });

  it("skips only the broken row, not the whole page", () => {
    const result = parseBankTransactions([tx(), { transaction_amount: null }]);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toBe(1);
  });

  it("saves two identical purchases with different bank ids", () => {
    const plan = planBankRows([row("A1"), row("A2")], empty());
    expect(plan.insert.map((r) => r.external_id)).toEqual(["A1", "A2"]);
    expect(plan.review).toHaveLength(0);
  });

  it("does not add a row whose bank id is already saved", () => {
    const known = { ...empty(), externalIds: new Set(["A1"]) };
    const plan = planBankRows([row("A1")], known);
    expect(plan.insert).toHaveLength(0);
    expect(plan.knownByBankId).toBe(1);
  });

  it("flags a row without bank id that matches an existing payment", () => {
    const known = { ...empty(), fingerprints: new Set(["2026-11-20|-12.50|coffee"]) };
    const plan = planBankRows([row(null)], known);
    expect(plan.insert).toHaveLength(0);
    expect(plan.review[0]?.reason).toBe("matches_existing");
  });

  it("gives two identical payments without bank id separate review items, without copies on resync", () => {
    const first = planBankRows([row(null), row(null)], empty());
    expect(first.review.map((r) => r.key)).toEqual([
      "fp:2026-11-20|-12.50|coffee:0",
      "fp:2026-11-20|-12.50|coffee:1",
    ]);
    const second = planBankRows([row(null), row(null)], {
      ...empty(),
      reviewKeys: new Set(first.review.map((r) => r.key)),
    });
    expect(second.review).toHaveLength(0);
    expect(second.alreadyInReview).toBe(2);
  });

  it("does not bring back a decided review item", () => {
    const plan = planBankRows([row(null), row(null)], {
      ...empty(),
      externalIds: new Set(["fp:2026-11-20|-12.50|coffee:0"]),
      reviewKeys: new Set(["fp:2026-11-20|-12.50|coffee:1"]),
    });
    expect(plan.insert).toHaveLength(0);
    expect(plan.review).toHaveLength(0);
    expect(plan.alreadyDecided + plan.alreadyInReview).toBe(2);
  });
});
