-- Online Battle: chat with the teacher.
--
-- Students can only talk to the teacher, never to each other:
--   public  - the student asks in front of the class; everyone in the room sees it
--   private - only the student and staff see it (for shy students / "easy" questions)
-- The teacher can post to the whole class or reply privately to one student.
--
-- student_id says whose private conversation a message belongs to:
--   student message          -> the sender
--   teacher private reply    -> the student it is for
--   teacher public message   -> NULL
--
-- While a live question is open, students cannot post publicly (no shouting answers);
-- private questions to the teacher still work.
--
-- Run after add_online_battle_activity.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.online_battle_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.online_battle_rooms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  sender_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  from_teacher boolean NOT NULL DEFAULT false,
  is_private boolean NOT NULL DEFAULT false,
  student_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  CHECK (NOT is_private OR student_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS online_battle_messages_room_idx
  ON public.online_battle_messages (room_id, created_at);

-- Staff can read and delete (moderation). Writes and student reads go through the functions below.
ALTER TABLE public.online_battle_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read online battle messages" ON public.online_battle_messages;
CREATE POLICY "Staff read online battle messages" ON public.online_battle_messages
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff delete online battle messages" ON public.online_battle_messages;
CREATE POLICY "Staff delete online battle messages" ON public.online_battle_messages
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- Send a message.
--   Student: p_private picks public/private; p_student_id is ignored.
--   Staff:   p_private = true needs p_student_id (the student to reply to).
-- Returns { sent: true } or { sent: false, reason }.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_send_message(
  p_room_id uuid,
  p_body text,
  p_private boolean DEFAULT false,
  p_student_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_room public.online_battle_rooms%ROWTYPE;
  v_staff boolean;
  v_question_open boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF v_body = '' THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'empty');
  END IF;
  IF char_length(v_body) > 500 THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'too_long');
  END IF;

  SELECT * INTO v_room FROM public.online_battle_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.status = 'finished' THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'closed');
  END IF;

  v_staff := public.is_staff(v_uid);

  IF v_staff THEN
    IF coalesce(p_private, false) THEN
      IF p_student_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.online_battle_participants p
        WHERE p.room_id = p_room_id AND p.user_id = p_student_id
      ) THEN
        RETURN jsonb_build_object('sent', false, 'reason', 'not_participant');
      END IF;
    END IF;

    INSERT INTO public.online_battle_messages (room_id, sender_id, from_teacher, is_private, student_id, body)
    VALUES (p_room_id, v_uid, true, coalesce(p_private, false),
            CASE WHEN coalesce(p_private, false) THEN p_student_id END, v_body);
    RETURN jsonb_build_object('sent', true);
  END IF;

  -- Student
  IF NOT EXISTS (
    SELECT 1 FROM public.online_battle_participants p
    WHERE p.room_id = p_room_id AND p.user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'not_participant');
  END IF;

  IF NOT coalesce(p_private, false) AND v_room.current_question_id IS NOT NULL THEN
    SELECT q.status = 'open' INTO v_question_open
    FROM public.online_battle_questions q WHERE q.id = v_room.current_question_id;
    IF coalesce(v_question_open, false) THEN
      RETURN jsonb_build_object('sent', false, 'reason', 'question_open');
    END IF;
  END IF;

  -- Simple flood guard: one message every 2 seconds
  IF EXISTS (
    SELECT 1 FROM public.online_battle_messages m
    WHERE m.room_id = p_room_id AND m.sender_id = v_uid AND m.created_at > now() - interval '2 seconds'
  ) THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'too_fast');
  END IF;

  INSERT INTO public.online_battle_messages (room_id, sender_id, from_teacher, is_private, student_id, body)
  VALUES (p_room_id, v_uid, false, coalesce(p_private, false), v_uid, v_body);
  RETURN jsonb_build_object('sent', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- The latest 200 messages the caller may see, oldest first.
--   Staff:   everything in the room
--   Student: public messages + their own private conversation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_messages(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_staff boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  v_staff := public.is_staff(v_uid);

  IF NOT v_staff AND NOT EXISTS (
    SELECT 1 FROM public.online_battle_participants p
    WHERE p.room_id = p_room_id AND p.user_id = v_uid
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at, x.id), '[]'::jsonb)
    FROM (
      SELECT m.id, m.created_at, m.sender_id, m.from_teacher, m.is_private, m.student_id, m.body,
             u.full_name AS sender_name
      FROM public.online_battle_messages m
      LEFT JOIN public.users u ON u.id = m.sender_id
      WHERE m.room_id = p_room_id
        AND (v_staff OR NOT m.is_private OR m.student_id = v_uid)
      ORDER BY m.created_at DESC, m.id
      LIMIT 200
    ) x
  );
END;
$$;

REVOKE ALL ON FUNCTION public.online_battle_send_message(uuid, text, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_battle_messages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.online_battle_send_message(uuid, text, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.online_battle_messages(uuid) TO authenticated;

COMMIT;
