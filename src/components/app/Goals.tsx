import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PiggyBank, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { eur } from "@/lib/finance";
import {
  formatDate,
  goalMonthSummaryQuery,
  goalsQuery,
  monthlyLimitProgress,
  savingsProgress,
  todayISO,
  type FinancialGoal,
  type GoalContribution,
} from "@/lib/goals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function Goals({ onCreateWithAssistant }: { onCreateWithAssistant: () => void }) {
  const [today] = useState(todayISO);
  const goals = useQuery(goalsQuery());
  const monthSummary = useQuery(goalMonthSummaryQuery(today));
  const qc = useQueryClient();
  const contributionsByGoal = useMemo(() => {
    const map = new Map<string, GoalContribution[]>();
    for (const contribution of goals.data?.contributions ?? []) {
      const rows = map.get(contribution.goal_id) ?? [];
      rows.push(contribution);
      map.set(contribution.goal_id, rows);
    }
    return map;
  }, [goals.data]);

  async function deleteGoal(goal: FinancialGoal) {
    const { error } = await supabase.from("financial_goals").delete().eq("id", goal.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["financial-goals"] });
    toast.success("Целта и нейните ръчни заделяния са изтрити.");
  }

  const monthlyGoals = (goals.data?.goals ?? []).filter((goal) => goal.goal_type === "monthly_limit");
  const savingsGoals = (goals.data?.goals ?? []).filter((goal) => goal.goal_type === "savings");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold">Финансови цели</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Лимитите се обновяват от записаните плащания. Асистентът предлага, а вие решавате дали да
            запишете целта.
          </p>
        </div>
        <Button onClick={onCreateWithAssistant} className="shrink-0">
          <Sparkles /> Създай цел с асистента
        </Button>
      </div>

      {goals.isLoading ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">Зареждане на целите…</p>
      ) : goals.error ? (
        <p className="rounded-2xl border bg-card p-8 text-center text-destructive">{goals.error.message}</p>
      ) : (goals.data?.goals.length ?? 0) === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Target className="mx-auto h-9 w-9 text-accent" />
          <h3 className="mt-3 font-display text-xl font-bold">Още нямате финансови цели</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Помолете асистента за месечен лимит по категория или за цел за спестяване с крайна дата.
            Всяко предложение се записва едва след вашето потвърждение.
          </p>
          <Button className="mt-5" onClick={onCreateWithAssistant}>
            <Sparkles /> Създай цел с асистента
          </Button>
        </div>
      ) : (
        <>
          {monthlyGoals.length > 0 && (
            <section className="space-y-3" aria-labelledby="monthly-goals-title">
              <h3 id="monthly-goals-title" className="font-display text-xl font-bold">Месечни лимити</h3>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                {monthlyGoals.map((goal) => {
                  const category = goal.category?.toLocaleLowerCase("bg-BG");
                  const spent = monthSummary.data?.by_category.find(
                    (row) => row.category.toLocaleLowerCase("bg-BG") === category,
                  )?.total ?? 0;
                  const progress = monthlyLimitProgress(Number(goal.target_amount), spent, today);
                  return (
                    <article key={goal.id} className="rounded-2xl border bg-card p-5">
                      <GoalHeader goal={goal} icon={<Target className="h-5 w-5 text-accent" />} onDelete={() => deleteGoal(goal)} />
                      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                        <div><p className="text-muted-foreground">Похарчено</p><p className="mt-1 text-xl font-semibold">{eur(progress.spent)}</p></div>
                        <div>
                          <p className="text-muted-foreground">{progress.remaining >= 0 ? "Оставащо до лимита" : "Над лимита"}</p>
                          <p className={`mt-1 text-xl font-semibold ${progress.remaining < 0 ? "text-destructive" : ""}`}>
                            {eur(Math.abs(progress.remaining))}
                          </p>
                        </div>
                      </div>
                      <Progress className="mt-4" value={progress.percent} aria-label={`Напредък към лимита за ${goal.category}`} />
                      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                        <span>Лимит: {eur(Number(goal.target_amount))}</span>
                        <span>{progress.daysLeft} дни до края на месеца</span>
                      </div>
                      {monthSummary.isLoading && <p className="mt-3 text-xs text-muted-foreground">Обновявам от плащанията…</p>}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {savingsGoals.length > 0 && (
            <section className="space-y-3" aria-labelledby="savings-goals-title">
              <h3 id="savings-goals-title" className="font-display text-xl font-bold">Спестявания</h3>
              <div className="grid items-start gap-4 lg:grid-cols-2">
                {savingsGoals.map((goal) => (
                  <SavingsGoalCard
                    key={goal.id}
                    goal={goal}
                    contributions={contributionsByGoal.get(goal.id) ?? []}
                    today={today}
                    onDelete={() => deleteGoal(goal)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function GoalHeader({
  goal,
  icon,
  onDelete,
}: {
  goal: FinancialGoal;
  icon: ReactNode;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div>
          <h4 className="font-semibold">{goal.name}</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {goal.goal_type === "monthly_limit" ? `Категория: ${goal.category}` : `Крайна дата: ${goal.deadline ? formatDate(goal.deadline) : "—"}`}
          </p>
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Изтрий целта ${goal.name}`}><Trash2 /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Изтриване на целта?</AlertDialogTitle>
            <AlertDialogDescription>
              Ще изтриете „{goal.name}“ и ръчните ѝ заделяния. Банковите транзакции няма да се променят.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отказ</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Изтрий целта</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SavingsGoalCard({
  goal,
  contributions,
  today,
  onDelete,
}: {
  goal: FinancialGoal;
  contributions: GoalContribution[];
  today: string;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const saved = contributions.reduce((sum, contribution) => sum + Number(contribution.amount), 0);
  const progress = savingsProgress(Number(goal.target_amount), saved, today, goal.deadline!);

  async function addContribution(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount.replace(",", "."));
    if (!(value > 0) || !date) {
      toast.error("Въведете сума по-голяма от 0 € и дата.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("goal_contributions").insert({
      goal_id: goal.id,
      amount: value,
      contribution_date: date,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAmount("");
    await qc.invalidateQueries({ queryKey: ["financial-goals"] });
    toast.success("Заделената сума е добавена.");
  }

  async function deleteContribution(id: string) {
    const { error } = await supabase.from("goal_contributions").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["financial-goals"] });
    toast.success("Заделянето е премахнато.");
  }

  return (
    <article className="rounded-2xl border bg-card p-5">
      <GoalHeader goal={goal} icon={<PiggyBank className="h-5 w-5 text-accent" />} onDelete={onDelete} />
      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div><p className="text-muted-foreground">Заделено</p><p className="mt-1 text-xl font-semibold">{eur(progress.saved)}</p></div>
        <div><p className="text-muted-foreground">Заделяйте на месец</p><p className="mt-1 text-xl font-semibold">{eur(progress.monthlyRequired)}</p></div>
      </div>
      <Progress className="mt-4" value={progress.percent} aria-label={`Напредък към ${goal.name}`} />
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>Остават {eur(progress.remaining)} от {eur(Number(goal.target_amount))}</span>
        <span>{progress.overdue ? "Срокът е изтекъл" : `${progress.months} месечни заделяния`}</span>
      </div>

      <form onSubmit={addContribution} className="mt-5 rounded-xl bg-muted p-3">
        <p className="text-sm font-medium">Добави ръчно заделяне</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor={`amount-${goal.id}`}>Сума в евро</Label>
            <Input id={`amount-${goal.id}`} inputMode="decimal" placeholder="50,00" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor={`date-${goal.id}`}>Дата</Label>
            <Input id={`date-${goal.id}`} type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} className="mt-1" />
          </div>
          <Button type="submit" disabled={busy}><Plus /> {busy ? "Записвам…" : "Добави"}</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Това е отделна бележка за спестяване и не променя банковите ви транзакции.</p>
      </form>

      {contributions.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">История на заделянията ({contributions.length})</summary>
          <ul className="mt-2 divide-y">
            {contributions.map((contribution) => (
              <li key={contribution.id} className="flex items-center justify-between gap-3 py-2">
                <span>{formatDate(contribution.contribution_date)}</span>
                <span className="flex items-center gap-2 font-medium">
                  {eur(Number(contribution.amount))}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteContribution(contribution.id)} aria-label={`Премахни заделянето от ${formatDate(contribution.contribution_date)}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
