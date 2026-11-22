CREATE OR REPLACE FUNCTION public.tx_summary(p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_category text DEFAULT NULL, p_merchant text DEFAULT NULL,
  p_kinds text[] DEFAULT NULL, p_hidden text[] DEFAULT NULL, p_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH base AS (
  SELECT tx_date, description, merchant, amount::numeric AS amount, kind, category
  FROM public.tx_filtered(p_from, p_to, p_category, p_merchant, p_kinds, p_hidden, p_search)
), sp AS (
  SELECT base.*, CASE WHEN kind = 'expense' THEN -amount ELSE -abs(amount) END AS net
  FROM base WHERE kind IN ('expense','refund')
)
SELECT jsonb_build_object(
  'spending_total', (SELECT coalesce(round(sum(net),2),0) FROM sp),
  'spending_count', (SELECT count(*) FROM sp),
  'income_total', (SELECT coalesce(round(sum(amount),2),0) FROM base WHERE kind='income'),
  'income_count', (SELECT count(*) FROM base WHERE kind='income'),
  'transfer_count', (SELECT count(*) FROM base WHERE kind='transfer'),
  'tx_count', (SELECT count(*) FROM base),
  'first_date', (SELECT min(tx_date) FROM base),
  'last_date', (SELECT max(tx_date) FROM base),
  'by_category', (SELECT coalesce(jsonb_agg(jsonb_build_object('category', c.cat, 'total', c.tot) ORDER BY c.tot DESC), '[]'::jsonb) FROM
      (SELECT category AS cat, round(sum(net),2) AS tot FROM sp GROUP BY category HAVING round(sum(net),2) > 0) AS c),
  'by_category_merchant', (SELECT coalesce(jsonb_agg(jsonb_build_object('category', cm.cat, 'merchant', cm.mer, 'total', cm.tot) ORDER BY cm.tot DESC), '[]'::jsonb) FROM
      (SELECT min(category) AS cat,
              min(coalesce(nullif(btrim(merchant),''),'Неуточнен търговец')) AS mer,
              round(sum(net),2) AS tot
       FROM sp
       GROUP BY category, lower(coalesce(nullif(btrim(merchant),''),'Неуточнен търговец'))
       HAVING round(sum(net),2) > 0) AS cm),
  'income_by_source', (SELECT coalesce(jsonb_agg(jsonb_build_object('source', s.src, 'total', s.tot) ORDER BY s.tot DESC), '[]'::jsonb) FROM
      (SELECT min(coalesce(nullif(btrim(merchant),''),'Неуточнен източник')) AS src, round(sum(amount),2) AS tot FROM base WHERE kind='income'
       GROUP BY lower(coalesce(nullif(btrim(merchant),''),'Неуточнен източник')) HAVING round(sum(amount),2) > 0) AS s),
  'investments', (SELECT coalesce(jsonb_agg(jsonb_build_object('destination', inv.dst, 'total', inv.tot) ORDER BY inv.tot DESC), '[]'::jsonb) FROM
      (SELECT min(i.dest) AS dst, round(sum(i.net),2) AS tot FROM
         (SELECT net, coalesce(nullif(btrim(regexp_replace((regexp_match(btrim(description), '(?:purchase\s+of|покупка\s+на)\s+(.+)', 'i'))[1], '[.,;]+$', '')),''),
                               nullif(btrim(merchant),''), nullif(btrim(description),''), 'Неуточнено') AS dest
          FROM sp WHERE lower(category) LIKE '%инвестиц%') AS i
       GROUP BY lower(i.dest) HAVING round(sum(i.net),2) > 0) AS inv),
  'by_month', (SELECT coalesce(jsonb_agg(jsonb_build_object('month', m.mo, 'spending', m.spend, 'income', m.inc) ORDER BY m.mo), '[]'::jsonb) FROM
      (SELECT to_char(tx_date,'YYYY-MM') AS mo,
              round(coalesce(sum(CASE WHEN kind='expense' THEN -amount WHEN kind='refund' THEN -abs(amount) END),0),2) AS spend,
              round(coalesce(sum(CASE WHEN kind='income' THEN amount END),0),2) AS inc
       FROM base GROUP BY to_char(tx_date,'YYYY-MM')) AS m),
  'top_merchants', (SELECT coalesce(jsonb_agg(jsonb_build_object('merchant', t.mer, 'total', t.tot) ORDER BY t.tot DESC), '[]'::jsonb) FROM
      (SELECT merchant AS mer, round(sum(-amount),2) AS tot FROM base WHERE kind='expense' GROUP BY merchant ORDER BY 2 DESC LIMIT 8) AS t),
  'sample', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', x.tx_date, 'merchant', x.merchant, 'amount', x.amount, 'kind', x.kind)), '[]'::jsonb) FROM
      (SELECT tx_date, merchant, amount, kind FROM sp ORDER BY tx_date DESC LIMIT 15) AS x)
);
$$;
REVOKE ALL ON FUNCTION public.tx_summary(date, date, text, text, text[], text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tx_summary(date, date, text, text, text[], text[], text) TO authenticated;