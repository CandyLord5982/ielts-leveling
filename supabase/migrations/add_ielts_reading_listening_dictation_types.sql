-- Allow the IELTS Reading and Listening Dictation exercise types.
ALTER TABLE public.exercises DROP CONSTRAINT IF EXISTS exercises_exercise_type_check;

ALTER TABLE public.exercises ADD CONSTRAINT exercises_exercise_type_check CHECK ((exercise_type = ANY (ARRAY['flashcard'::text, 'pronunciation'::text, 'fill_blank'::text, 'video'::text, 'quiz'::text, 'multiple_choice'::text, 'listening'::text, 'speaking'::text, 'drag_drop'::text, 'dropdown'::text, 'ai_fill_blank'::text, 'image_hotspot'::text, 'pdf_worksheet'::text, 'speaking_assessment'::text, 'video_upload'::text, 'ielts_reading'::text, 'listening_dictation'::text])));

COMMENT ON COLUMN public.exercises.exercise_type IS 'Exercise types: flashcard, pronunciation, fill_blank, video, quiz, multiple_choice, listening, speaking, drag_drop, dropdown, ai_fill_blank, image_hotspot, pdf_worksheet, speaking_assessment, video_upload, ielts_reading, listening_dictation';
