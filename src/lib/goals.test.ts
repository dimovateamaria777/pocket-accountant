import { describe, expect, it } from "vitest";
import {
  contributionMonths,
  daysLeftInMonth,
  monthBounds,
  monthlyLimitProgress,
  previousMonthBounds,
  savingsProgress,
} from "./goals";

describe("финансови цели", () => {
  it("месечният лимит показва похарчено, оставащо и дни до края на месеца", () => {
    const result = monthlyLimitProgress(150, 95.25, "2026-11-22");
    expect(result.spent).toBe(95.25);
    expect(result.remaining).toBe(54.75);
    expect(result.daysLeft).toBe(8);
    expect(daysLeftInMonth("2026-11-30")).toBe(0);
  });

  it("надхвърленият лимит показва отрицателния остатък и прогрес най-много 100%", () => {
    const result = monthlyLimitProgress(150, 180, "2026-11-22");
    expect(result.remaining).toBe(-30);
    expect(result.percent).toBe(100);
  });

  it("600 € за шест месеца изискват 100 € на месец", () => {
    expect(contributionMonths("2026-11-22", "2027-05-22")).toBe(6);
    const result = savingsProgress(600, 0, "2026-11-22", "2027-05-22");
    expect(result.monthlyRequired).toBe(100);
    expect(result.saved).toBe(0);
  });

  it("ръчните заделяния намаляват оставащата месечна сума", () => {
    const result = savingsProgress(600, 250, "2026-11-22", "2027-05-22");
    expect(result.remaining).toBe(350);
    expect(result.monthlyRequired).toBe(58.33);
  });

  it("приключената цел не изисква нови заделяния", () => {
    const result = savingsProgress(600, 600, "2026-11-22", "2027-05-22");
    expect(result.remaining).toBe(0);
    expect(result.monthlyRequired).toBe(0);
    expect(result.percent).toBe(100);
  });

  it("изтекъл срок изисква цялата оставаща сума, без деление на нула", () => {
    const result = savingsProgress(600, 200, "2026-11-22", "2026-11-01");
    expect(result.overdue).toBe(true);
    expect(result.monthlyRequired).toBe(400);
  });

  it("периодите са реални календарни месеци", () => {
    expect(monthBounds("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousMonthBounds("2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});
