-- Upgrade existing comment likes into like/dislike reactions.
-- Existing rows remain likes because of the column default.
ALTER TABLE public.dictation_comment_likes
ADD COLUMN IF NOT EXISTS reaction TEXT NOT NULL DEFAULT 'like';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'dictation_comment_likes_reaction_check'
          AND conrelid = 'public.dictation_comment_likes'::regclass
    ) THEN
        ALTER TABLE public.dictation_comment_likes
        ADD CONSTRAINT dictation_comment_likes_reaction_check
        CHECK (reaction IN ('like', 'dislike'));
    END IF;
END
$$;

DROP POLICY IF EXISTS "Users can update their reaction" ON public.dictation_comment_likes;
CREATE POLICY "Users can update their reaction"
ON public.dictation_comment_likes
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
