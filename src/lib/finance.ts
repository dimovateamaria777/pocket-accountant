export const CATEGORIES = [
  "Храна",
  "Ресторанти и кафе",
  "Транспорт",
  "За дома",
  "Сметки и комунални",
  "Абонаменти",
  "Пазаруване",
  "Здраве",
  "Забавления",
  "Пътувания",
  "Образование",
  "Такси и комисиони",
  "Доход",
  "Вътрешен превод",
  "Възстановена сума",
  "Теглене",
  "Други",
] as const;

export type Kind = "expense" | "income" | "transfer" | "refund";

export const KIND_LABELS: Record<Kind, string> = {
  expense: "Разход",
  income: "Доход",
  transfer: "Вътрешен превод",
  refund: "Възстановена сума",
};

export interface Tx {
  id: string;
  tx_date: string; // YYYY-MM-DD
  description: string;
  merchant: string;
  amount: number; // signed EUR: negative = money out, positive = money in
  kind: Kind;
  category: string;
}

export interface TxFilter {
  category?: string | null;
  merchant?: string | null;
  from?: string | null; // inclusive YYYY-MM-DD
  to?: string | null; // inclusive YYYY-MM-DD
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function matches(tx: Tx, f: TxFilter) {
  if (f.from && tx.tx_date < f.from) return false;
  if (f.to && tx.tx_date > f.to) return false;
  if (f.category && tx.category.toLowerCase() !== f.category.toLowerCase()) return false;
  if (f.merchant && !tx.merchant.toLowerCase().includes(f.merchant.toLowerCase())) return false;
  return true;
}

/**
 * Net spending for matching transactions.
 * Internal transfers are never counted; refunds reduce spending; income is not spending.
 */
export function computeSpending(txs: Tx[], f: TxFilter = {}) {
  const items = txs.filter((t) => matches(t, f) && (t.kind === "expense" || t.kind === "refund"));
  let total = 0;
  for (const t of items) {
    if (t.kind === "expense") total += -t.amount;
    else total -= Math.abs(t.amount);
  }
  return { total: round2(total), count: items.length, items };
}

export function computeIncome(txs: Tx[], f: TxFilter = {}) {
  const items = txs.filter((t) => matches(t, f) && t.kind === "income");
  const total = items.reduce((s, t) => s + t.amount, 0);
  return { total: round2(total), count: items.length, items };
}

export function spendingByCategory(
  txs: Tx[],
  f: TxFilter = {},
  emptyCategories: readonly string[] = [],
) {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (!matches(t, f)) continue;
    if (t.kind === "expense") map.set(t.category, (map.get(t.category) ?? 0) - t.amount);
    if (t.kind === "refund") map.set(t.category, (map.get(t.category) ?? 0) - Math.abs(t.amount));
  }
  const rows = [...map.entries()]
    .map(([category, total]) => ({ category, total: round2(total) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  const shown = new Set(rows.map((row) => row.category.toLocaleLowerCase("bg-BG")));
  for (const category of emptyCategories) {
    const normalized = category.toLocaleLowerCase("bg-BG");
    if (shown.has(normalized)) continue;
    rows.push({ category, total: 0 });
    shown.add(normalized);
  }
  return rows;
}

export function incomeByCategory(txs: Tx[], f: TxFilter = {}) {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (t.kind !== "income" || !matches(t, f)) continue;
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total: round2(total) }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function isInvestmentCategory(category: string) {
  return category.toLocaleLowerCase("bg-BG").includes("инвестиц");
}

/** Uses the purchased asset when the statement names it, otherwise the broker or merchant. */
function investmentDestination(tx: Tx) {
  const description = tx.description.trim();
  const asset = description.match(/(?:purchase\s+of|покупка\s+на)\s+(.+)/i)?.[1]
    ?.replace(/[.,;]+$/, "")
    .trim();
  return asset || tx.merchant.trim() || description || "Неуточнено";
}

/** Net invested money by asset or provider; refunds reduce it and transfers stay excluded. */
export function investmentsByDestination(txs: Tx[]) {
  const map = new Map<string, { destination: string; total: number }>();
  for (const t of txs) {
    if (!isInvestmentCategory(t.category)) continue;
    if (t.kind !== "expense" && t.kind !== "refund") continue;
    const destination = investmentDestination(t);
    const key = destination.toLocaleLowerCase("bg-BG");
    const current = map.get(key) ?? { destination, total: 0 };
    current.total += t.kind === "expense" ? -t.amount : -Math.abs(t.amount);
    map.set(key, current);
  }
  return [...map.values()]
    .map((row) => ({ ...row, total: round2(row.total) }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function byMonth(txs: Tx[]) {
  const map = new Map<string, { month: string; spending: number; income: number }>();
  for (const t of txs) {
    const month = t.tx_date.slice(0, 7);
    const row = map.get(month) ?? { month, spending: 0, income: 0 };
    if (t.kind === "expense") row.spending += -t.amount;
    if (t.kind === "refund") row.spending -= Math.abs(t.amount);
    if (t.kind === "income") row.income += t.amount;
    map.set(month, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, spending: round2(r.spending), income: round2(r.income) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function topMerchants(txs: Tx[], limit = 8) {
  const map = new Map<string, number>();
  for (const t of txs)
    if (t.kind === "expense") map.set(t.merchant, (map.get(t.merchant) ?? 0) - t.amount);
  return [...map.entries()]
    .map(([merchant, total]) => ({ merchant, total: round2(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export const eur = (n: number) =>
  new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR" }).format(n);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A text rule matches when its pattern appears in the merchant or description (case-insensitive). */
export function ruleMatches(tx: { merchant: string; description: string }, pattern: string) {
  const p = norm(pattern);
  if (!p) return false;
  return norm(`${tx.merchant} ${tx.description}`).includes(p);
}

/** Cash-machine and other withdrawals always have their own visible category. */
export function isWithdrawal(tx: { merchant: string; description: string }) {
  return ruleMatches(tx, "теглене");
}

export function kindForCategory(category: string, current: Kind): Kind {
  if (category === "Вътрешен превод") return "transfer";
  if (category === "Доход") return "income";
  if (current === "refund" || category === "Възстановена сума") return "refund";
  return "expense";
}
