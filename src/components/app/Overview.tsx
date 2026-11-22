import { useMemo, useState } from "react";
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
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { eur, isInvestmentCategory, sharePercent } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { summaryQuery } from "./data";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
];

type BreakdownRow = { label: string; total: number };

function formatShare(value: number, total: number) {
  return `${sharePercent(value, total).toLocaleString("bg-BG", { maximumFractionDigits: 1 })}%`;
}

type RoundedSectorProps = {
  cx?: number | undefined;
  cy?: number | undefined;
  innerRadius?: number | undefined;
  outerRadius?: number | undefined;
  startAngle?: number | undefined;
  endAngle?: number | undefined;
  fill?: string | undefined;
  explosion?: number | undefined;
  offset?: string | number | undefined;
  payload?: { label?: string } | undefined;
};

type Point = { x: number; y: number };

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy - radius * Math.sin(radians) };
}

function point(point: Point) {
  return `${point.x} ${point.y}`;
}

function fullRingPath(cx: number, cy: number, innerRadius: number, outerRadius: number) {
  const outerStart = polarPoint(cx, cy, outerRadius, 90);
  const outerMiddle = polarPoint(cx, cy, outerRadius, -90);
  const innerStart = polarPoint(cx, cy, innerRadius, 90);
  const innerMiddle = polarPoint(cx, cy, innerRadius, -90);
  return [
    `M ${point(outerStart)}`,
    `A ${outerRadius} ${outerRadius} 0 1 0 ${point(outerMiddle)}`,
    `A ${outerRadius} ${outerRadius} 0 1 0 ${point(outerStart)} Z`,
    `M ${point(innerStart)}`,
    `A ${innerRadius} ${innerRadius} 0 1 1 ${point(innerMiddle)}`,
    `A ${innerRadius} ${innerRadius} 0 1 1 ${point(innerStart)} Z`,
  ].join(" ");
}

function roundedSectorPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const span = Math.abs(endAngle - startAngle);
  if (span >= 359.999) return fullRingPath(cx, cy, innerRadius, outerRadius);

  const direction = endAngle >= startAngle ? 1 : -1;
  const thickness = outerRadius - innerRadius;
  const cornerRadius = Math.max(
    0.5,
    Math.min(10, thickness * 0.28, (span * Math.PI * innerRadius) / 360),
  );
  const outerTrim = Math.min(span * 0.45, (cornerRadius * 180) / (Math.PI * outerRadius));
  const innerTrim = Math.min(span * 0.45, (cornerRadius * 180) / (Math.PI * innerRadius));
  const radialTrim = Math.min(thickness * 0.45, cornerRadius);

  const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
  const outerStartArc = polarPoint(cx, cy, outerRadius, startAngle + direction * outerTrim);
  const outerStartRadial = polarPoint(cx, cy, outerRadius - radialTrim, startAngle);
  const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
  const outerEndArc = polarPoint(cx, cy, outerRadius, endAngle - direction * outerTrim);
  const outerEndRadial = polarPoint(cx, cy, outerRadius - radialTrim, endAngle);
  const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);
  const innerEndRadial = polarPoint(cx, cy, innerRadius + radialTrim, endAngle);
  const innerEndArc = polarPoint(cx, cy, innerRadius, endAngle - direction * innerTrim);
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
  const innerStartArc = polarPoint(cx, cy, innerRadius, startAngle + direction * innerTrim);
  const innerStartRadial = polarPoint(cx, cy, innerRadius + radialTrim, startAngle);

  const outerLargeArc = span - outerTrim * 2 > 180 ? 1 : 0;
  const innerLargeArc = span - innerTrim * 2 > 180 ? 1 : 0;
  const outerSweep = direction === 1 ? 0 : 1;
  const innerSweep = direction === 1 ? 1 : 0;

  return [
    `M ${point(outerStartArc)}`,
    `A ${outerRadius} ${outerRadius} 0 ${outerLargeArc} ${outerSweep} ${point(outerEndArc)}`,
    `Q ${point(outerEnd)} ${point(outerEndRadial)}`,
    `L ${point(innerEndRadial)}`,
    `Q ${point(innerEnd)} ${point(innerEndArc)}`,
    `A ${innerRadius} ${innerRadius} 0 ${innerLargeArc} ${innerSweep} ${point(innerStartArc)}`,
    `Q ${point(innerStart)} ${point(innerStartRadial)}`,
    `L ${point(outerStartRadial)}`,
    `Q ${point(outerStart)} ${point(outerStartArc)} Z`,
  ].join(" ");
}

function RoundedSector({
  cx = 0,
  cy = 0,
  innerRadius = 0,
  outerRadius = 0,
  startAngle = 0,
  endAngle = 0,
  fill,
  explosion = 1.5,
}: RoundedSectorProps) {
  const middleAngle = (startAngle + endAngle) / 2;
  const shift = polarPoint(0, 0, explosion, middleAngle);
  return (
    <path
      d={roundedSectorPath(cx + shift.x, cy + shift.y, innerRadius, outerRadius, startAngle, endAngle)}
      fill={fill}
      fillRule="evenodd"
      stroke="none"
    />
  );
}

