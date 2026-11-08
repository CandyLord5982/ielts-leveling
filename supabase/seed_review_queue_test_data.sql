-- Seed data: 3 wrong multiple-choice attempts for the admin test account
-- (kuten99x@gmail.com), using real existing exercises/questions, so /review
-- has something to show. Safe to delete afterwards - see cleanup query below.
INSERT INTO public.question_attempts
  (user_id, exercise_id, exercise_type, question_id, selected_answer, correct_answer, is_correct, attempt_number)
VALUES
  ('a28f02c9-16be-46a9-bf08-83ab510a66cb', 'e57b7518-23d6-42c4-9a83-600e156bd7db', 'multiple_choice', 'q1777368335447_2', 'is going to rain', 'will rain', false, 1),
  ('a28f02c9-16be-46a9-bf08-83ab510a66cb', '28fe73f0-bb89-4c67-a7fa-443cf24fafe9', 'multiple_choice', 'q1778662002214_14', 'Pic B', 'Pic A', false, 1),
  ('a28f02c9-16be-46a9-bf08-83ab510a66cb', '59afca06-340f-4897-ab1c-f65b1d3b9606', 'multiple_choice', 'q1778662386317_7', 'she', 'her', false, 1);

-- To remove this seed data later:
-- DELETE FROM public.question_attempts WHERE user_id = 'a28f02c9-16be-46a9-bf08-83ab510a66cb' AND attempt_number = 1
--   AND question_id IN ('q1777368335447_2', 'q1778662002214_14', 'q1778662386317_7');
-- DELETE FROM public.question_reviews WHERE user_id = 'a28f02c9-16be-46a9-bf08-83ab510a66cb'
--   AND question_id IN ('q1777368335447_2', 'q1778662002214_14', 'q1778662386317_7');
