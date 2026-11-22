import { describe, expect, it } from "vitest";
import {
  infoPayToImportRow,
  resolveInfoPayNextUrl,
  type InfoPayTransaction,
} from "./infopay";

const tx = (patch: Partial<InfoPayTransaction> = {}): InfoPayTransaction => ({
  EntryReference: "entry-123",
  BookingDate: "2026-11-20T10:30:00Z",
  TransactionAmount: { amount: "100.00", currency: "BGN" },
  TransactionType: "Debit",
  CreditorName: "Lidl",
  RemittanceInformationUnstructured: "Покупка с карта",
  ...patch,
});

describe("InfoPay движения", () => {
  it("дебитното движение в лева става отрицателен разход в евро", () => {
    const result = infoPayToImportRow(tx(), "account-1", "connection-1", "user-1");
    expect(result.row).toMatchObject({
      amount: -51.13,
      original_amount: 100,
      original_currency: "BGN",
      kind: "expense",
      merchant: "Lidl",
      external_id: "entry-123",
    });
  });

  it("възстановяването е положителна сума и не става доход", () => {
    const result = infoPayToImportRow(
      tx({
        TransactionType: "Credit",
        TransactionAmount: { amount: "20.00", currency: "EUR" },
        DebtorName: "Lidl",
        RemittanceInformationUnstructured: "Refund for purchase",
      }),
      "account-1",
      "connection-1",
      "user-1",
    );
    expect(result.row).toMatchObject({ amount: 20, kind: "refund" });
  });

  it("движение без стабилна референция се пропуска вместо да се дублира", () => {
    const result = infoPayToImportRow(
      tx({ EntryReference: null, TransactionExternalId: null, TransactionId: null }),
      "account-1",
      "connection-1",
      "user-1",
    );
    expect(result).toEqual({ skipped: "missing_reference" });
  });

  it("страницирането не може да изпрати сесията към чужд адрес", () => {
    expect(resolveInfoPayNextUrl("/api/accounts/a/transactions?page=2")).toBe(
      "https://integration.infopay.bg/api/accounts/a/transactions?page=2",
    );
    expect(() => resolveInfoPayNextUrl("https://example.com/api/accounts/a/transactions")).toThrow(
      "невалиден адрес",
    );
  });
});
