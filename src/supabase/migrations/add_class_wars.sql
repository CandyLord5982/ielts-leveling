-- Class War feature: team-based competition within courses

CREATE TABLE public.class_wars (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  course_id uuid NOT NULL,
  name text DEFAULT 'Class War',
  team_a_name text DEFAULT 'Red Team',
  team_b_name text DEFAULT 'Blue Team',
  status text DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at timestamp with time zone DEFAULT now(),
  ended_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT class_wars_pkey PRIMARY KEY (id),
  CONSTRAINT class_wars_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT class_wars_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

CREATE TABLE public.class_war_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  war_id uuid NOT NULL,
  user_id uuid NOT NULL,
  team text NOT NULL CHECK (team IN ('A', 'B')),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT class_war_members_pkey PRIMARY KEY (id),
  CONSTRAINT class_war_members_war_id_fkey FOREIGN KEY (war_id) REFERENCES public.class_wars(id) ON DELETE CASCADE,
  CONSTRAINT class_war_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT class_war_members_unique UNIQUE (war_id, user_id)
);

-- RLS policies
ALTER TABLE public.class_wars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_war_members ENABLE ROW LEVEL SECURITY;

-- Everyone can read class wars
CREATE POLICY "class_wars_select" ON public.class_wars FOR SELECT USING (true);
CREATE POLICY "class_war_members_select" ON public.class_war_members FOR SELECT USING (true);

-- Only admins/teachers can manage
CREATE POLICY "class_wars_insert" ON public.class_wars FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
);
CREATE POLICY "class_wars_update" ON public.class_wars FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
);
CREATE POLICY "class_wars_delete" ON public.class_wars FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
);
CREATE POLICY "class_war_members_insert" ON public.class_war_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
);
CREATE POLICY "class_war_members_update" ON public.class_war_members FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
);
CREATE POLICY "class_war_members_delete" ON public.class_war_members FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
);
