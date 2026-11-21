import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownUp, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KIND_LABELS, eur, kindForCategory, type Tx } from "@/lib/finance";
import { useQuery } from "@tanstack/react-query";
import { categoriesQuery } from "./categories";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_TRANSACTION_VIEW,
  applyTransactionViewPatch,
  isDefaultTransactionView,
  visibleTransactions,
  type TransactionSort,
  type TransactionView,
} from "@/lib/transaction-view";

export function Transactions({
  txs,
  view,
  onViewChange,
}: {
  txs: Tx[];
  view: TransactionView;
  onViewChange: (view: TransactionView) => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data: cats } = useQuery(categoriesQuery);
  const all = cats?.all ?? [];
  const visible = visibleTransactions(txs, view);
  const shown = visible.filter(
    (t) => !q || `${t.merchant} ${t.description} ${t.category}`.toLowerCase().includes(q.toLowerCase()),
  );
  const isDefault = isDefaultTransactionView(view);

  async function change(t: Tx, category: string) {
    const kind = kindForCategory(category, t.kind);
    const previous = qc.getQueryData<Tx[]>(["transactions"]);

    // Update the shared cache immediately so every tab, including the charts, follows the edit.
    qc.setQueryData<Tx[]>(["transactions"], (current) =>
      current?.map((item) =>
        item.merchant === t.merchant && item.kind === t.kind ? { ...item, category, kind } : item,
      ),
    );

    const { error } = await supabase.from("transactions").update({ category, kind }).eq("merchant", t.merchant).eq("kind", t.kind);
    if (error) {
      if (previous) qc.setQueryData(["transactions"], previous);
      toast.error(error.message);
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("merchant_rules").upsert({ user_id: u.user!.id, merchant: t.merchant, category, kind }, { onConflict: "user_id,merchant" });
    toast.success(`Запомнено: „${t.merchant}“ → ${category}`);
    await qc.invalidateQueries({ queryKey: ["transactions"] });
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Input placeholder="Търсене по търговец или категория…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={view.sort}
            onValueChange={(sort: TransactionSort) => onViewChange(applyTransactionViewPatch(view, { sort }))}
          >
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

      {!isDefault && (
        <div className="mb-4 rounded-xl bg-muted px-4 py-3 text-sm" aria-live="polite">
          <p className="font-medium">Показани {shown.length} от {txs.length} записа</p>
          <p className="mt-1 text-muted-foreground">
            {view.expensesOnly && "Само разходи. "}
            {view.hiddenCategories.length > 0 && `Скрити категории: ${view.hiddenCategories.join(", ")}. `}
            Записите не са изтрити или променени.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th className="py-2">Дата</th><th>Търговец</th><th>Категория</th><th>Вид</th><th className="text-right">Сума</th></tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap py-2">{t.tx_date}</td>
                <td><div className="font-medium">{t.merchant}</div><div className="text-xs text-muted-foreground">{t.description}</div></td>
                <td className="min-w-44">
                  <Select value={t.category} onValueChange={(v) => change(t, v)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{all.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="text-xs text-muted-foreground">{KIND_LABELS[t.kind]}</td>
                <td className={`text-right font-semibold ${t.amount > 0 ? "text-primary" : ""}`}>{eur(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Няма записи по тези условия.</p>}
      </div>
    </div>
  );
}
