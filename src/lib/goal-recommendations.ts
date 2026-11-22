import { eur } from "@/lib/finance";
import {
  formatPeriod,
  savingsProgress,
  type GoalPeriod,
  type GoalProposal,
} from "@/lib/goals";
import type { TxSummary } from "@/lib/summary";

export function buildMonthlyLimitProposal({
  category,
  targetAmount,
  previous,
  current,
  previousPeriod,
  currentPeriod,
}: {
  category: string;
  targetAmount: number;
  previous: TxSummary;
  current: TxSummary;
  previousPeriod: GoalPeriod;
  currentPeriod: GoalPeriod;
}): GoalProposal {
  const hasPrevious = previous.spending_count > 0;
  const evidence = hasPrevious ? previous : current;
  const analysisPeriod = hasPrevious ? previousPeriod : currentPeriod;
  const count = evidence.spending_count;
  const spent = evidence.spending_total;
  const hasData = count > 0;
  const difference = Math.round((spent - targetAmount) * 100) / 100;
  let explanation: string;
  if (!hasData) {
    explanation = `Няма записани разходи за ${category} нито през ${formatPeriod(previousPeriod)}, нито през текущия месец. Не мога да препоръчам лимит от реални данни.`;
  } else if (!hasPrevious) {
    explanation = `Няма записи за ${category} през ${formatPeriod(previousPeriod)}. От началото на текущия месец до момента има ${eur(spent)} от ${count} плащания, затова предложението използва непълния текущ период.`;
  } else if (difference > 0) {
    explanation = `През ${formatPeriod(analysisPeriod)} сте похарчили ${eur(spent)} за ${category} от ${count} плащания. Лимит от ${eur(targetAmount)} би освободил ${eur(difference)}, ако разходите ви иначе останат същите.`;
  } else {
    const reserve = Math.abs(difference);
    explanation = `През ${formatPeriod(analysisPeriod)} сте похарчили ${eur(spent)} за ${category} от ${count} плащания. Лимит от ${eur(targetAmount)} ${reserve > 0 ? `оставя резерв от ${eur(reserve)} спрямо този период` : "съвпада с разхода за този период"}.`;
  }
  return {
    goal_type: "monthly_limit",
    name: `До ${eur(targetAmount)} за ${category}`,
    target_amount: targetAmount,
    category,
    deadline: null,
    analysis_period: analysisPeriod,
    explanation,
    next_step: hasData
      ? "Потвърдете целта, за да следите оставащата сума до края на месеца."
      : "Добавете транзакции за тази категория и поискайте ново предложение.",
    historical_spending: spent,
    transaction_count: count,
    current_month_spending: current.spending_total,
    monthly_required: null,
    insufficient_data: !hasData,
    can_confirm: hasData,
  };
}

export function buildSavingsGoalProposal({
  name,
  targetAmount,
  deadline,
  today,
  previousPeriod,
  summary,
}: {
  name: string;
  targetAmount: number;
  deadline: string;
  today: string;
  previousPeriod: GoalPeriod;
  summary: TxSummary;
}): GoalProposal {
  const monthlyRequired = savingsProgress(targetAmount, 0, today, deadline).monthlyRequired;
  const hasData = summary.tx_count > 0;
  const calculation = `За цел от ${eur(targetAmount)} до ${deadline} са необходими ${eur(monthlyRequired)} на месец.`;
  const explanation = hasData
    ? `През ${formatPeriod(previousPeriod)} има ${eur(summary.spending_total)} нетни разходи от ${summary.spending_count} плащания и ${eur(summary.income_total)} доходи от ${summary.income_count} плащания. ${calculation}`
    : `Няма записани транзакции през ${formatPeriod(previousPeriod)}. ${calculation} Сумата е изчислена само от целта и срока, без препоръка според вашите разходи.`;
  return {
    goal_type: "savings",
    name,
    target_amount: targetAmount,
    category: null,
    deadline,
    analysis_period: previousPeriod,
    explanation,
    next_step: "Потвърдете целта и добавете първата заделена сума.",
    historical_spending: summary.spending_total,
    transaction_count: summary.tx_count,
    current_month_spending: null,
    monthly_required: monthlyRequired,
    insufficient_data: !hasData,
    can_confirm: deadline > today,
  };
}
