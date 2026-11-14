-- Bank words a student marked "Đã biết" (already know) in the word bank page, so they're
-- hidden from the list. Not part of review and don't count toward unlocking pet games.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dismissed_words (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bank_word_id uuid NOT NULL REFERENCES public.pet_word_bank(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dismissed_words_pkey PRIMARY KEY (user_id, bank_word_id)
);

ALTER TABLE public.dismissed_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own dismissed words" ON public.dismissed_words;
CREATE POLICY "Users manage their own dismissed words"
  ON public.dismissed_words FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.dismissed_words FROM anon;
GRANT SELECT, INSERT, DELETE ON public.dismissed_words TO authenticated;

COMMIT;
