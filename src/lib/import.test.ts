import { describe, it, expect } from "vitest";
import { toEur, previewDecision, type PreviewRow } from "./import";
import { filterArgs, SPENDING_KINDS } from "./summary";

const row = (p: Partial<PreviewRow>): PreviewRow => ({
  date: "2026-10-01", description: "", merchant: "Lidl", amount: -10, original_amount: null,
  original_currency: null, kind: "expense", category: "Храна", needs_review: false, direction: "out", overlap: null, ...p,
});

describe("суми в евро при импорт", () => {
  it("EUR се взима както е", () => expect(toEur({ amount: -12.34, currency: "EUR", booked_eur: null }).eur).toBe(-12.34));
  it("BGN се дели на 1,95583 в кода", () => {
    const r = toEur({ amount: -19.56, currency: "BGN", booked_eur: null });
    expect(r.eur).toBe(-10.0);
    expect(r.original).toEqual({ original_amount: -19.56, original_currency: "BGN" });
  });
  it("чужда валута с осчетоводена EUR сума използва нея", () =>
    expect(toEur({ amount: -20, currency: "USD", booked_eur: 18.4 }).eur).toBe(-18.4));
  it("чужда валута без EUR сума изисква проверка, без оценка", () => {
    const r = toEur({ amount: -20, currency: "USD", booked_eur: null });
    expect(r.needs_review).toBe(true);
    expect(r.eur).toBe(0);
  });
});

describe("решения в прегледа", () => {
  it("ред без EUR сума блокира, докато не се въведе сума или изключи", () => {
    const rows = [row({}), row({ needs_review: true, amount: 0 })];
    expect(previewDecision(rows, {}, 0).unresolved).toBe(1);
    expect(previewDecision(rows, { 1: { eur: 5 } }, 0)).toMatchObject({ save: 2, unresolved: 0 });
    expect(previewDecision(rows, { 1: { exclude: true } }, 2)).toMatchObject({ save: 1, skip: 3, unresolved: 0 });
  });
});

describe("общи филтри", () => {
  it("разходите включват възстановяванията, но не и преводите", () => {
    expect(filterArgs({ kinds: SPENDING_KINDS }).p_kinds).toEqual(["expense", "refund"]);
  });
});
