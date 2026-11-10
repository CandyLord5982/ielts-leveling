-- Online Battle: teacher draws on top of the slides (pen / highlighter), per page.
--
-- Drawings never change the PDF; they are strokes stored per room + slide file + page,
-- in coordinates relative to the page (0..1), so they line up on every screen size.
-- Live drawing and the laser pointer go over the realtime channel only; finished
-- strokes are saved here so students who join late or refresh still see them.
--
--   stroke = { tool: 'pen' | 'highlighter', color: '#rrggbb', w: <width / page width>,
--              pts: [[x, y], ...] }
--
-- The teacher writes this table directly (staff policy). Students read it through
-- online_battle_slide_strokes().
--
-- Run after add_online_battle_slides_pause.sql. Safe to run again.

BEGIN;

CREATE TABLE IF NOT EXISTS public.online_battle_slide_strokes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.online_battle_rooms(id) ON DELETE CASCADE,
  slide_url text NOT NULL,
  page integer NOT NULL CHECK (page >= 1),
  stroke jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS online_battle_slide_strokes_page_idx
  ON public.online_battle_slide_strokes (room_id, slide_url, page, created_at);

ALTER TABLE public.online_battle_slide_strokes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage online battle slide strokes" ON public.online_battle_slide_strokes;
CREATE POLICY "Staff manage online battle slide strokes" ON public.online_battle_slide_strokes
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- Strokes on one page, oldest first. For staff and for students in the room.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_slide_strokes(p_room_id uuid, p_slide_url text, p_page integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF NOT public.is_staff(v_uid) AND NOT EXISTS (
    SELECT 1 FROM public.online_battle_participants p
    WHERE p.room_id = p_room_id AND p.user_id = v_uid
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'stroke', s.stroke)
                              ORDER BY s.created_at, s.id), '[]'::jsonb)
    FROM public.online_battle_slide_strokes s
    WHERE s.room_id = p_room_id AND s.slide_url = p_slide_url AND s.page = p_page
  );
END;
$$;

REVOKE ALL ON FUNCTION public.online_battle_slide_strokes(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.online_battle_slide_strokes(uuid, text, integer) TO authenticated;

COMMIT;
