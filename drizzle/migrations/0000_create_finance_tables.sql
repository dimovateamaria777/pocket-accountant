CREATE TABLE public.statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  file_name text NOT NULL,
  source text,
  tx_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.statements TO authenticated;
GRANT ALL ON public.statements TO service_role;
ALTER TABLE public.statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own statements" ON public.statements FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  statement_id uuid REFERENCES public.statements(id) ON DELETE CASCADE,
  tx_date date NOT NULL,
  description text NOT NULL,
  merchant text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  original_amount numeric(12,2),
  original_currency text,
  kind text NOT NULL DEFAULT 'expense',
  category text NOT NULL DEFAULT 'Други',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_date ON public.transactions(user_id, tx_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.transactions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.merchant_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  merchant text NOT NULL,
  category text NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, merchant)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_rules TO authenticated;
GRANT ALL ON public.merchant_rules TO service_role;
ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rules" ON public.merchant_rules FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());