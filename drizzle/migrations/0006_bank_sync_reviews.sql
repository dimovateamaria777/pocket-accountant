CREATE TABLE public.bank_sync_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bank_connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  bank_account_id text NOT NULL,
  review_key text NOT NULL,
  reason text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','saved','skipped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (user_id, bank_account_id, review_key)
);
GRANT SELECT, INSERT ON public.bank_sync_reviews TO authenticated;
GRANT ALL ON public.bank_sync_reviews TO service_role;
ALTER TABLE public.bank_sync_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reviews read" ON public.bank_sync_reviews FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own reviews insert" ON public.bank_sync_reviews FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND EXISTS (
    SELECT 1 FROM public.bank_connections c WHERE c.id = bank_connection_id AND c.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.resolve_bank_sync_review(_review_id uuid, _action text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.bank_sync_reviews%ROWTYPE;
BEGIN
  IF _action NOT IN ('save','skip') THEN RAISE EXCEPTION 'invalid action'; END IF;
  SELECT * INTO r FROM public.bank_sync_reviews
    WHERE id = _review_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review not found'; END IF;
  IF r.status <> 'pending' THEN RETURN r.status; END IF;
  IF _action = 'save' THEN
    INSERT INTO public.transactions (user_id, bank_connection_id, bank_account_id, external_id,
      tx_date, description, merchant, amount, original_amount, original_currency, kind, category)
    VALUES (r.user_id, r.bank_connection_id, r.bank_account_id, r.review_key,
      (r.payload->>'tx_date')::date, r.payload->>'description', r.payload->>'merchant',
      (r.payload->>'amount')::numeric, NULLIF(r.payload->>'original_amount','')::numeric,
      r.payload->>'original_currency', r.payload->>'kind', r.payload->>'category')
    ON CONFLICT (user_id, bank_account_id, external_id)
      WHERE external_id IS NOT NULL AND bank_account_id IS NOT NULL DO NOTHING;
    UPDATE public.bank_sync_reviews SET status = 'saved', resolved_at = now() WHERE id = r.id;
    RETURN 'saved';
  END IF;
  UPDATE public.bank_sync_reviews SET status = 'skipped', resolved_at = now() WHERE id = r.id;
  RETURN 'skipped';
END $$;
REVOKE ALL ON FUNCTION public.resolve_bank_sync_review(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_bank_sync_review(uuid, text) TO authenticated;