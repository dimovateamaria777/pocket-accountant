import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchTxSummary } from "@/lib/summary";

/** Whole-account totals from the database; the dashboard and the assistant share this calculation. */
export const summaryQuery = queryOptions({
  queryKey: ["transactions", "summary", {}],
  queryFn: () => fetchTxSummary(supabase),
});
