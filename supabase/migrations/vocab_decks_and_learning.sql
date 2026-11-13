-- Word bank decks (SAT now, IELTS later) + flashcard "learn" flow.
--
-- pet_word_bank gains a deck and optional structured card fields. `hint` stays the source
-- of truth (the pet games read it, admins edit it). The flashcard splits hint
-- ("definition; syn1, syn2") unless definition/synonyms are filled in — they're there for
-- richer imports (e.g. IELTS with examples), not backfilled, so they can't drift from hint.
--
-- Learning a word = inserting it into saved_words with bank_word_id set, so it joins
-- the existing SM-2 review queue (/review/vocab). Games train on those words.
-- A deck word counts as learned when the user has a saved word with the same spelling
-- (saved_words is unique per (user_id, word), so learning "mitigate" in one deck
-- covers it in every deck).

BEGIN;

-- ── pet_word_bank ────────────────────────────────────────────────
ALTER TABLE public.pet_word_bank
  ADD COLUMN IF NOT EXISTS deck text NOT NULL DEFAULT 'sat',
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS part_of_speech text,
  ADD COLUMN IF NOT EXISTS phonetic text,
  ADD COLUMN IF NOT EXISTS definition text,
  ADD COLUMN IF NOT EXISTS synonyms text[],
  ADD COLUMN IF NOT EXISTS example text;

-- The default only exists to fill the current rows. Without it, an import that forgets
-- the deck column fails instead of silently landing in SAT.
ALTER TABLE public.pet_word_bank ALTER COLUMN deck DROP DEFAULT;

-- Same word may appear in several decks (with a deck-specific meaning/example).
ALTER TABLE public.pet_word_bank DROP CONSTRAINT IF EXISTS pet_word_bank_word_key;
ALTER TABLE public.pet_word_bank ADD CONSTRAINT pet_word_bank_deck_word_key UNIQUE (deck, word);

-- ── saved_words ──────────────────────────────────────────────────
ALTER TABLE public.saved_words
  ADD COLUMN IF NOT EXISTS bank_word_id uuid REFERENCES public.pet_word_bank(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_saved_words_bank_word
  ON public.saved_words (user_id) WHERE bank_word_id IS NOT NULL;

-- Any saved word that's also a bank word links to it, whichever path saved it
-- (learn flashcards, dictionary popup, manual "Thêm từ", or a rename).
CREATE OR REPLACE FUNCTION public.saved_words_link_bank_word()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.bank_word_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.word IS NOT DISTINCT FROM OLD.word THEN
    RETURN NEW;
  END IF;
  SELECT id INTO NEW.bank_word_id
  FROM pet_word_bank
  WHERE word = NEW.word AND is_active
  ORDER BY created_at
  LIMIT 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS saved_words_link_bank_word ON public.saved_words;
CREATE TRIGGER saved_words_link_bank_word
  BEFORE INSERT OR UPDATE OF word ON public.saved_words
  FOR EACH ROW EXECUTE FUNCTION public.saved_words_link_bank_word();

-- Words already saved from the dictionary that happen to be in the bank count as learned.
UPDATE public.saved_words s
SET bank_word_id = w.id
FROM public.pet_word_bank w
WHERE s.bank_word_id IS NULL AND w.word = s.word;

-- ── RPCs (security invoker: RLS on both tables still applies) ────
-- Per-deck totals and how many of them the caller has learned.
CREATE OR REPLACE FUNCTION public.vocab_deck_progress()
RETURNS TABLE (deck text, total bigint, learned bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT w.deck, count(*), count(s.id)
  FROM pet_word_bank w
  LEFT JOIN saved_words s ON s.user_id = auth.uid() AND s.word = w.word
  WHERE w.is_active
  GROUP BY w.deck
  ORDER BY w.deck;
$$;

-- A random batch of words from a deck the caller hasn't learned yet.
-- Random rather than alphabetical: abase/abate/abdicate in one set blur together.
CREATE OR REPLACE FUNCTION public.pick_new_vocab_words(p_deck text, p_count int DEFAULT 10)
RETURNS SETOF public.pet_word_bank
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
  SELECT w.*
  FROM pet_word_bank w
  WHERE w.deck = p_deck
    AND w.is_active
    AND NOT EXISTS (
      SELECT 1 FROM saved_words s WHERE s.user_id = auth.uid() AND s.word = w.word
    )
  ORDER BY random()
  LIMIT least(greatest(coalesce(p_count, 10), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.vocab_deck_progress() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pick_new_vocab_words(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vocab_deck_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pick_new_vocab_words(text, int) TO authenticated;

COMMIT;

-- PostgREST needs the new FK to embed pet_word_bank from saved_words.
NOTIFY pgrst, 'reload schema';
