-- ============================================================
-- Pet Question Bank Migration
-- Run this in your Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pet_question_bank (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  question text NOT NULL,
  choices jsonb NOT NULL,
  answer_index integer NOT NULL,
  image_url text,
  category text,
  min_level integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pet_question_bank_pkey PRIMARY KEY (id)
);

-- Enable RLS
ALTER TABLE public.pet_question_bank ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY "Admins can manage question bank"
  ON public.pet_question_bank FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- All authenticated users can read active questions
CREATE POLICY "Users can read active questions"
  ON public.pet_question_bank FOR SELECT
  USING (is_active = true);

-- ── Seed Data ────────────────────────────────────────────────
-- Mixed English vocabulary & general knowledge questions for kids
-- answer_index is 0-based

INSERT INTO public.pet_question_bank (question, choices, answer_index, category, min_level) VALUES

-- ── Prepositions (level 3) ──
('The cat is ___ the table. (trên bàn)', '["in", "on", "at", "under"]', 1, 'prepositions', 3),
('She is ___ school now.', '["on", "in", "at", "to"]', 2, 'prepositions', 3),
('The ball is ___ the box. (trong hộp)', '["on", "at", "in", "under"]', 2, 'prepositions', 3),
('The dog is ___ the chair. (dưới ghế)', '["on", "in", "under", "at"]', 2, 'prepositions', 3),
('We go to school ___ the morning.', '["at", "on", "in", "to"]', 2, 'prepositions', 3),
('My birthday is ___ July.', '["on", "at", "in", "to"]', 2, 'prepositions', 3),
('He was born ___ 2015.', '["on", "at", "in", "for"]', 2, 'prepositions', 3),
('The picture is ___ the wall.', '["in", "on", "at", "under"]', 1, 'prepositions', 3),
('I live ___ Hanoi.', '["on", "at", "in", "to"]', 2, 'prepositions', 3),
('She sits ___ to me in class.', '["near", "next", "beside", "close"]', 1, 'prepositions', 3),

-- ── Prepositions (level 4) ──
('I am interested ___ English.', '["on", "at", "in", "for"]', 2, 'prepositions', 4),
('She is good ___ singing.', '["in", "at", "on", "for"]', 1, 'prepositions', 4),
('We arrived ___ the airport early.', '["in", "on", "at", "to"]', 2, 'prepositions', 4),
('He is afraid ___ spiders.', '["at", "of", "on", "in"]', 1, 'prepositions', 4),
('This book belongs ___ me.', '["for", "at", "to", "with"]', 2, 'prepositions', 4),
('I am waiting ___ the bus.', '["to", "at", "on", "for"]', 3, 'prepositions', 4),
('She is different ___ her sister.', '["with", "to", "from", "of"]', 2, 'prepositions', 4),
('He depends ___ his parents.', '["in", "on", "at", "for"]', 1, 'prepositions', 4),

-- ── Present Simple Tense (level 3) ──
('She ___ to school every day.', '["go", "goes", "going", "gone"]', 1, 'tenses', 3),
('They ___ football on Sundays.', '["plays", "play", "playing", "played"]', 1, 'tenses', 3),
('He ___ breakfast at 7 a.m.', '["have", "has", "having", "had"]', 1, 'tenses', 3),
('My mom ___ very well.', '["cook", "cooks", "cooking", "cooked"]', 1, 'tenses', 3),
('I ___ like coffee.', '["doesn''t", "don''t", "isn''t", "aren''t"]', 1, 'tenses', 3),
('___ she speak English?', '["Do", "Does", "Is", "Are"]', 1, 'tenses', 3),
('Water ___ at 100°C.', '["boil", "boils", "boiling", "boiled"]', 1, 'tenses', 3),
('The sun ___ in the east.', '["rise", "rises", "rising", "rose"]', 1, 'tenses', 3),

-- ── Present Continuous Tense (level 4) ──
('Look! She ___ now.', '["dances", "dance", "is dancing", "danced"]', 2, 'tenses', 4),
('They ___ TV at the moment.', '["watch", "watches", "are watching", "watched"]', 2, 'tenses', 4),
('He ___ a book right now.', '["reads", "read", "is reading", "was reading"]', 2, 'tenses', 4),
('I ___ my homework now.', '["do", "does", "am doing", "did"]', 2, 'tenses', 4),
('Be quiet! The baby ___.', '["sleeps", "sleep", "is sleeping", "slept"]', 2, 'tenses', 4),
('We ___ to music at the moment.', '["listen", "listens", "are listening", "listened"]', 2, 'tenses', 4),

-- ── Past Simple Tense (level 4) ──
('I ___ to the park yesterday.', '["go", "goes", "going", "went"]', 3, 'tenses', 4),
('She ___ a delicious cake last night.', '["make", "makes", "making", "made"]', 3, 'tenses', 4),
('They ___ soccer last Sunday.', '["play", "plays", "played", "playing"]', 2, 'tenses', 4),
('He ___ his homework 2 hours ago.', '["finish", "finishes", "finishing", "finished"]', 3, 'tenses', 4),
('We ___ a good movie last week.', '["see", "sees", "saw", "seeing"]', 2, 'tenses', 4),
('She ___ come to school yesterday.', '["don''t", "doesn''t", "didn''t", "isn''t"]', 2, 'tenses', 4),

