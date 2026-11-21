import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { KIND_LABELS, eur, kindForCategory, type Tx } from "@/lib/finance";
import { useQuery } from "@tanstack/react-query";
import { categoriesQuery } from "./categories";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


export function Transactions({ txs }: { txs: Tx[] }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data: cats } = useQuery(categoriesQuery);
  const all = cats?.all ?? [];
  const shown = txs.filter((t) => !q || `${t.merchant} ${t.description} ${t.category}`.toLowerCase().includes(q.toLowerCase()));

  async function change(t: Tx, category: string) {
    const kind = kindForCategory(category, t.kind);
    const { error } = await supabase.from("transactions").update({ category, kind }).eq("merchant", t.merchant).eq("kind", t.kind);
    if (error) { toast.error(error.message); return; }
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("merchant_rules").upsert({ user_id: u.user!.id, merchant: t.merchant, category, kind }, { onConflict: "user_id,merchant" });
    toast.success(`Запомнено: „${t.merchant}“ → ${category}`);
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <Input placeholder="Търсене по търговец или категория…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm" />
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
      </div>
    </div>
  );
}
