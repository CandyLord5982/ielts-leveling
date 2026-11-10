-- Online Battle: teacher shows slides (a PDF) to the whole room.
--
-- The teacher uploads a PDF (PowerPoint: File > Save As > PDF). While slide_url is set,
-- every student's screen shows that PDF at slide_page, and follows the teacher's page.
-- A live question still takes over the screen; closing the slides (slide_url = NULL)
-- sends everyone back to the scoreboard.
--
-- The teacher writes these columns directly (staff can already update rooms).
-- Students read them through online_battle_state().
--
-- Run after add_online_battle_powerup_button.sql. Safe to run again.

BEGIN;

ALTER TABLE public.online_battle_rooms
  ADD COLUMN IF NOT EXISTS slide_url text,
  ADD COLUMN IF NOT EXISTS slide_page integer NOT NULL DEFAULT 1 CHECK (slide_page >= 1);

-- ---------------------------------------------------------------------------
-- Student state: same as before, plus room.slide_url and room.slide_page.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_state(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.online_battle_rooms%ROWTYPE;
  v_me public.online_battle_participants%ROWTYPE;
  v_q public.online_battle_questions%ROWTYPE;
  v_answer record;
  v_question jsonb := NULL;
  v_revealed boolean;
  v_claimable integer := 0;
  v_powerup_offers integer := 0;
  v_powerups jsonb := '[]'::jsonb;
  v_latest uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO v_room FROM public.online_battle_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('server_now', now(), 'room', NULL);
  END IF;

  SELECT * INTO v_me
  FROM public.online_battle_participants p
  WHERE p.room_id = p_room_id AND p.user_id = v_uid;
  IF NOT FOUND THEN
    -- Not in the room (never joined, or removed by the teacher)
    RETURN jsonb_build_object('server_now', now(), 'room', NULL);
  END IF;

  IF v_room.status = 'active' THEN
    SELECT count(*) INTO v_claimable
    FROM public.online_battle_answers a
    JOIN public.online_battle_questions q ON q.id = a.question_id
    WHERE a.room_id = p_room_id
      AND a.user_id = v_uid
      AND a.is_correct
      AND a.bonus_claimed_at IS NULL
      AND q.status = 'revealed';

    v_latest := public.online_battle_latest_question(p_room_id);

    -- Power-up buttons lit right now: only for the latest question, after its reveal
    SELECT count(*) INTO v_powerup_offers
    FROM public.online_battle_answers a
    JOIN public.online_battle_questions q ON q.id = a.question_id
    WHERE a.room_id = p_room_id
      AND a.user_id = v_uid
      AND a.is_correct
      AND a.powerup_offered
      AND a.powerup_claimed_at IS NULL
      AND q.status = 'revealed'
      AND q.id = v_latest;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', pu.id,
             'kind', pu.kind,
             'question_revealed', q.status = 'revealed',
             -- What Double would add (known once the question is revealed)
             'double_points', CASE WHEN q.status = 'revealed'
                                   THEN coalesce(CASE WHEN v_me.team = 'a' THEN q.team_a_points ELSE q.team_b_points END, 0) END
           ) ORDER BY pu.created_at, pu.id), '[]'::jsonb)
    INTO v_powerups
    FROM public.online_battle_powerups pu
    JOIN public.online_battle_questions q ON q.id = pu.question_id
    WHERE pu.room_id = p_room_id
      AND pu.user_id = v_uid
      AND pu.used_at IS NULL
      AND pu.question_id = v_latest;
  END IF;

  IF v_room.current_question_id IS NOT NULL THEN
    SELECT * INTO v_q
    FROM public.online_battle_questions q
    WHERE q.id = v_room.current_question_id AND q.status IN ('open', 'revealed');

    IF FOUND THEN
      v_revealed := v_q.status = 'revealed';

      SELECT a.selected_option, a.is_correct INTO v_answer
      FROM public.online_battle_answers a
      WHERE a.question_id = v_q.id AND a.user_id = v_uid;

      v_question := jsonb_build_object(
        'id', v_q.id,
        'status', v_q.status,
        'question', v_q.question,
        'question_index', v_q.question_index,
        'time_limit_seconds', v_q.time_limit_seconds,
        'points_max', v_q.points_max,
        'opened_at', v_q.opened_at,
        'closes_at', v_q.closes_at,
        'my_answer', v_answer.selected_option,
        -- Only after the teacher reveals:
        'correct_answer', CASE WHEN v_revealed THEN v_q.correct_answer END,
        'my_correct', CASE WHEN v_revealed THEN v_answer.is_correct END,
        'team_a_total', CASE WHEN v_revealed THEN v_q.team_a_total END,
        'team_a_correct', CASE WHEN v_revealed THEN v_q.team_a_correct END,
        'team_a_points', CASE WHEN v_revealed THEN v_q.team_a_points END,
        'team_b_total', CASE WHEN v_revealed THEN v_q.team_b_total END,
        'team_b_correct', CASE WHEN v_revealed THEN v_q.team_b_correct END,
        'team_b_points', CASE WHEN v_revealed THEN v_q.team_b_points END
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'server_now', now(),
    'room', jsonb_build_object(
      'id', v_room.id,
      'course_id', v_room.course_id,
      'status', v_room.status,
      'team_a_name', v_room.team_a_name,
      'team_b_name', v_room.team_b_name,
      'team_a_score', v_room.team_a_score,
      'team_b_score', v_room.team_b_score,
      'winner_team', v_room.winner_team,
      'slide_url', v_room.slide_url,
      'slide_page', v_room.slide_page
    ),
    'me', jsonb_build_object(
      'team', v_me.team,
      'xp_awarded', v_me.xp_awarded,
      'claimable_points', v_claimable,
      'powerup_offers', v_powerup_offers,
      'powerups', v_powerups
    ),
    'participants', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'user_id', p.user_id,
        'user_pet_id', p.user_pet_id,
        'team', p.team,
        'xp_awarded', p.xp_awarded
      ) ORDER BY p.joined_at, p.id), '[]'::jsonb)
      FROM public.online_battle_participants p
      WHERE p.room_id = p_room_id
    ),
    'events', (
      SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC, e.id), '[]'::jsonb)
      FROM (
        SELECT ev.id, ev.created_at, ev.kind, ev.team, ev.user_id, ev.points, ev.detail
        FROM public.online_battle_events ev
        WHERE ev.room_id = p_room_id
        ORDER BY ev.created_at DESC, ev.id
        LIMIT 20
      ) e
    ),
    'question', v_question
  );
END;
$$;

COMMIT;
