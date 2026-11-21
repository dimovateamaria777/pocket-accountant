import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tx } from "@/lib/finance";

export const txQuery = queryOptions({
  queryKey: ["transactions"],
  queryFn: async (): Promise<Tx[]> => {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, tx_date, description, merchant, amount, kind, category")
      .order("tx_date", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount), kind: t.kind as Tx["kind"] }));
  },
});
