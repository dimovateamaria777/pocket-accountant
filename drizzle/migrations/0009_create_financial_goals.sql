CREATE TABLE public.financial_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  goal_type TEXT NOT NULL CHECK (goal_type IN ('monthly_limit', 'savings')),
  category TEXT,
  target_amount NUMERIC(12,2) NOT NULL CHECK (target_amount > 0),
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT monthly_limit_goal_fields CHECK (
    goal_type <> 'monthly_limit' OR (category IS NOT NULL AND char_length(btrim(category)) > 0 AND deadline IS NULL)
  ),
  CONSTRAINT savings_goal_fields CHECK (
    goal_type <> 'savings' OR (deadline IS NOT NULL AND category IS NULL)
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_goals TO authenticated;
GRANT ALL ON public.financial_goals TO service_role;
ALTER TABLE public.financial_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own financial goals" ON public.financial_goals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create own financial goals" ON public.financial_goals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own financial goals" ON public.financial_goals FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own financial goals" ON public.financial_goals FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX financial_goals_user_created_idx ON public.financial_goals (user_id, created_at DESC);

CREATE TABLE public.goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES public.financial_goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  contribution_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_contributions TO authenticated;
GRANT ALL ON public.goal_contributions TO service_role;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own goal contributions" ON public.goal_contributions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create contributions to own goals" ON public.goal_contributions FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.financial_goals g WHERE g.id = goal_id AND g.user_id = auth.uid()
  )
);
CREATE POLICY "Users can update own goal contributions" ON public.goal_contributions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.financial_goals g WHERE g.id = goal_id AND g.user_id = auth.uid()
  )
);
CREATE POLICY "Users can delete own goal contributions" ON public.goal_contributions FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX goal_contributions_user_goal_date_idx ON public.goal_contributions (user_id, goal_id, contribution_date DESC);