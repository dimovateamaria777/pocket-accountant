import { useMemo } from "react";
import { Pie, PieChart, Cell, Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { byMonth, computeIncome, computeSpending, eur, spendingByCategory, topMerchants, type Tx } from "@/lib/finance";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

export function Overview({ txs }: { txs: Tx[] }) {
  const months = useMemo(() => byMonth(txs), [txs]);
  const cats = useMemo(() => spendingByCategory(txs), [txs]);
  const merchants = useMemo(() => topMerchants(txs), [txs]);
  const spend = computeSpending(txs).total;
  const income = computeIncome(txs).total;
  const transfers = txs.filter((t) => t.kind === "transfer").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Похарчени" value={eur(spend)} />
        <Stat label="Получени" value={eur(income)} />
        <Stat label="Остават" value={eur(income - spend)} hint={`${transfers} вътрешни превода не са броени`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="За какво харчите">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={cats} dataKey="total" nameKey="category" innerRadius={60} outerRadius={110} paddingAngle={2}>
                {cats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => eur(v)} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="mt-2 space-y-1 text-sm">
            {cats.map((c, i) => (
              <li key={c.category} className="flex justify-between">
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{c.category}</span>
                <span className="font-semibold">{eur(c.total)}</span>
              </li>
            ))}
          </ul>
        </Card>
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
      </div>
      <Card title="Къде харчите най-много">
        <ul className="divide-y">
          {merchants.map((m) => (
            <li key={m.merchant} className="flex justify-between py-2 text-sm"><span>{m.merchant}</span><span className="font-semibold">{eur(m.total)}</span></li>
          ))}
        </ul>
      </Card>
    </div>
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
