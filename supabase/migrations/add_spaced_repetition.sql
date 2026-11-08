-- Spaced repetition queue for missed multiple-choice questions. One row per
-- (user, question). Scheduling math (simplified SM-2) lives in the app
-- (src/utils/srs.js), not in SQL - this table just holds state.
CREATE TABLE public.question_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  question_id text NOT NULL, -- question.id within exercises.content.questions
  ease_factor numeric NOT NULL DEFAULT 2.5,
  interval_days numeric NOT NULL DEFAULT 0,
  repetitions integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT question_reviews_unique UNIQUE (user_id, exercise_id, question_id)
);

CREATE INDEX idx_question_reviews_due ON public.question_reviews (user_id, due_at);

ALTER TABLE public.question_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own question reviews"
  ON public.question_reviews FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
