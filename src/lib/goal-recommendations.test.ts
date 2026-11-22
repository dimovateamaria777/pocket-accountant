import { describe, expect, it } from "vitest";
import { buildMonthlyLimitProposal, buildSavingsGoalProposal } from "./goal-recommendations";
import type { TxSummary } from "./summary";

function summary(patch: Partial<TxSummary> = {}): TxSummary {
  return {
    spending_total: 0,
    spending_count: 0,
    income_total: 0,
    income_count: 0,
    transfer_count: 0,
    tx_count: 0,
    first_date: null,
    last_date: null,
    by_category: [],
    by_category_merchant: [],
    income_by_source: [],
    investments: [],
    by_month: [],
    top_merchants: [],
    sample: [],
    ...patch,
  };
}

describe("предложения за цели", () => {
  it("180 € разход и лимит 150 € дават точно 30 € потенциално освободени", () => {
    const proposal = buildMonthlyLimitProposal({
      category: "Ресторанти и кафе",
      targetAmount: 150,
      previous: summary({ spending_total: 180, spending_count: 9, tx_count: 9 }),
      current: summary(),
      previousPeriod: { from: "2026-10-01", to: "2026-10-31" },
      currentPeriod: { from: "2026-11-01", to: "2026-11-30" },
    });
    expect(proposal.historical_spending).toBe(180);
    expect(proposal.transaction_count).toBe(9);
    expect(proposal.analysis_period).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(proposal.explanation).toContain("30,00");
    expect(proposal.can_confirm).toBe(true);
  });

  it("без транзакции не позволява потвърждение на препоръчан месечен лимит", () => {
    const proposal = buildMonthlyLimitProposal({
      category: "Храна",
      targetAmount: 150,
      previous: summary(),
      current: summary(),
      previousPeriod: { from: "2026-10-01", to: "2026-10-31" },
      currentPeriod: { from: "2026-11-01", to: "2026-11-30" },
    });
    expect(proposal.insufficient_data).toBe(true);
    expect(proposal.can_confirm).toBe(false);
  });

  it("спестяването използва реалния период и изчислена месечна вноска", () => {
    const proposal = buildSavingsGoalProposal({
      name: "Почивка",
      targetAmount: 600,
      deadline: "2027-05-22",
      today: "2026-11-22",
      previousPeriod: { from: "2026-10-01", to: "2026-10-31" },
      summary: summary({ tx_count: 12, spending_total: 500, spending_count: 10, income_total: 1200, income_count: 2 }),
    });
    expect(proposal.monthly_required).toBe(100);
    expect(proposal.transaction_count).toBe(12);
    expect(proposal.insufficient_data).toBe(false);
    expect(proposal.next_step).toContain("първата заделена сума");
  });
});
