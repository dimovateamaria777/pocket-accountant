ALTER TABLE public.statements ADD COLUMN file_hash text;
CREATE UNIQUE INDEX statements_user_file_hash_key ON public.statements (user_id, file_hash) WHERE file_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_statement_import(p_file_name text, p_source text, p_file_hash text, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid; v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_file_hash IS NULL OR length(p_file_hash) <> 64 THEN RAISE EXCEPTION 'invalid_hash'; END IF;
  v_count := jsonb_array_length(p_rows);
  BEGIN
    INSERT INTO public.statements (user_id, file_name, source, tx_count, file_hash)
    VALUES (auth.uid(), p_file_name, p_source, v_count, p_file_hash) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'duplicate_statement' USING ERRCODE = 'P0001';
  END;
  INSERT INTO public.transactions (user_id, statement_id, tx_date, description, merchant, amount, original_amount, original_currency, kind, category)
  SELECT auth.uid(), v_id, r.tx_date, r.description, r.merchant, round(r.amount, 2), r.original_amount, r.original_currency, r.kind, r.category
  FROM jsonb_to_recordset(p_rows) AS r(tx_date date, description text, merchant text, amount numeric, original_amount numeric, original_currency text, kind text, category text);
  RETURN jsonb_build_object('id', v_id, 'count', v_count);
END $$;
REVOKE ALL ON FUNCTION public.save_statement_import(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_statement_import(text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.tx_summary(p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_category text DEFAULT NULL, p_merchant text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH base AS (
  SELECT tx_date, description, merchant, amount::numeric AS amount, kind, category
  FROM public.transactions
  WHERE user_id = auth.uid()
    AND (p_from IS NULL OR tx_date >= p_from)
    AND (p_to IS NULL OR tx_date <= p_to)
    AND (p_category IS NULL OR lower(category) = lower(p_category))
    AND (p_merchant IS NULL OR strpos(lower(merchant), lower(p_merchant)) > 0)
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
REVOKE ALL ON FUNCTION public.tx_summary(date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tx_summary(date, date, text, text) TO authenticated;