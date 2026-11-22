CREATE TABLE public.import_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  source text NOT NULL,
  file_hash text NOT NULL,
  rows jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes'
);
GRANT ALL ON public.import_previews TO service_role;
ALTER TABLE public.import_previews ENABLE ROW LEVEL SECURITY;
CREATE INDEX import_previews_user_idx ON public.import_previews (user_id);
CREATE INDEX import_previews_expires_idx ON public.import_previews (expires_at);

REVOKE EXECUTE ON FUNCTION public.save_statement_import(text, text, text, jsonb) FROM authenticated;
COMMENT ON FUNCTION public.save_statement_import(text, text, text, jsonb) IS 'DEPRECATED: replaced by commit_import_preview';

CREATE OR REPLACE FUNCTION public.commit_import_preview(p_preview_id uuid, p_corrections jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  p public.import_previews%ROWTYPE;
  c jsonb; r jsonb; v_idx int; v_n int; v_key text;
  v_cat text; v_eur numeric; v_excl boolean; v_kind text;
  v_stmt uuid; v_saved int := 0; v_skipped int := 0;
  v_corr jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO p FROM public.import_previews WHERE id = p_preview_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'preview_not_found'; END IF;
  IF p.expires_at <= now() THEN RAISE EXCEPTION 'preview_expired'; END IF;
  v_n := jsonb_array_length(p.rows);
  IF jsonb_typeof(coalesce(p_corrections, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'invalid_corrections'; END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(p_corrections, '[]'::jsonb)) LOOP
    IF jsonb_typeof(c) <> 'object' OR jsonb_typeof(c->'index') <> 'number' THEN RAISE EXCEPTION 'invalid_corrections'; END IF;
    FOR v_key IN SELECT jsonb_object_keys(c) LOOP
      IF v_key NOT IN ('index','category','eur','exclude') THEN RAISE EXCEPTION 'invalid_corrections'; END IF;
    END LOOP;
    v_idx := (c->>'index')::int;
    IF v_idx < 0 OR v_idx >= v_n OR v_corr ? v_idx::text THEN RAISE EXCEPTION 'invalid_corrections'; END IF;
    IF c ? 'category' AND (jsonb_typeof(c->'category') <> 'string' OR length(btrim(c->>'category')) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'invalid_corrections'; END IF;
    IF c ? 'exclude' AND jsonb_typeof(c->'exclude') <> 'boolean' THEN RAISE EXCEPTION 'invalid_corrections'; END IF;
    IF c ? 'eur' THEN
      IF jsonb_typeof(c->'eur') <> 'number' OR NOT coalesce((p.rows->v_idx->>'needs_review')::boolean, false)
         OR abs((c->>'eur')::numeric) > 100000000 THEN RAISE EXCEPTION 'invalid_corrections'; END IF;
    END IF;
    v_corr := v_corr || jsonb_build_object(v_idx::text, c);
  END LOOP;

  FOR v_idx IN 0 .. v_n - 1 LOOP
    r := p.rows->v_idx; c := coalesce(v_corr->v_idx::text, '{}'::jsonb);
    v_excl := coalesce((c->>'exclude')::boolean, false);
    IF v_excl THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    IF coalesce((r->>'needs_review')::boolean, false) THEN
      IF NOT c ? 'eur' THEN RAISE EXCEPTION 'review_required'; END IF;
      v_eur := round((c->>'eur')::numeric, 2);
      -- keep the direction recognised in the statement
      IF (r->>'direction') = 'out' THEN v_eur := -abs(v_eur); ELSE v_eur := abs(v_eur); END IF;
    ELSE
      v_eur := round((r->>'amount')::numeric, 2);
    END IF;
    v_cat := coalesce(btrim(c->>'category'), r->>'category');
    v_kind := r->>'kind';
    IF c ? 'category' THEN
      v_kind := CASE WHEN v_cat = 'Вътрешен превод' THEN 'transfer'
                     WHEN v_cat = 'Доход' THEN 'income'
                     WHEN v_kind = 'refund' OR v_cat = 'Възстановена сума' THEN 'refund'
                     ELSE 'expense' END;
    END IF;
    IF v_stmt IS NULL THEN
      BEGIN
        INSERT INTO public.statements (user_id, file_name, source, tx_count, file_hash)
        VALUES (v_uid, p.file_name, p.source, 0, p.file_hash) RETURNING id INTO v_stmt;
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'duplicate_statement';
      END;
    END IF;
    INSERT INTO public.transactions (user_id, statement_id, tx_date, description, merchant, amount, original_amount, original_currency, kind, category)
    VALUES (v_uid, v_stmt, (r->>'date')::date, r->>'description', r->>'merchant', v_eur,
            nullif(r->>'original_amount','')::numeric, nullif(r->>'original_currency',''), v_kind, v_cat);
    v_saved := v_saved + 1;
  END LOOP;

  IF v_saved = 0 THEN RAISE EXCEPTION 'nothing_to_save'; END IF;
  UPDATE public.statements SET tx_count = v_saved WHERE id = v_stmt;
  DELETE FROM public.import_previews WHERE id = p.id;
  RETURN jsonb_build_object('statement_id', v_stmt, 'saved', v_saved, 'skipped', v_skipped, 'source', p.source);
END $$;
REVOKE ALL ON FUNCTION public.commit_import_preview(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_import_preview(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_import_preview(p_preview_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.import_previews WHERE id = p_preview_id AND user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.cancel_import_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_import_preview(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.tx_summary(date, date, text, text);

CREATE OR REPLACE FUNCTION public.tx_filtered(p_from date, p_to date, p_category text, p_merchant text, p_kinds text[], p_hidden text[], p_search text)
RETURNS SETOF public.transactions LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT * FROM public.transactions t
  WHERE t.user_id = auth.uid()
    AND (p_from IS NULL OR t.tx_date >= p_from)
    AND (p_to IS NULL OR t.tx_date <= p_to)
    AND (p_category IS NULL OR lower(t.category) = lower(p_category))
    AND (p_merchant IS NULL OR strpos(lower(t.merchant), lower(p_merchant)) > 0)
    AND (p_kinds IS NULL OR cardinality(p_kinds) = 0 OR t.kind = ANY(p_kinds))
    AND (p_hidden IS NULL OR NOT lower(t.category) = ANY(SELECT lower(h) FROM unnest(p_hidden) h))
    AND (p_search IS NULL OR strpos(lower(t.merchant || ' ' || t.description || ' ' || t.category), lower(p_search)) > 0)
$$;
REVOKE ALL ON FUNCTION public.tx_filtered(date, date, text, text, text[], text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tx_filtered(date, date, text, text, text[], text[], text) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.tx_page(p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_category text DEFAULT NULL, p_merchant text DEFAULT NULL,
  p_kinds text[] DEFAULT NULL, p_hidden text[] DEFAULT NULL, p_search text DEFAULT NULL,
  p_sort text DEFAULT 'date', p_dir text DEFAULT 'desc', p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH f AS (SELECT * FROM public.tx_filtered(p_from, p_to, p_category, p_merchant, p_kinds, p_hidden, p_search)),
page AS (
  SELECT id, tx_date, description, merchant, amount, kind, category FROM f
  ORDER BY
    CASE WHEN p_sort = 'category' AND p_dir = 'asc' THEN category END ASC,
    CASE WHEN p_sort = 'category' AND p_dir <> 'asc' THEN category END DESC,
    CASE WHEN p_sort = 'amount' AND p_dir = 'asc' THEN abs(amount) END ASC,
    CASE WHEN p_sort = 'amount' AND p_dir <> 'asc' THEN abs(amount) END DESC,
    CASE WHEN p_sort = 'date' AND p_dir = 'asc' THEN tx_date END ASC,
    tx_date DESC, id
  LIMIT least(greatest(p_limit, 1), 200) OFFSET greatest(p_offset, 0)
)
SELECT jsonb_build_object(
  'total', (SELECT count(*) FROM f),
  'rows', (SELECT coalesce(jsonb_agg(to_jsonb(page)), '[]'::jsonb) FROM page)
);
$$;
REVOKE ALL ON FUNCTION public.tx_page(date, date, text, text, text[], text[], text, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tx_page(date, date, text, text, text[], text[], text, text, text, int, int) TO authenticated;