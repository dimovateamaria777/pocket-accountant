import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { TxFilter } from "@/lib/finance";

/** Totals computed in the database over ALL of the user's matching transactions (no row limit). */
export interface TxSummary {
  spending_total: number;
  spending_count: number;
  income_total: number;
  income_count: number;
  transfer_count: number;
  tx_count: number;
  first_date: string | null;
  last_date: string | null;
  by_category: { category: string; total: number }[];
  income_by_source: { source: string; total: number }[];
  investments: { destination: string; total: number }[];
  by_month: { month: string; spending: number; income: number }[];
  top_merchants: { merchant: string; total: number }[];
  sample: { date: string; merchant: string; amount: number; kind: string }[];
}

export async function fetchTxSummary(
  client: SupabaseClient<Database>,
  f: TxFilter = {},
): Promise<TxSummary> {
  const args: Record<string, string> = {};
  if (f.from) args["p_from"] = f.from;
  if (f.to) args["p_to"] = f.to;
  if (f.category) args["p_category"] = f.category;
  if (f.merchant) args["p_merchant"] = f.merchant;
  const { data, error } = await client.rpc("tx_summary", args);
  if (error) throw error;
  return data as unknown as TxSummary;
}
