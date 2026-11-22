CREATE TABLE public.infopay_credentials (
  connection_id UUID PRIMARY KEY REFERENCES public.bank_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  credentials_ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.infopay_credentials TO service_role;
ALTER TABLE public.infopay_credentials ENABLE ROW LEVEL SECURITY;
CREATE INDEX infopay_credentials_user_idx ON public.infopay_credentials (user_id);