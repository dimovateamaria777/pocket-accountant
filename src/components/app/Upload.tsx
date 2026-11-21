import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { authHeaders } from "@/hooks/use-auth";

async function toBase64(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export function Upload({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  async function handle(file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error("Файлът е твърде голям (макс. 10 MB)."); return; }
    setBusy(file.name);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const body = isPdf
        ? { fileName: file.name, mime: "application/pdf", base64: await toBase64(file) }
        : { fileName: file.name, mime: file.type || "text/csv", text: await file.text() };
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Грешка");
      toast.success(`Добавени ${json.count} плащания от ${json.source}.`);
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card p-12 text-center hover:bg-muted">
      {busy ? <Loader2 className="h-10 w-10 animate-spin text-accent" /> : <FileUp className="h-10 w-10 text-accent" />}
      <p className="mt-4 font-semibold">{busy ? `Чета „${busy}“… може да отнеме до минута` : "Изберете извлечение (PDF или CSV)"}</p>
      <p className="mt-1 text-sm text-muted-foreground">Revolut, ДСК, ОББ, Пощенска банка и др. Сумите се превръщат в евро.</p>
      <input type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv" className="hidden" disabled={!!busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
    </label>
  );
}
