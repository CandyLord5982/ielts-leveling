CREATE TABLE public.dictation_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    exercise_id UUID REFERENCES public.exercises(id) ON DELETE CASCADE,
    sentence_idx INTEGER NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_comment_id UUID REFERENCES public.dictation_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.dictation_comment_likes (
    comment_id UUID REFERENCES public.dictation_comments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL DEFAULT 'like' CHECK (reaction IN ('like', 'dislike')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.dictation_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dictation_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comments" ON public.dictation_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert comments" ON public.dictation_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own comments" ON public.dictation_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own comments" ON public.dictation_comments FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view likes" ON public.dictation_comment_likes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can like" ON public.dictation_comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their reaction" ON public.dictation_comment_likes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON public.dictation_comment_likes FOR DELETE USING (auth.uid() = user_id);

-- Add some indexes for fast lookups
CREATE INDEX idx_dictation_comments_exercise_sentence ON public.dictation_comments (exercise_id, sentence_idx);
CREATE INDEX idx_dictation_comments_parent ON public.dictation_comments (parent_comment_id);
