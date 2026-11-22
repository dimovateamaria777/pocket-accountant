import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Kind, Tx } from "@/lib/finance";

/** One filter shape shared by the dashboard, the assistant and the payment list. */
export interface TxQueryFilter {
  from?: string | null;
  to?: string | null;
  category?: string | null;
  merchant?: string | null;
  kinds?: Kind[] | null;
  hidden?: string[] | null;
  search?: string | null;
}

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
  by_category_merchant: { category: string; merchant: string; total: number }[];
  income_by_source: { source: string; total: number }[];
  investments: { destination: string; total: number }[];
  by_month: { month: string; spending: number; income: number }[];
  top_merchants: { merchant: string; total: number }[];
  sample: { date: string; merchant: string; amount: number; kind: string }[];
}

/** Spending = expenses and refunds (refunds reduce the total); transfers are never included. */
export const SPENDING_KINDS: Kind[] = ["expense", "refund"];

export function filterArgs(f: TxQueryFilter) {
  const args: {
    p_from?: string;
    p_to?: string;
    p_category?: string;
    p_merchant?: string;
    p_kinds?: string[];
    p_hidden?: string[];
    p_search?: string;
  } = {};
  if (f.from) args.p_from = f.from;
  if (f.to) args.p_to = f.to;
  if (f.category?.trim()) args.p_category = f.category.trim();
  if (f.merchant?.trim()) args.p_merchant = f.merchant.trim();
  if (f.kinds?.length) args.p_kinds = [...f.kinds];
  if (f.hidden?.length) args.p_hidden = [...f.hidden];
  if (f.search?.trim()) args.p_search = f.search.trim();
  return args;
}

export async function fetchTxSummary(
  client: SupabaseClient<Database>,
  f: TxQueryFilter = {},
): Promise<TxSummary> {
  const { data, error } = await client.rpc("tx_summary", filterArgs(f));
  if (error) throw error;
  return data as unknown as TxSummary;
}

export async function fetchTxPage(
  client: SupabaseClient<Database>,
  f: TxQueryFilter,
  opts: { sort: string; direction: string; limit: number; offset: number },
): Promise<{ total: number; rows: Tx[] }> {
  const { data, error } = await client.rpc("tx_page", {
    ...filterArgs(f),
    p_sort: opts.sort,
    p_dir: opts.direction,
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) throw error;
  const page = data as unknown as { total: number; rows: Tx[] };
  return {
    total: Number(page.total),
    rows: page.rows.map((t) => ({ ...t, amount: Number(t.amount) })),
  };
}
