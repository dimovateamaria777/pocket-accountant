import { useMemo } from "react";
import {
  Pie,
  PieChart,
  Cell,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  byMonth,
  computeIncome,
  computeSpending,
  eur,
  incomeByCategory,
  investmentsByDestination,
  isInvestmentCategory,
  spendingByCategory,
  topMerchants,
  type Tx,
} from "@/lib/finance";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
];

type BreakdownRow = { label: string; total: number };

export function Overview({
  txs,
  customCategories = [],
}: {
  txs: Tx[];
  customCategories?: string[];
}) {
  const months = useMemo(() => byMonth(txs), [txs]);
  const expenseRows = useMemo<BreakdownRow[]>(
    () =>
      spendingByCategory(txs, {}, customCategories)
        .filter((row) => !isInvestmentCategory(row.category))
        .map((row) => ({ label: row.category, total: row.total })),
    [txs, customCategories],
  );
  const incomeRows = useMemo<BreakdownRow[]>(
    () => incomeByCategory(txs).map((row) => ({ label: row.category, total: row.total })),
    [txs],
  );
  const investmentRows = useMemo<BreakdownRow[]>(
    () => investmentsByDestination(txs).map((row) => ({ label: row.destination, total: row.total })),
    [txs],
  );
  const merchants = useMemo(() => topMerchants(txs), [txs]);
  const spend = computeSpending(txs).total;
  const income = computeIncome(txs).total;
  const transfers = txs.filter((t) => t.kind === "transfer").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Похарчени" value={eur(spend)} />
        <Stat label="Получени" value={eur(income)} />
        <Stat
          label="Остават"
          value={eur(income - spend)}
          hint={`${transfers} вътрешни превода не са броени`}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <BreakdownCard
          title="Разходи по категории"
          rows={expenseRows}
          emptyText="Все още няма разходи за показване."
          showZeroHint
        />
        <BreakdownCard
          title="Доходи по категории"
          rows={incomeRows}
          emptyText="Все още няма доходи за показване."
        />
        <BreakdownCard
          title="Къде инвестирате"
          rows={investmentRows}
          emptyText="Добавете транзакция в категория „Инвестиции“, за да видите къде сте инвестирали."
        />
      </div>
      <Card title="По месеци">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={months}>
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip formatter={(v: number) => eur(v)} />
            <Legend />
            <Bar dataKey="spending" name="Разходи" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="income" name="Доходи" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Къде харчите най-много">
        <ul className="divide-y">
          {merchants.map((m) => (
            <li key={m.merchant} className="flex justify-between py-2 text-sm">
              <span>{m.merchant}</span>
              <span className="font-semibold">{eur(m.total)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  emptyText,
  showZeroHint = false,
}: {
  title: string;
  rows: BreakdownRow[];
  emptyText: string;
  showZeroHint?: boolean;
}) {
  const hasValues = rows.some((row) => row.total > 0);
  return (
    <Card title={title}>
      <div className="h-[260px]">
        {hasValues ? (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={rows}
                dataKey="total"
                nameKey="label"
                innerRadius={55}
                outerRadius={100}
                paddingAngle={2}
              >
                {rows.map((row, i) => (
                  <Cell key={row.label} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => eur(v)} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center px-5 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm" aria-label={`${title} – стойности`}>
          {rows.map((row, i) => (
            <li key={row.label} className="flex justify-between gap-3">
              <span className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                {row.label}
              </span>
              <span className="font-semibold">{eur(row.total)}</span>
            </li>
          ))}
        </ul>
      )}
      {showZeroHint && rows.some((row) => row.total === 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          Категориите с 0 € получават дял след първата транзакция в тях.
        </p>
      )}
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <h2 className="mb-3 font-display text-xl font-bold">{title}</h2>
      {children}
    </div>
  );
}
