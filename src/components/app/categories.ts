import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, kindForCategory, ruleMatches, type Kind } from "@/lib/finance";

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () => {
    const { data, error } = await supabase.from("custom_categories").select("id, name").order("name");
    if (error) throw error;
    return { custom: data ?? [], all: [...CATEGORIES, ...(data ?? []).map((c) => c.name).filter((n) => !(CATEGORIES as readonly string[]).includes(n))] };
  },
});

export const rulesQuery = queryOptions({
  queryKey: ["category_rules"],
  queryFn: async () => {
    const { data, error } = await supabase.from("category_rules").select("id, pattern, category").order("created_at");
    if (error) throw error;
    return data ?? [];
  },
});

export async function addCategory(name: string) {
  const n = name.trim();
  if (!n || (CATEGORIES as readonly string[]).includes(n)) return;
  const { error } = await supabase.from("custom_categories").upsert({ name: n }, { onConflict: "user_id,name", ignoreDuplicates: true });
  if (error) throw error;
}

/** Saves a text rule and re-categorises existing matching transactions. Returns how many changed. */
export async function applyRule(pattern: string, category: string) {
  await addCategory(category);
  const { error } = await supabase.from("category_rules").insert({ pattern: pattern.trim(), category });
  if (error) throw error;
  const { data: txs, error: e2 } = await supabase.from("transactions").select("id, merchant, description, kind").limit(10000);
  if (e2) throw e2;
  const hits = (txs ?? []).filter((t) => ruleMatches(t, pattern));
  for (const t of hits) {
    await supabase.from("transactions").update({ category, kind: kindForCategory(category, t.kind as Kind) }).eq("id", t.id);
  }
  return hits.length;
}
