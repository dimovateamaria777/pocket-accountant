CREATE TABLE public.bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  provider TEXT NOT NULL DEFAULT 'enable_banking',
  session_id UUID NOT NULL,
  bank_name TEXT NOT NULL,
  bank_country TEXT NOT NULL,
  accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  access_valid_until TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_connections TO authenticated;
GRANT ALL ON public.bank_connections TO service_role;
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bank connections" ON public.bank_connections FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.bank_connection_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  state UUID NOT NULL UNIQUE,
  bank_name TEXT NOT NULL,
  bank_country TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, DELETE ON public.bank_connection_attempts TO authenticated;
GRANT ALL ON public.bank_connection_attempts TO service_role;
ALTER TABLE public.bank_connection_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own bank connection attempts" ON public.bank_connection_attempts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "create own bank connection attempts" ON public.bank_connection_attempts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete own bank connection attempts" ON public.bank_connection_attempts FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.transactions ADD COLUMN external_id TEXT;
ALTER TABLE public.transactions ADD COLUMN bank_connection_id UUID REFERENCES public.bank_connections(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN bank_account_id TEXT;
CREATE UNIQUE INDEX transactions_unique_bank_entry ON public.transactions (user_id, bank_account_id, external_id) WHERE external_id IS NOT NULL AND bank_account_id IS NOT NULL;
CREATE INDEX transactions_bank_connection_idx ON public.transactions (bank_connection_id);