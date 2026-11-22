import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { eur } from "@/lib/finance";
import { fetchTxSummary, SPENDING_KINDS } from "@/lib/summary";

export type FinancialGoal = Database["public"]["Tables"]["financial_goals"]["Row"];
export type GoalContribution = Database["public"]["Tables"]["goal_contributions"]["Row"];
export type GoalPeriod = { from: string; to: string };

export interface GoalProposal {
  goal_type: "monthly_limit" | "savings";
  name: string;
  target_amount: number;
  category: string | null;
  deadline: string | null;
  analysis_period: GoalPeriod;
  explanation: string;
  next_step: string;
  historical_spending: number;
  transaction_count: number;
  current_month_spending: number | null;
  monthly_required: number | null;
  insufficient_data: boolean;
  can_confirm: boolean;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Невалидна дата: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

const isoDate = (year: number, month: number, day: number) =>
  `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;

export function todayISO() {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function monthBounds(today: string): GoalPeriod {
  const { year, month } = dateParts(today);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: isoDate(year, month, 1), to: isoDate(year, month, lastDay) };
}

export function previousMonthBounds(today: string): GoalPeriod {
  const { year, month } = dateParts(today);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return monthBounds(isoDate(previousYear, previousMonth, 1));
}

export function daysLeftInMonth(today: string) {
  const { day } = dateParts(today);
  const { to } = monthBounds(today);
  return dateParts(to).day - day;
}

/** Contribution periods are calendar-month steps; a six-month deadline means six contributions. */
export function contributionMonths(today: string, deadline: string) {
  const start = dateParts(today);
  const end = dateParts(deadline);
  const months = (end.year - start.year) * 12 + end.month - start.month;
  return Math.max(1, months);
}

export function monthlyLimitProgress(target: number, spent: number, today: string) {
  const normalizedSpent = round2(Math.max(0, spent));
  return {
    spent: normalizedSpent,
    remaining: round2(target - normalizedSpent),
    daysLeft: daysLeftInMonth(today),
    percent: Math.min(100, Math.max(0, (normalizedSpent / target) * 100)),
  };
}

export function savingsProgress(target: number, saved: number, today: string, deadline: string) {
  const normalizedSaved = round2(Math.max(0, saved));
  const remaining = round2(Math.max(0, target - normalizedSaved));
  const months = contributionMonths(today, deadline);
  return {
    saved: normalizedSaved,
    remaining,
    months,
    monthlyRequired: remaining === 0 ? 0 : round2(remaining / months),
    percent: Math.min(100, Math.max(0, (normalizedSaved / target) * 100)),
    overdue: deadline < today,
  };
}

export function formatDate(value: string) {
  const { year, month, day } = dateParts(value);
  return `${day.toString().padStart(2, "0")}.${month.toString().padStart(2, "0")}.${year}`;
}

export function formatPeriod(period: GoalPeriod) {
  return `${formatDate(period.from)} – ${formatDate(period.to)}`;
}

export function goalsQuery() {
  return queryOptions({
    queryKey: ["financial-goals"],
    queryFn: async () => {
      const [goalsResult, contributionsResult] = await Promise.all([
        supabase.from("financial_goals").select("*").order("created_at", { ascending: false }),
        supabase
          .from("goal_contributions")
          .select("*")
          .order("contribution_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      if (goalsResult.error) throw goalsResult.error;
      if (contributionsResult.error) throw contributionsResult.error;
      return {
        goals: (goalsResult.data ?? []).map((goal) => ({
          ...goal,
          target_amount: Number(goal.target_amount),
        })),
        contributions: (contributionsResult.data ?? []).map((contribution) => ({
          ...contribution,
          amount: Number(contribution.amount),
        })),
      };
    },
  });
}

export function goalMonthSummaryQuery(today: string) {
  const period = monthBounds(today);
  const filter = { ...period, kinds: SPENDING_KINDS };
  return queryOptions({
    queryKey: ["transactions", "summary", filter],
    queryFn: () => fetchTxSummary(supabase, filter),
  });
}

export async function createGoalFromProposal(proposal: GoalProposal) {
  if (!proposal.can_confirm) throw new Error("Няма достатъчно данни за потвърждение на тази цел.");
  const values = {
    name: proposal.name.trim(),
    goal_type: proposal.goal_type,
    target_amount: proposal.target_amount,
    category: proposal.goal_type === "monthly_limit" ? proposal.category : null,
    deadline: proposal.goal_type === "savings" ? proposal.deadline : null,
  };
  if (!values.name || !(values.target_amount > 0)) throw new Error("Целта няма валидно име или сума.");
  if (values.goal_type === "monthly_limit" && !values.category)
    throw new Error("Изберете категория за месечния лимит.");
  if (values.goal_type === "savings" && !values.deadline)
    throw new Error("Изберете крайна дата за спестяването.");
  const { data, error } = await supabase.from("financial_goals").insert(values).select("id").single();
  if (error) throw error;
  return data.id;
}

export function goalSummary(proposal: GoalProposal) {
  return proposal.goal_type === "monthly_limit"
    ? `${eur(proposal.target_amount)} месечен лимит за ${proposal.category}`
    : `${eur(proposal.target_amount)} до ${proposal.deadline ? formatDate(proposal.deadline) : "—"}`;
}
