import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addCategory, applyRule, categoriesQuery, rulesQuery } from "./categories";

export function CategoryManager() {
  const qc = useQueryClient();
  const { data: cats } = useQuery(categoriesQuery);
  const { data: rules = [] } = useQuery(rulesQuery);
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState("");
  const [cat, setCat] = useState("");

  async function run(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast.success(ok); qc.invalidateQueries(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="max-w-xl space-y-6 rounded-2xl border bg-card p-6">
      <div>
        <h2 className="font-display text-xl font-bold">Моите категории</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {cats?.custom.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">
              {c.name}
              <button aria-label={`Премахни ${c.name}`} onClick={() => run(async () => { await supabase.from("custom_categories").delete().eq("id", c.id); }, "Премахната")}><X className="h-3 w-3" /></button>
            </span>
          ))}
          {!cats?.custom.length && <p className="text-sm text-muted-foreground">Още нямате собствени категории.</p>}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addCategory(name), "Категорията е добавена"); setName(""); }}>
          <Input placeholder="Напр. Инвестиции" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>Добави</Button>
        </form>
      </div>
      <div>
        <h2 className="font-display text-xl font-bold">Правила</h2>
        <p className="text-sm text-muted-foreground">Когато търговецът или описанието съдържа текста, плащането отива в избраната категория.</p>
        <ul className="mt-3 space-y-1 text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
              <span>„{r.pattern}“ → <b>{r.category}</b></span>
              <button aria-label="Изтрий правилото" onClick={() => run(async () => { await supabase.from("category_rules").delete().eq("id", r.id); }, "Правилото е изтрито")}><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { const n = await applyRule(pattern, cat); toast.message(`Променени ${n} плащания`); }, "Правилото е записано"); setPattern(""); }}>
          <Input className="flex-1" placeholder="Текст, напр. purchase of btc" value={pattern} onChange={(e) => setPattern(e.target.value)} />
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Категория" /></SelectTrigger>
            <SelectContent>{cats?.all.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="submit" disabled={!pattern.trim() || !cat}>Добави правило</Button>
        </form>
      </div>
    </div>
  );
}