export function Overview({ customCategories = [] }: { customCategories?: string[] }) {
  const { data: summary } = useQuery(summaryQuery);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const months = summary?.by_month ?? [];
  const expenseRows = useMemo<BreakdownRow[]>(() => {
    const rows = (summary?.by_category ?? [])
      .filter((row) => !isInvestmentCategory(row.category))
      .map((row) => ({ label: row.category, total: row.total }));
    const shown = new Set(rows.map((r) => r.label.toLocaleLowerCase("bg-BG")));
    for (const c of customCategories) {
      const k = c.toLocaleLowerCase("bg-BG");
      if (shown.has(k) || isInvestmentCategory(c)) continue;
      rows.push({ label: c, total: 0 });
      shown.add(k);
    }
    return rows;
  }, [summary, customCategories]);
  const merchantRows = useMemo<BreakdownRow[]>(() => {
    if (!selectedCategory) return [];
    const key = selectedCategory.toLocaleLowerCase("bg-BG");
    return (summary?.by_category_merchant ?? [])
      .filter((row) => row.category.toLocaleLowerCase("bg-BG") === key)
      .map((row) => ({ label: row.merchant, total: row.total }));
  }, [summary, selectedCategory]);
  const incomeRows = (summary?.income_by_source ?? []).map((r) => ({ label: r.source, total: r.total }));
  const investmentRows = (summary?.investments ?? []).map((r) => ({ label: r.destination, total: r.total }));
  const merchants = summary?.top_merchants ?? [];
  const spend = summary?.spending_total ?? 0;
  const income = summary?.income_total ?? 0;
  const transfers = summary?.transfer_count ?? 0;

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
      <div className="grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-6">
          <BreakdownCard
            title={selectedCategory ? `${selectedCategory} по търговци` : "Разходи по категории"}
            rows={selectedCategory ? merchantRows : expenseRows}
            emptyText={
              selectedCategory
                ? "Няма разходи по търговци в тази категория за избрания период."
                : "Все още няма разходи за показване."
            }
            showZeroHint={!selectedCategory}
            onSelect={selectedCategory ? undefined : setSelectedCategory}
            onBack={selectedCategory ? () => setSelectedCategory(null) : undefined}
          />
          <Card title="Къде харчите най-много">
            <ul className="divide-y">
              {merchants.map((m) => (
                <li key={m.merchant} className="flex justify-between gap-3 py-2 text-sm">
                  <span>{m.merchant}</span>
                  <span className="font-semibold">{eur(m.total)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <BreakdownCard
          title="Откъде идват доходите"
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
            <Bar dataKey="spending" name="Разходи" fill="var(--chart-2)" stroke="none" radius={[6, 6, 0, 0]} />
            <Bar dataKey="income" name="Доходи" fill="var(--chart-1)" stroke="none" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  emptyText,
  showZeroHint = false,
  onSelect,
  onBack,
}: {
  title: string;
  rows: BreakdownRow[];
  emptyText: string;
  showZeroHint?: boolean;
  onSelect?: ((label: string) => void) | undefined;
  onBack?: (() => void) | undefined;
}) {
  const hasValues = rows.some((row) => row.total > 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  return (
    <Card title={title}>
      {onBack && (
        <Button type="button" variant="ghost" size="sm" className="mb-3 -ml-2" onClick={onBack}>
          <ArrowLeft />
          Назад към всички категории
        </Button>
      )}
      <div className="h-[260px]">
        {hasValues ? (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={rows}
                dataKey="total"
                nameKey="label"
                innerRadius={64}
                outerRadius={100}
                paddingAngle={7}
                activeIndex={rows.map((_, index) => index)}
                activeShape={(props: RoundedSectorProps) => (
                  <RoundedSector
                    {...props}
                    explosion={hoveredLabel && props.payload?.label === hoveredLabel ? 6 : 1.5}
                  />
                )}
                onMouseEnter={(data) => {
                  const row = (data as { payload?: BreakdownRow } | undefined)?.payload;
                  if (row) setHoveredLabel(row.label);
                }}
                onMouseLeave={() => setHoveredLabel(null)}
                stroke="none"
                strokeWidth={0}
                onClick={(data) => {
                  const row = (data as { payload?: BreakdownRow } | undefined)?.payload;
                  if (row && onSelect) onSelect(row.label);
                }}
                style={{ cursor: onSelect ? "pointer" : undefined }}
              >
                {rows.map((row, i) => (
                  <Cell key={row.label} fill={COLORS[i % COLORS.length]} stroke="none" strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip
                cursor={false}
                formatter={(v: number) => `${eur(v)} · ${formatShare(v, total)}`}
              />
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
            <li key={row.label} className="flex items-center justify-between gap-3">
              {onSelect && row.total > 0 ? (
                <button
                  type="button"
                  onClick={() => onSelect(row.label)}
                  className="flex min-w-0 items-center gap-2 text-left underline-offset-4 hover:underline"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  {row.label}
                </button>
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  {row.label}
                </span>
              )}
              <span className="shrink-0 font-semibold">
                {formatShare(row.total, total)} · {eur(row.total)}
              </span>
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