-- ── Future Simple Tense (level 5) ──
('I ___ you tomorrow.', '["call", "called", "will call", "calling"]', 2, 'tenses', 5),
('She ___ 12 years old next month.', '["is", "was", "will be", "has been"]', 2, 'tenses', 5),
('They ___ to Japan next year.', '["travel", "traveled", "will travel", "traveling"]', 2, 'tenses', 5),
('It ___ rain tomorrow.', '["is", "was", "will", "does"]', 2, 'tenses', 5),

-- ── Grammar: Articles (level 3) ──
('I have ___ apple.', '["a", "an", "the", "—"]', 1, 'grammar', 3),
('She is ___ doctor.', '["a", "an", "the", "—"]', 0, 'grammar', 3),
('___ sun is very bright today.', '["A", "An", "The", "—"]', 2, 'grammar', 3),
('He plays ___ piano very well.', '["a", "an", "the", "—"]', 2, 'grammar', 3),
('I want ___ umbrella.', '["a", "an", "the", "—"]', 1, 'grammar', 3),
('This is ___ honest man.', '["a", "an", "the", "—"]', 1, 'grammar', 3),

-- ── Grammar: Pronouns & Possessives (level 3) ──
('This is my book. It is ___.', '["me", "my", "mine", "I"]', 2, 'grammar', 3),
('___ is a student. (Cô ấy)', '["He", "She", "It", "They"]', 1, 'grammar', 3),
('Those books are ___. (của họ)', '["they", "them", "their", "theirs"]', 3, 'grammar', 3),
('Give it to ___. (tôi)', '["I", "my", "mine", "me"]', 3, 'grammar', 3),

-- ── Grammar: Comparatives & Superlatives (level 4) ──
('She is ___ than her brother.', '["tall", "taller", "tallest", "more tall"]', 1, 'grammar', 4),
('This is the ___ book in the library.', '["old", "older", "oldest", "more old"]', 2, 'grammar', 4),
('My house is ___ than yours.', '["big", "bigger", "biggest", "more big"]', 1, 'grammar', 4),
('He is the ___ student in class.', '["smart", "smarter", "smartest", "more smart"]', 2, 'grammar', 4),
('This test is ___ than the last one.', '["difficult", "difficulter", "more difficult", "most difficult"]', 2, 'grammar', 4),
('She is the ___ girl in school.', '["beautiful", "more beautiful", "most beautiful", "beautifulest"]', 2, 'grammar', 4),

-- ── Grammar: Question Words (level 3) ──
('___ is your name?', '["Who", "What", "Where", "When"]', 1, 'grammar', 3),
('___ do you live?', '["Who", "What", "Where", "When"]', 2, 'grammar', 3),
('___ old are you?', '["What", "How", "Who", "Where"]', 1, 'grammar', 3),
('___ is your birthday?', '["Who", "What", "Where", "When"]', 3, 'grammar', 3),
('___ bag is this? — It''s mine.', '["Who", "What", "Whose", "Which"]', 2, 'grammar', 3),
('___ do you go to school? — By bus.', '["What", "Where", "When", "How"]', 3, 'grammar', 3),

-- ── Grammar: Modal Verbs (level 5) ──
('You ___ brush your teeth every day.', '["can", "should", "may", "might"]', 1, 'grammar', 5),
('___ I borrow your pen?', '["Will", "Shall", "May", "Must"]', 2, 'grammar', 5),
('She ___ swim when she was 5.', '["can", "could", "may", "must"]', 1, 'grammar', 5),
('You ___ not cheat on exams.', '["can", "may", "must", "could"]', 2, 'grammar', 5),
('He ___ be at home. I''m not sure.', '["must", "should", "might", "will"]', 2, 'grammar', 5),

-- ── Grammar: Conjunctions (level 5) ──
('I like tea ___ coffee.', '["but", "and", "or", "so"]', 1, 'grammar', 5),
('She studied hard ___ she passed the exam.', '["but", "or", "so", "because"]', 2, 'grammar', 5),
('He was tired ___ he went to bed early.', '["but", "and", "or", "so"]', 3, 'grammar', 5),
('I want to go ___ it is raining.', '["and", "so", "but", "or"]', 2, 'grammar', 5),
('She didn''t go to school ___ she was sick.', '["so", "but", "and", "because"]', 3, 'grammar', 5),

-- ── Grammar: Countable vs Uncountable (level 5) ──
('How ___ water do you drink?', '["many", "much", "a lot", "few"]', 1, 'grammar', 5),
('How ___ books do you have?', '["much", "many", "a lot", "little"]', 1, 'grammar', 5),
('There is ___ milk in the fridge.', '["a few", "many", "a little", "few"]', 2, 'grammar', 5),
('There are ___ apples on the table.', '["much", "a little", "a few", "little"]', 2, 'grammar', 5),
('I don''t have ___ money.', '["many", "much", "few", "a few"]', 1, 'grammar', 5);
