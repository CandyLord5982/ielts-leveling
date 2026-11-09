-- Words a user saved from the dictionary popup, reviewed with spaced repetition
-- (same SM-2 state columns as question_reviews; math lives in src/utils/srs.js).
CREATE TABLE public.saved_words (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  word text NOT NULL, -- lowercased
  phonetic text,
  part_of_speech text,
  definition text NOT NULL,
  example text,
  ease_factor numeric NOT NULL DEFAULT 2.5,
  interval_days numeric NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_words_pkey PRIMARY KEY (id),
  CONSTRAINT saved_words_unique UNIQUE (user_id, word)
);

CREATE INDEX idx_saved_words_due ON public.saved_words (user_id, due_at);

ALTER TABLE public.saved_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own saved words"
  ON public.saved_words FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
