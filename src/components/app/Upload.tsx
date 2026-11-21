import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FileSearch, FileUp, Loader2, X } from "lucide-react";
import { authHeaders } from "@/hooks/use-auth";
import { eur, kindForCategory } from "@/lib/finance";
import { importKindLabel, importSummary, type ImportPreview } from "@/lib/import";
import { categoriesQuery } from "./categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

async function toBase64(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export function Upload({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: cats } = useQuery(categoriesQuery);
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [query, setQuery] = useState("");

  async function handle(file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error("Файлът е твърде голям (макс. 10 MB)."); return; }
    setBusy("reading");
    setFileName(file.name);
    setPreview(null);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const body = isPdf
        ? { mode: "preview", fileName: file.name, mime: "application/pdf", base64: await toBase64(file) }
        : { mode: "preview", fileName: file.name, mime: file.type || "text/csv", text: await file.text() };
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Грешка при разпознаването");
      setPreview(json as ImportPreview);
      if (!json.transactions?.length) toast.message("AI не разпозна плащания в този файл.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function changeCategory(index: number, category: string) {
    setPreview((current) => current ? {
      ...current,
      transactions: current.transactions.map((t, i) => i === index ? { ...t, category, kind: kindForCategory(category, t.kind) } : t),
    } : current);
  }

  async function save() {
    if (!preview?.transactions.length) return;
    setBusy("saving");
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ mode: "save", ...preview }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Грешка при запис");
      toast.success(`Добавени ${json.count} плащания от ${json.source}.`);
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      setPreview(null);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const summary = useMemo(() => importSummary(preview?.transactions ?? []), [preview]);
  const shown = useMemo(() => (preview?.transactions ?? [])
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => !query || `${transaction.merchant} ${transaction.description} ${transaction.category}`.toLowerCase().includes(query.toLowerCase())), [preview, query]);

  if (preview) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><FileSearch className="text-accent" /><h2 className="font-display text-2xl font-bold">Проверка преди запис</h2></div>
              <p className="mt-2 text-sm text-muted-foreground">{preview.fileName} · {preview.source}. Нищо още не е записано.</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Откажи прегледа" onClick={() => setPreview(null)} disabled={!!busy}><X /></Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Summary label="Разпознати плащания" value={String(summary.count)} />
            <Summary label="Изходящи" value={`${summary.expenseCount} · ${eur(summary.expenseTotal)}`} />
            <Summary label="Входящи и възстановени" value={`${summary.incomingCount} · ${eur(summary.incomingTotal)}`} />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Сравнете броя и сумите с оригиналното извлечение. Можете да поправите категориите тук; {summary.transferCount} вътрешни превода и {summary.withdrawalCount} тегления са отбелязани отделно.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <Input className="mb-4 max-w-md" placeholder="Търсете в разпознатите редове…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr><th className="py-2 pr-3">Дата</th><th className="pr-3">Търговец и описание</th><th className="pr-3">Категория</th><th className="pr-3">Вид</th><th className="text-right">Сума</th></tr>
              </thead>
              <tbody className="divide-y">
                {shown.map(({ transaction: t, index }) => (
                  <tr key={`${t.date}-${index}`}>
                    <td className="whitespace-nowrap py-3 pr-3">{t.date}</td>
                    <td className="min-w-56 py-3 pr-3"><div className="font-medium">{t.merchant}</div><div className="text-xs text-muted-foreground">{t.description}</div></td>
                    <td className="min-w-48 py-3 pr-3">
                      <Select value={t.category} onValueChange={(value) => changeCategory(index, value)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{(cats?.all ?? [t.category]).map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 text-xs text-muted-foreground">{importKindLabel(t.kind)}</td>
                    <td className={`whitespace-nowrap py-3 text-right font-semibold ${t.amount > 0 ? "text-primary" : ""}`}>
                      {eur(t.amount)}
                      {t.original_currency && t.original_currency !== "EUR" && <div className="text-xs font-normal text-muted-foreground">{t.original_amount} {t.original_currency}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query && <p className="mt-3 text-xs text-muted-foreground">Показани {shown.length} от {summary.count} реда.</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-3 border-t pt-5">
            <Button variant="outline" onClick={() => setPreview(null)} disabled={!!busy}>Отказ</Button>
            <Button onClick={save} disabled={!!busy || !summary.count}>
              {busy === "saving" ? <Loader2 className="animate-spin" /> : <Check />}
              Запиши {summary.count} плащания
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card p-12 text-center hover:bg-muted">
      {busy ? <Loader2 className="h-10 w-10 animate-spin text-accent" /> : <FileUp className="h-10 w-10 text-accent" />}
      <p className="mt-4 font-semibold">{busy ? `Чета „${fileName}“… може да отнеме до минута` : "Изберете извлечение (PDF или CSV)"}</p>
      <p className="mt-1 text-sm text-muted-foreground">Revolut, ДСК, ОББ, Пощенска банка и др. Първо ще видите всеки разпознат ред и едва след потвърждение ще го запишем.</p>
      <input type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv" className="hidden" disabled={!!busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-xl font-bold">{value}</p></div>;
}
