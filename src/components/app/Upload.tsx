import { useMemo, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, FileSearch, FileText, FileUp, Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { authHeaders } from "@/hooks/use-auth";
import { eur, kindForCategory } from "@/lib/finance";
import {
  importKindLabel,
  importSummary,
  previewDecision,
  type ImportPreview,
  type RowCorrection,
} from "@/lib/import";
import { categoriesQuery } from "./categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const statementsQuery = queryOptions({
  queryKey: ["statements"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("statements")
      .select("id, file_name, source, tx_count, created_at, file_hash")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export function Upload() {
  const [uploading, setUploading] = useState(false);
  return uploading ? (
    <ImportFlow onClose={() => setUploading(false)} />
  ) : (
    <StatementList onUpload={() => setUploading(true)} />
  );
}

function StatementList({ onUpload }: { onUpload: () => void }) {
  const { data: statements = [], isLoading } = useQuery(statementsQuery);
  const legacy = statements.some((s) => !s.file_hash);
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold">Моите извлечения</h2>
        <Button onClick={onUpload}>
          <Plus /> Качи ново извлечение
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Зареждане…</p>
      ) : statements.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Още няма качени извлечения.</p>
      ) : (
        <ul className="divide-y" aria-label="Качени извлечения">
          {statements.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.source ?? "Неуточнен източник"} ·{" "}
                    {new Date(s.created_at).toLocaleString("bg-BG", { dateStyle: "medium", timeStyle: "short" })}
                    {!s.file_hash && " · без отпечатък"}
                  </p>
                </div>
              </div>
              <span className="font-semibold">{s.tx_count} плащания</span>
            </li>
          ))}
        </ul>
      )}
      {legacy && (
        <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-xs text-muted-foreground">
          „Без отпечатък“: тези по-стари извлечения са качени, преди да пазим отпечатък на съдържанието, а
          самият файл не е съхранен. Затова повторното им качване не може да бъде разпознато като дубликат.
          Еднакво име само по себе си не блокира качване.
        </p>
      )}
    </div>
  );
}

