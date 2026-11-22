import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownUp, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KIND_LABELS, eur, kindForCategory, type Tx } from "@/lib/finance";
import { fetchTxPage, fetchTxSummary } from "@/lib/summary";
import { categoriesQuery } from "./categories";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_TRANSACTION_VIEW,
  applyTransactionViewPatch,
  isDefaultTransactionView,
  viewToFilter,
  type TransactionSort,
  type TransactionView,
} from "@/lib/transaction-view";

const PAGE_SIZE = 50;

export function Transactions({
  view,
  onViewChange,
}: {
  view: TransactionView;
  onViewChange: (view: TransactionView) => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [allFromMerchant, setAllFromMerchant] = useState(false);
  const { data: cats } = useQuery(categoriesQuery);
  const all = cats?.all ?? [];

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const filter = useMemo(() => viewToFilter(view, search), [view, search]);
  useEffect(() => setPage(0), [filter, view.sort, view.direction]);

  const list = useQuery({
    queryKey: ["transactions", "page", filter, view.sort, view.direction, page],
    queryFn: () =>
      fetchTxPage(supabase, filter, { sort: view.sort, direction: view.direction, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const totals = useQuery({
    queryKey: ["transactions", "summary", filter],
    queryFn: () => fetchTxSummary(supabase, filter),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isDefault = isDefaultTransactionView(view);

  async function change(t: Tx, category: string) {
    const kind = kindForCategory(category, t.kind);
    const query = supabase.from("transactions").update({ category, kind });
    const { error } = allFromMerchant
      ? await query.eq("merchant", t.merchant).eq("kind", t.kind)
      : await query.eq("id", t.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (allFromMerchant) {
      const { data: u } = await supabase.auth.getUser();
      await supabase
        .from("merchant_rules")
        .upsert({ user_id: u.user!.id, merchant: t.merchant, category, kind }, { onConflict: "user_id,merchant" });
      toast.success(`Запомнено: „${t.merchant}“ → ${category}`);
    } else toast.success(`Само това плащане е преместено в „${category}“.`);
    await qc.invalidateQueries({ queryKey: ["transactions"] });
  }

  const active = [
    view.scope === "spending" && "Разходи и възстановявания",
    view.scope === "income" && "Доходи",
    view.expensesOnly && "Само разходи",
    view.category && `Категория: ${view.category}`,
    view.merchant && `Търговец: ${view.merchant}`,
    (view.from || view.to) && `Период: ${view.from ?? "…"} – ${view.to ?? "…"}`,
    view.hiddenCategories.length > 0 && `Скрити: ${view.hiddenCategories.join(", ")}`,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Input placeholder="Търсене по търговец или категория…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={view.sort} onValueChange={(sort: TransactionSort) => onViewChange(applyTransactionViewPatch(view, { sort }))}>
            <SelectTrigger className="w-48" aria-label="Подреждане на транзакциите"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="date">По дата</SelectItem>
              <SelectItem value="category">По категория</SelectItem>
              <SelectItem value="amount">По големина на сумата</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewChange({ ...view, direction: view.direction === "asc" ? "desc" : "asc" })}
            aria-label={view.direction === "asc" ? "Смени на низходящо подреждане" : "Смени на възходящо подреждане"}
          >
            <ArrowDownUp />
            {view.direction === "asc" ? "Възходящо" : "Низходящо"}
          </Button>
          {!isDefault && (
            <Button variant="ghost" size="sm" onClick={() => onViewChange({ ...DEFAULT_TRANSACTION_VIEW, hiddenCategories: [] })}>
              <RotateCcw />
              Изчисти изгледа
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-xl bg-muted px-4 py-3 text-sm" aria-live="polite" data-testid="tx-totals">
        <p className="font-medium">
          {total} записа
          {totals.data && (
            <>
              {" "}· Нетни разходи {eur(totals.data.spending_total)} ({totals.data.spending_count}) · Доходи{" "}
              {eur(totals.data.income_total)} ({totals.data.income_count})
            </>
          )}
        </p>
        <p className="mt-1 text-muted-foreground">
          {active.length ? `${active.join(". ")}. ` : ""}Вътрешните преводи не влизат в разходите. Записите не се
          променят от филтрите.
        </p>
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm">
        <Checkbox checked={allFromMerchant} onCheckedChange={(v) => setAllFromMerchant(v === true)} />
        При смяна на категория промени всички плащания от същия търговец и запомни правило
      </label>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th className="py-2">Дата</th><th>Търговец</th><th>Категория</th><th>Вид</th><th className="text-right">Сума</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap py-2">{t.tx_date}</td>
                <td><div className="font-medium">{t.merchant}</div><div className="text-xs text-muted-foreground">{t.description}</div></td>
                <td className="min-w-44">
                  <Select value={t.category} onValueChange={(v) => change(t, v)}>
                    <SelectTrigger className="h-8" aria-label={`Категория за ${t.merchant} ${t.tx_date}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{all.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="text-xs text-muted-foreground">{KIND_LABELS[t.kind]}</td>
                <td className={`text-right font-semibold ${t.amount > 0 ? "text-primary" : ""}`}>{eur(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.isLoading && rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Няма записи по тези условия.</p>}
      </div>
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Предишна страница"><ChevronLeft /></Button>
          <span>Страница {page + 1} от {pages}</span>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Следваща страница"><ChevronRight /></Button>
        </div>
      )}
    </div>
  );
}