function ImportFlow({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: cats } = useQuery(categoriesQuery);
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [corrections, setCorrections] = useState<Record<number, RowCorrection>>({});
  const [blocked, setBlocked] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function handle(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Файлът е твърде голям (макс. 10 MB).");
      return;
    }
    setBusy("reading");
    setFileName(file.name);
    setPreview(null);
    setBlocked(null);
    setCorrections({});
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await fetch("/api/import", { method: "POST", headers: await authHeaders(), body: form });
      const json = await res.json();
      if (res.status === 409) {
        setBlocked(json.error);
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Грешка при разпознаването");
      setPreview(json as ImportPreview);
      if (!json.transactions?.length) toast.message("AI не разпозна плащания в този файл.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function correct(index: number, patch: RowCorrection) {
    setCorrections((c) => ({ ...c, [index]: { ...c[index], ...patch } }));
  }

  async function cancel() {
    const id = preview?.previewId;
    setPreview(null);
    setCorrections({});
    if (id)
      await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ mode: "cancel", previewId: id }),
      }).catch(() => undefined);
  }

  async function save() {
    if (!preview) return;
    setBusy("saving");
    try {
      const list = Object.entries(corrections).map(([index, c]) => ({
        index: Number(index),
        ...(c.category ? { category: c.category } : {}),
        ...(c.exclude ? { exclude: true } : {}),
        ...(!c.exclude && preview.transactions[Number(index)]?.needs_review && c.eur != null ? { eur: c.eur } : {}),
      }));
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ mode: "save", previewId: preview.previewId, corrections: list }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setPreview(null);
        setBlocked(json.error);
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Грешка при запис");
      toast.success(`Записани ${json.saved} плащания от ${json.source}.`);
      await Promise.all([qc.invalidateQueries({ queryKey: ["transactions"] }), qc.invalidateQueries({ queryKey: ["statements"] })]);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const summary = useMemo(() => importSummary(preview?.transactions ?? [], corrections), [preview, corrections]);
  const decision = previewDecision(preview?.transactions ?? [], corrections, preview?.skipped.length ?? 0);
  const overlaps = (preview?.transactions ?? []).filter((t) => t.overlap).length;
  const shown = useMemo(
    () =>
      (preview?.transactions ?? [])
        .map((transaction, index) => ({ transaction, index }))
        .filter(({ transaction }) =>
          !query || `${transaction.merchant} ${transaction.description} ${transaction.category}`.toLowerCase().includes(query.toLowerCase()),
        ),
    [preview, query],
  );

  if (blocked)
    return (
      <div className="rounded-2xl border bg-card p-8 text-center" role="alert">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 font-display text-xl font-bold">{blocked}</p>
        <p className="mt-1 text-sm text-muted-foreground">„{fileName}“ не е записан отново.</p>
        <Button className="mt-5" variant="outline" onClick={onClose}>
          Към моите извлечения
        </Button>
      </div>
    );

  if (preview) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileSearch className="text-accent" />
                <h2 className="font-display text-2xl font-bold">Проверка преди запис</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {preview.fileName} · {preview.source}. Нищо още не е записано.
              </p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Откажи прегледа" onClick={cancel} disabled={!!busy}>
              <X />
            </Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Summary label="Разпознати плащания" value={String(preview.transactions.length)} />
            <Summary label="Изходящи" value={`${summary.expenseCount} · ${eur(summary.expenseTotal)}`} />
            <Summary label="Входящи и възстановени" value={`${summary.incomingCount} · ${eur(summary.incomingTotal)}`} />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Сравнете броя и сумите с оригиналното извлечение. {summary.transferCount} вътрешни превода и{" "}
            {summary.withdrawalCount} тегления са отбелязани отделно.
          </p>
          {decision.unresolved > 0 && (
            <p className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm" role="status">
              {decision.unresolved} реда са в чужда валута без сума в евро в извлечението. Въведете сумата в евро
              или изключете реда — не я оценяваме автоматично.
            </p>
          )}
          {overlaps > 0 && (
            <p className="mt-3 rounded-xl bg-accent/15 px-4 py-3 text-sm" role="status">
              {overlaps} реда съвпадат по дата и сума с вече записани плащания. Може извлеченията да се
              припокриват. Нищо не сливаме автоматично — изключете редовете, които вече имате.
            </p>
          )}
        </div>

        {preview.skipped.length > 0 && (
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="font-semibold">Открити, но пропуснати ({preview.skipped.length})</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {preview.skipped.map((s, i) => (
                <li key={i}>
                  {s.description} — <span className="italic">{s.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-2xl border bg-card p-5">
          <Input className="mb-4 max-w-md" placeholder="Търсете в разпознатите редове…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Запиши</th>
                  <th className="pr-3">Дата</th>
                  <th className="pr-3">Търговец и описание</th>
                  <th className="pr-3">Категория</th>
                  <th className="pr-3">Вид</th>
                  <th className="text-right">Сума</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map(({ transaction: t, index }) => {
                  const c = corrections[index] ?? {};
                  const category = c.category ?? t.category;
                  return (
                    <tr key={index} className={c.exclude ? "opacity-50" : ""}>
                      <td className="py-3 pr-3">
                        <Checkbox
                          checked={!c.exclude}
                          onCheckedChange={(v) => correct(index, { exclude: v !== true })}
                          aria-label={`Запиши ред ${index + 1}`}
                        />
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3">{t.date}</td>
                      <td className="min-w-56 py-3 pr-3">
                        <div className="font-medium">{t.merchant}</div>
                        <div className="text-xs text-muted-foreground">{t.description}</div>
                        {t.overlap && (
                          <div className="mt-1 text-xs text-accent-foreground">
                            Вероятно вече записано: {t.overlap.merchant}, {t.overlap.date}, {eur(t.overlap.amount)}
                          </div>
                        )}
                      </td>
                      <td className="min-w-48 py-3 pr-3">
                        <Select value={category} onValueChange={(value) => correct(index, { category: value })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(cats?.all ?? [category]).map((cat) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-xs text-muted-foreground">
                        {importKindLabel(c.category ? kindForCategory(c.category, t.kind) : t.kind)}
                      </td>
                      <td className="whitespace-nowrap py-3 text-right font-semibold">
                        {t.needs_review ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs font-normal text-destructive">Изисква проверка</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="h-8 w-28 text-right"
                              placeholder="Сума в €"
                              aria-label={`Сума в евро за ред ${index + 1}`}
                              disabled={c.exclude}
                              value={c.eur ?? ""}
                              onChange={(e) => {
                                const v = e.target.value === "" ? undefined : Math.abs(Number(e.target.value));
                                setCorrections((all) => {
                                  const { eur: _old, ...rest } = all[index] ?? {};
                                  return { ...all, [index]: v == null || !Number.isFinite(v) ? rest : { ...rest, eur: v } };
                                });
                              }}
                            />
                          </div>
                        ) : (
                          eur(t.amount)
                        )}
                        {t.original_currency && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {t.original_amount} {t.original_currency}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t pt-5">
            <p className="mr-auto text-sm" aria-live="polite">
              Ще се запишат <b>{decision.save}</b> реда, ще се пропуснат <b>{decision.skip}</b>.
            </p>
            <Button variant="outline" onClick={cancel} disabled={!!busy}>Отказ</Button>
            <Button onClick={save} disabled={!!busy || decision.save === 0 || decision.unresolved > 0}>
              {busy === "saving" ? <Loader2 className="animate-spin" /> : <Check />}
              Запиши {decision.save} плащания
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onClose} disabled={!!busy}>← Моите извлечения</Button>
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card p-12 text-center hover:bg-muted">
        {busy ? <Loader2 className="h-10 w-10 animate-spin text-accent" /> : <FileUp className="h-10 w-10 text-accent" />}
        <p className="mt-4 font-semibold">
          {busy ? `Чета „${fileName}“… може да отнеме до минута` : "Изберете извлечение (PDF или CSV)"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Revolut, ДСК, ОББ, Пощенска банка и др. Първо ще видите всеки разпознат ред и едва след
          потвърждение ще го запишем.
        </p>
        <input
          type="file"
          accept=".pdf,.csv,.txt,application/pdf,text/csv"
          className="hidden"
          disabled={!!busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handle(f);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold">{value}</p>
    </div>
  );
}
