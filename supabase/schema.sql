-- IELTS Leveling — full public schema
-- Dumped from the live xpclass database (bhlpjvcplrofixogcrqp) on 2026-08-20
-- with pg_dump 18.6 --schema-only --schema=public --no-owner --no-privileges.
-- 73 tables, 1 view, 70 functions, 180 policies, 23 triggers, 70 indexes.
-- This supersedes src/supabase/Schema.sql, which was missing 7 tables and 46 functions.
-- Not included (applied separately): pg_cron jobs, storage buckets + policies.

--
-- PostgreSQL database dump
--

\restrict RlfkNPyFY2yxh5bJOHud1cYE1Ph3SL7IVkfuKGIDwIukL4IYnvIYTLUYgqMSKum

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: add_xp_batch(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_xp_batch(updates jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    UPDATE users
    SET xp = COALESCE(xp, 0) + (item->>'xp')::int,
        updated_at = now()
    WHERE id = (item->>'student_id')::uuid;
  END LOOP;
END;
$$;


--
-- Name: adopt_pet(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adopt_pet(p_user_id uuid, p_pet_id uuid, p_nickname text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  pet_record record;
  new_user_pet_id uuid;
  user_gem_balance integer;
BEGIN
  -- Get pet details
  SELECT * INTO pet_record
  FROM pets
  WHERE id = p_pet_id AND is_active = true;

  IF pet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Pet not available');
  END IF;

  -- Check if user already has this pet
  IF EXISTS (
    SELECT 1 FROM user_pets
    WHERE user_id = p_user_id AND pet_id = p_pet_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'You already have this pet');
  END IF;

  -- Check if user can afford (if price > 0)
  IF pet_record.price_gems > 0 THEN
    SELECT gems INTO user_gem_balance
    FROM users
    WHERE id = p_user_id;

    IF user_gem_balance < pet_record.price_gems THEN
      RETURN json_build_object('success', false, 'error', 'Not enough gems');
    END IF;

    -- Deduct gems
    UPDATE users
    SET gems = gems - pet_record.price_gems, updated_at = now()
    WHERE id = p_user_id;
  END IF;

  -- Create user pet
  INSERT INTO user_pets (user_id, pet_id, nickname, is_active)
  VALUES (p_user_id, p_pet_id, p_nickname, false)
  RETURNING id INTO new_user_pet_id;

  -- If this is user's first pet, make it active
  IF NOT EXISTS (
    SELECT 1 FROM user_pets
    WHERE user_id = p_user_id AND id != new_user_pet_id
  ) THEN
    PERFORM set_active_pet(p_user_id, new_user_pet_id);
  END IF;

  RETURN json_build_object(
    'success', true,
    'user_pet_id', new_user_pet_id,
    'gems_spent', pet_record.price_gems
  );
END;
$$;


--
-- Name: attempt_catch_pet(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attempt_catch_pet(p_user_id uuid, p_pet_id uuid, p_ball_item_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  ball_record record;
  pet_record record;
  user_ball_qty integer;
  catch_config jsonb;
  catch_pct integer;
  final_rate float;
  roll float;
  caught boolean;
  already_owned boolean;
  new_user_pet_id uuid;
  refund_amount integer;
BEGIN
  -- Validate ball exists and is a ball
  SELECT * INTO ball_record FROM collectible_items
  WHERE id = p_ball_item_id AND item_type = 'ball' AND is_active = true;

  IF ball_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid ball');
  END IF;

  -- Validate user has the ball
  SELECT quantity INTO user_ball_qty FROM user_inventory
  WHERE user_id = p_user_id AND item_id = p_ball_item_id;

  IF user_ball_qty IS NULL OR user_ball_qty < 1 THEN
    RETURN json_build_object('success', false, 'error', 'No balls remaining');
  END IF;

  -- Validate pet exists
  SELECT * INTO pet_record FROM pets
  WHERE id = p_pet_id AND is_active = true;

  IF pet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Pet not found');
  END IF;

  -- Consume ball (regardless of outcome)
  UPDATE user_inventory
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = p_user_id AND item_id = p_ball_item_id;

  -- Get catch rate from 2D matrix: catch_rates[ball_rarity][pet_rarity]
  SELECT config_value INTO catch_config
  FROM drop_config WHERE config_key = 'catch_rates';

  IF catch_config IS NULL THEN
    catch_pct := 50;
  ELSE
    catch_pct := COALESCE((catch_config->ball_record.rarity->>pet_record.rarity)::integer, 50);
  END IF;

  final_rate := LEAST(1.0, catch_pct / 100.0);

  -- Roll for catch
  roll := random();
  caught := roll <= final_rate;

  IF NOT caught THEN
    -- Log catch failure
    INSERT INTO wild_area_logs (user_id, pet_id, pet_name, pet_rarity, ball_item_id, ball_name, action, catch_rate)
    VALUES (p_user_id, p_pet_id, pet_record.name, pet_record.rarity, p_ball_item_id, ball_record.name, 'catch_fail', catch_pct);

    RETURN json_build_object(
      'success', true,
      'caught', false,
      'catch_rate', catch_pct,
      'pet', json_build_object('id', pet_record.id, 'name', pet_record.name,
        'image_url', pet_record.image_url, 'rarity', pet_record.rarity)
    );
  END IF;

  -- Check if already owned
  SELECT EXISTS(
    SELECT 1 FROM user_pets WHERE user_id = p_user_id AND pet_id = p_pet_id
  ) INTO already_owned;

  IF already_owned THEN
    refund_amount := CASE pet_record.rarity
      WHEN 'common' THEN 50
      WHEN 'uncommon' THEN 100
      WHEN 'rare' THEN 200
      WHEN 'epic' THEN 450
      WHEN 'legendary' THEN 1000
      ELSE 5
    END;
    UPDATE users SET xp = xp + refund_amount WHERE id = p_user_id;

    -- Log duplicate catch
    INSERT INTO wild_area_logs (user_id, pet_id, pet_name, pet_rarity, ball_item_id, ball_name, action, is_duplicate, refund_xp, catch_rate)
    VALUES (p_user_id, p_pet_id, pet_record.name, pet_record.rarity, p_ball_item_id, ball_record.name, 'catch_success', true, refund_amount, catch_pct);

    RETURN json_build_object(
      'success', true,
      'caught', true,
      'duplicate', true,
      'refund_xp', refund_amount,
      'pet', json_build_object('id', pet_record.id, 'name', pet_record.name,
        'image_url', pet_record.image_url, 'rarity', pet_record.rarity),
      'catch_rate', catch_pct
    );
  END IF;

  -- Create user_pet
  INSERT INTO user_pets (user_id, pet_id)
  VALUES (p_user_id, p_pet_id)
  RETURNING id INTO new_user_pet_id;

  -- Log successful catch
  INSERT INTO wild_area_logs (user_id, pet_id, pet_name, pet_rarity, ball_item_id, ball_name, action, catch_rate)
  VALUES (p_user_id, p_pet_id, pet_record.name, pet_record.rarity, p_ball_item_id, ball_record.name, 'catch_success', catch_pct);

  RETURN json_build_object(
    'success', true,
    'caught', true,
    'duplicate', false,
    'user_pet_id', new_user_pet_id,
    'pet', json_build_object('id', pet_record.id, 'name', pet_record.name,
      'image_url', pet_record.image_url, 'rarity', pet_record.rarity,
      'description', pet_record.description),
    'catch_rate', catch_pct
  );
END;
$$;


--
-- Name: award_competition_items(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_competition_items(p_user_id uuid, p_item_ids text[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_item_id uuid;
  v_item_name text;
  v_user_name text;
BEGIN
  SELECT full_name INTO v_user_name FROM users WHERE id = p_user_id;

  FOREACH v_item_id IN ARRAY p_item_ids::uuid[]
  LOOP
    SELECT name INTO v_item_name FROM collectible_items WHERE id = v_item_id;

    INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
    VALUES (p_user_id, v_user_name, v_item_id, v_item_name, 1)
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = user_inventory.quantity + 1, updated_at = now();
  END LOOP;

  RETURN json_build_object('success', true);
END;
$$;


--
-- Name: award_daily_challenge_winners(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_daily_challenge_winners() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  yesterday_date date;
  challenge_rec record;
  top1_user_id uuid;
  top2_user_id uuid;
  top3_user_id uuid;
  top1_xp integer;
  top1_gems integer;
  top2_xp integer;
  top2_gems integer;
  top3_xp integer;
  top3_gems integer;
  results json[];
BEGIN
  yesterday_date := ((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '1 day')::date;

  FOR challenge_rec IN
    SELECT id, difficulty_level, top1_achievement_id, top2_achievement_id, top3_achievement_id
    FROM daily_challenges
    WHERE challenge_date = yesterday_date AND is_active = true AND winners_awarded = false
  LOOP
    SELECT user_id INTO top1_user_id
    FROM daily_challenge_participations
    WHERE challenge_id = challenge_rec.id AND score >= 75
    ORDER BY score DESC, time_spent ASC
    LIMIT 1;

    SELECT user_id INTO top2_user_id
    FROM daily_challenge_participations
    WHERE challenge_id = challenge_rec.id
      AND score >= 75
      AND user_id != COALESCE(top1_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY score DESC, time_spent ASC
    LIMIT 1;

    SELECT user_id INTO top3_user_id
    FROM daily_challenge_participations
    WHERE challenge_id = challenge_rec.id
      AND score >= 75
      AND user_id != COALESCE(top1_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND user_id != COALESCE(top2_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY score DESC, time_spent ASC
    LIMIT 1;

    -- Award top 1
    IF top1_user_id IS NOT NULL AND challenge_rec.top1_achievement_id IS NOT NULL THEN
      SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
      INTO top1_xp, top1_gems
      FROM achievements
      WHERE id = challenge_rec.top1_achievement_id;

      INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
      VALUES (top1_user_id, challenge_rec.top1_achievement_id, NOW(), NOW(), top1_xp);

      UPDATE users
      SET xp = xp + top1_xp, gems = gems + top1_gems
      WHERE id = top1_user_id;

      INSERT INTO notifications (user_id, type, title, message, icon, data)
      VALUES (top1_user_id, 'competition_winner', 'Hạng 1 Daily Challenge!',
        'Chúc mừng! Bạn đạt Hạng 1 (' || challenge_rec.difficulty_level || '). +' || top1_xp || ' XP, +' || top1_gems || ' gems',
        'Trophy', json_build_object('rank', 1, 'difficulty', challenge_rec.difficulty_level, 'xp', top1_xp, 'gems', top1_gems)::jsonb);

      results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 1, 'user_id', top1_user_id, 'xp', top1_xp, 'gems', top1_gems));
    END IF;

    -- Award top 2
    IF top2_user_id IS NOT NULL AND challenge_rec.top2_achievement_id IS NOT NULL THEN
      SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
      INTO top2_xp, top2_gems
      FROM achievements
      WHERE id = challenge_rec.top2_achievement_id;

      INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
      VALUES (top2_user_id, challenge_rec.top2_achievement_id, NOW(), NOW(), top2_xp);

      UPDATE users
      SET xp = xp + top2_xp, gems = gems + top2_gems
      WHERE id = top2_user_id;

      INSERT INTO notifications (user_id, type, title, message, icon, data)
      VALUES (top2_user_id, 'competition_winner', 'Hạng 2 Daily Challenge!',
        'Chúc mừng! Bạn đạt Hạng 2 (' || challenge_rec.difficulty_level || '). +' || top2_xp || ' XP, +' || top2_gems || ' gems',
        'Medal', json_build_object('rank', 2, 'difficulty', challenge_rec.difficulty_level, 'xp', top2_xp, 'gems', top2_gems)::jsonb);

      results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 2, 'user_id', top2_user_id, 'xp', top2_xp, 'gems', top2_gems));
    END IF;

    -- Award top 3
    IF top3_user_id IS NOT NULL AND challenge_rec.top3_achievement_id IS NOT NULL THEN
      SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
      INTO top3_xp, top3_gems
      FROM achievements
      WHERE id = challenge_rec.top3_achievement_id;

      INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
      VALUES (top3_user_id, challenge_rec.top3_achievement_id, NOW(), NOW(), top3_xp);

      UPDATE users
      SET xp = xp + top3_xp, gems = gems + top3_gems
      WHERE id = top3_user_id;

      INSERT INTO notifications (user_id, type, title, message, icon, data)
      VALUES (top3_user_id, 'competition_winner', 'Hạng 3 Daily Challenge!',
        'Chúc mừng! Bạn đạt Hạng 3 (' || challenge_rec.difficulty_level || '). +' || top3_xp || ' XP, +' || top3_gems || ' gems',
        'Medal', json_build_object('rank', 3, 'difficulty', challenge_rec.difficulty_level, 'xp', top3_xp, 'gems', top3_gems)::jsonb);

      results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 3, 'user_id', top3_user_id, 'xp', top3_xp, 'gems', top3_gems));
    END IF;

    UPDATE daily_challenges
    SET winners_awarded = true, is_locked = true
    WHERE id = challenge_rec.id;
  END LOOP;

  RETURN json_build_object('success', true, 'awarded', results);
END;
$$;


--
-- Name: FUNCTION award_daily_challenge_winners(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.award_daily_challenge_winners() IS 'Awards achievements to top 3 performers for yesterday''s challenges.
IMPORTANT: Allows duplicate achievement records so users can earn the same rank multiple times.
Removed ON CONFLICT DO NOTHING to enable this.';


--
-- Name: award_exercise_chest(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_exercise_chest(p_user_id uuid, p_exercise_id uuid, p_score integer DEFAULT 75) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_course record;
  v_chest record;
  v_existing_chest uuid;
  v_chest_type text;
  v_config record;
  v_base_chance float;
  v_rarity_weights jsonb;
  v_roll float;
  v_rarity_roll float;
  v_total_weight integer;
  v_cumulative_weight integer;
  v_rarity_key text;
  v_rarity_value integer;
BEGIN
  -- No drop if score below 75%
  IF p_score < 75 THEN
    RETURN json_build_object('success', false, 'reason', 'score_too_low');
  END IF;

  -- Find the course for this exercise
  SELECT c.id AS course_id, c.chest_enabled
  INTO v_course
  FROM exercise_assignments ea
  JOIN sessions s ON s.id = ea.session_id
  JOIN units u ON u.id = s.unit_id
  JOIN courses c ON c.id = u.course_id
  WHERE ea.exercise_id = p_exercise_id
  LIMIT 1;

  IF v_course IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'exercise_not_found');
  END IF;

  IF NOT v_course.chest_enabled THEN
    RETURN json_build_object('success', false, 'reason', 'chest_not_enabled');
  END IF;

  -- Check if user already received a chest for this exercise
  SELECT id INTO v_existing_chest
  FROM user_chests
  WHERE user_id = p_user_id
    AND source = 'exercise_complete'
    AND source_ref = p_exercise_id::text;

  IF v_existing_chest IS NOT NULL THEN
    RETURN json_build_object('success', false, 'reason', 'already_awarded');
  END IF;

  -- Get chest drop config
  SELECT config_value INTO v_config
  FROM drop_config
  WHERE config_key = 'exercise_chest_drop_rate';

  IF v_config IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'no_chest_drop_config');
  END IF;

  v_base_chance := (v_config.config_value->>'base_chance')::float;
  v_rarity_weights := v_config.config_value->'rarity_weights';

  -- Roll for drop chance (25% by default)
  v_roll := random();
  IF v_roll > v_base_chance THEN
    RETURN json_build_object('success', false, 'reason', 'no_drop');
  END IF;

  -- Calculate total weight
  v_total_weight := 0;
  FOR v_rarity_key, v_rarity_value IN SELECT * FROM jsonb_each_text(v_rarity_weights)
  LOOP
    v_total_weight := v_total_weight + v_rarity_value::integer;
  END LOOP;

  -- Roll for rarity (common 60%, uncommon 25%, rare 12%, epic 3%)
  v_rarity_roll := random() * v_total_weight;
  v_cumulative_weight := 0;
  v_chest_type := 'common';

  FOR v_rarity_key, v_rarity_value IN SELECT * FROM jsonb_each_text(v_rarity_weights)
  LOOP
    v_cumulative_weight := v_cumulative_weight + v_rarity_value::integer;
    IF v_rarity_roll <= v_cumulative_weight THEN
      v_chest_type := v_rarity_key;
      EXIT;
    END IF;
  END LOOP;

  -- Find an active chest of the determined rarity
  SELECT * INTO v_chest
  FROM chests
  WHERE chest_type = v_chest_type AND is_active = true
  ORDER BY random()
  LIMIT 1;

  IF v_chest IS NULL THEN
    SELECT * INTO v_chest
    FROM chests
    WHERE is_active = true
    ORDER BY random()
    LIMIT 1;

    IF v_chest IS NULL THEN
      RETURN json_build_object('success', false, 'reason', 'no_active_chest');
    END IF;
  END IF;

  -- Award the chest
  INSERT INTO user_chests (user_id, chest_id, source, source_ref)
  VALUES (p_user_id, v_chest.id, 'exercise_complete', p_exercise_id::text);

  RETURN json_build_object(
    'success', true,
    'chest_id', v_chest.id,
    'chest_name', v_chest.name,
    'chest_image_url', v_chest.image_url,
    'chest_type', v_chest_type
  );
END;
$$;


--
-- Name: award_milestone_chest(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_milestone_chest(p_user_id uuid, p_milestone_type text, p_source_ref text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  config_record record;
  milestone_chests jsonb;
  chest_type_name text;
  chest_record record;
  daily_limit int;
  today_count int;
BEGIN
  -- Check daily limit for pet_game chests
  IF p_milestone_type = 'pet_game' THEN
    SELECT COALESCE(setting_value::int, 0) INTO daily_limit
    FROM site_settings
    WHERE setting_key = 'chest_daily_limit';

    IF daily_limit > 0 THEN
      SELECT COUNT(*) INTO today_count
      FROM user_chests
      WHERE user_id = p_user_id
        AND source = 'pet_game'
        AND created_at >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

      IF today_count >= daily_limit THEN
        RETURN json_build_object('success', false, 'error', 'Daily chest limit reached');
      END IF;
    END IF;
  END IF;

  -- Get milestone chest config
  SELECT config_value INTO config_record
  FROM drop_config
  WHERE config_key = 'milestone_chests';

  IF config_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No milestone chest config found');
  END IF;

  milestone_chests := config_record.config_value;
  chest_type_name := milestone_chests->>p_milestone_type;

  IF chest_type_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No chest configured for this milestone');
  END IF;

  -- Find an active chest of that type
  SELECT * INTO chest_record
  FROM chests
  WHERE chest_type = chest_type_name AND is_active = true
  ORDER BY random()
  LIMIT 1;

  IF chest_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active chest found for type: ' || chest_type_name);
  END IF;

  -- Award the chest
  INSERT INTO user_chests (user_id, chest_id, source, source_ref)
  VALUES (p_user_id, chest_record.id, p_milestone_type, p_source_ref);

  RETURN json_build_object(
    'success', true,
    'chest_id', chest_record.id,
    'chest_name', chest_record.name,
    'chest_image_url', chest_record.image_url,
    'source', p_milestone_type
  );
END;
$$;


--
-- Name: award_monthly_xp_champion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_monthly_xp_champion() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  month_start timestamptz;
  month_end timestamptz;
  rec RECORD;
  ach RECORD;
  rank_labels text[] := ARRAY['monthly_xp_leader', 'monthly_xp_leader_2', 'monthly_xp_leader_3'];
  rank_titles text[] := ARRAY['Vô địch XP tháng!', 'Top 2 XP tháng!', 'Top 3 XP tháng!'];
  rank_messages text[] := ARRAY['Bạn đạt nhiều XP nhất tháng', 'Bạn đạt Top 2 XP tháng', 'Bạn đạt Top 3 XP tháng'];
  awarded json[] := ARRAY[]::json[];
  cur_rank integer := 0;
BEGIN
  month_end := (date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh');
  month_start := (date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '1 month') AT TIME ZONE 'Asia/Ho_Chi_Minh';

  -- Check if already awarded for this month (look for awards made after the month ended)
  IF EXISTS(
    SELECT 1 FROM user_achievements ua
    JOIN achievements a ON a.id = ua.achievement_id
    WHERE a.criteria_type = 'monthly_xp_leader' AND a.is_active = true
      AND ua.earned_at >= month_end AND ua.earned_at < month_end + INTERVAL '1 month'
  ) THEN
    RETURN json_build_object('status', 'already_awarded', 'month_start', month_start);
  END IF;

  FOR rec IN
    WITH exercise_xp AS (
      SELECT up.user_id,
        SUM(
          CASE
            WHEN up.max_score > 0 AND (up.score::float / up.max_score) >= 0.95 THEN ROUND(COALESCE(e.xp_reward, 10) * 1.5)
            WHEN up.max_score > 0 AND (up.score::float / up.max_score) >= 0.90 THEN ROUND(COALESCE(e.xp_reward, 10) * 1.3)
            ELSE COALESCE(e.xp_reward, 10)
          END
        ) AS total_xp
      FROM user_progress up
      LEFT JOIN exercises e ON e.id = up.exercise_id
      WHERE up.status = 'completed'
        AND up.completed_at >= month_start
        AND up.completed_at < month_end
      GROUP BY up.user_id
    ),
    chest_xp AS (
      SELECT user_id, SUM(xp_awarded) AS total_xp
      FROM session_reward_claims
      WHERE xp_awarded > 0
        AND claimed_at >= month_start
        AND claimed_at < month_end
      GROUP BY user_id
    ),
    combined AS (
      SELECT COALESCE(ex.user_id, ch.user_id) AS user_id,
             COALESCE(ex.total_xp, 0) + COALESCE(ch.total_xp, 0) AS total_xp
      FROM exercise_xp ex
      FULL OUTER JOIN chest_xp ch ON ex.user_id = ch.user_id
    )
    SELECT c.user_id, c.total_xp
    FROM combined c
    JOIN users u ON u.id = c.user_id AND u.role = 'user'
    ORDER BY c.total_xp DESC
    LIMIT 3
  LOOP
    cur_rank := cur_rank + 1;

    SELECT id, COALESCE(xp_reward, 0) AS xp_reward, COALESCE(gem_reward, 0) AS gem_reward
    INTO ach
    FROM achievements
    WHERE criteria_type = rank_labels[cur_rank] AND is_active = true
    LIMIT 1;

    IF ach.id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
    VALUES (rec.user_id, ach.id, NOW(), NOW(), ach.xp_reward);

    UPDATE users
    SET xp = xp + ach.xp_reward,
        gems = gems + ach.gem_reward,
        updated_at = NOW()
    WHERE id = rec.user_id;

    INSERT INTO notifications (user_id, type, title, message, icon, data)
    VALUES (rec.user_id, 'competition_winner', rank_titles[cur_rank],
      'Chúc mừng! ' || rank_messages[cur_rank] || ' (' || rec.total_xp || ' XP). +' || ach.xp_reward || ' XP, +' || ach.gem_reward || ' gems',
      'Crown', json_build_object('competition', 'monthly_xp', 'monthly_xp', rec.total_xp, 'xp_awarded', ach.xp_reward, 'gems_awarded', ach.gem_reward, 'rank', cur_rank)::jsonb);

    awarded := awarded || json_build_object('rank', cur_rank, 'user_id', rec.user_id, 'monthly_xp', rec.total_xp, 'xp_awarded', ach.xp_reward, 'gems_awarded', ach.gem_reward);
  END LOOP;

  IF cur_rank = 0 THEN
    RETURN json_build_object('status', 'no_activity', 'month_start', month_start);
  END IF;

  RETURN json_build_object(
    'status', 'awarded',
    'winners', array_to_json(awarded),
    'month_start', month_start,
    'month_end', month_end
  );
END;
$$;


--
-- Name: award_pvp_weekly_champion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_pvp_weekly_champion() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  week_start timestamptz;
  week_end timestamptz;
  rec RECORD;
  reward RECORD;
  awarded json[] := ARRAY[]::json[];
  cur_rank integer := 0;
  rank_title text;
  rank_message text;
  v_user_name text;
  v_item_name text;
BEGIN
  week_end := date_trunc('week', (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')) AT TIME ZONE 'Asia/Ho_Chi_Minh';
  week_start := week_end - INTERVAL '7 days';

  IF EXISTS(
    SELECT 1 FROM notifications
    WHERE type = 'competition_winner'
      AND data->>'competition' = 'pvp_weekly'
      AND created_at >= week_end
      AND created_at < week_end + INTERVAL '1 day'
  ) THEN
    RETURN json_build_object('status', 'already_awarded', 'week_start', week_start);
  END IF;

  FOR rec IN
    WITH matches AS (
      SELECT
        winner_id,
        CASE WHEN winner_id = challenger_id THEN opponent_id ELSE challenger_id END AS loser_id,
        (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS match_date
      FROM pvp_challenges
      WHERE status = 'completed'
        AND winner_id IS NOT NULL
        AND created_at >= week_start
        AND created_at < week_end
    ),
    wins AS (
      SELECT winner_id AS user_id, COUNT(DISTINCT (loser_id, match_date)) AS wins
      FROM matches
      WHERE loser_id IS NOT NULL
      GROUP BY winner_id
    ),
    losses AS (
      SELECT loser_id AS user_id, COUNT(DISTINCT (winner_id, match_date)) AS losses
      FROM matches
      WHERE loser_id IS NOT NULL
      GROUP BY loser_id
    )
    SELECT
      COALESCE(w.user_id, l.user_id) AS user_id,
      COALESCE(w.wins, 0) AS wins,
      COALESCE(l.losses, 0) AS losses
    FROM wins w
    FULL OUTER JOIN losses l ON w.user_id = l.user_id
    ORDER BY wins DESC, losses ASC
    LIMIT 10
  LOOP
    cur_rank := cur_rank + 1;

    SELECT lr.*
    INTO reward
    FROM leaderboard_rewards lr
    WHERE lr.timeframe = 'pvp' AND lr.rank = cur_rank AND lr.is_active = true;

    IF reward IS NULL THEN
      CONTINUE;
    END IF;

    rank_title := CASE cur_rank
      WHEN 1 THEN 'Vô địch PvP tuần!'
      WHEN 2 THEN 'Top 2 PvP tuần!'
      WHEN 3 THEN 'Top 3 PvP tuần!'
      ELSE 'Top ' || cur_rank || ' PvP tuần!'
    END;
    rank_message := CASE cur_rank
      WHEN 1 THEN 'Bạn đứng đầu PvP tuần'
      ELSE 'Bạn đạt Top ' || cur_rank || ' PvP tuần'
    END;

    IF reward.achievement_id IS NOT NULL THEN
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
      VALUES (rec.user_id, reward.achievement_id, NOW(), NOW(), reward.xp_reward);
    END IF;

    UPDATE users
    SET xp = xp + reward.xp_reward,
        gems = gems + reward.gem_reward,
        updated_at = NOW()
    WHERE id = rec.user_id;

    IF reward.item_id IS NOT NULL THEN
      SELECT full_name INTO v_user_name FROM users WHERE id = rec.user_id;
      SELECT name INTO v_item_name FROM collectible_items WHERE id = reward.item_id;
      INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
      VALUES (rec.user_id, v_user_name, reward.item_id, v_item_name, reward.item_quantity)
      ON CONFLICT (user_id, item_id)
      DO UPDATE SET quantity = user_inventory.quantity + reward.item_quantity, updated_at = now();
    END IF;

    IF reward.chest_id IS NOT NULL THEN
      INSERT INTO user_chests (user_id, chest_id, source, source_ref)
      VALUES (rec.user_id, reward.chest_id, 'pvp_weekly_leaderboard', 'rank_' || cur_rank);
    END IF;

    INSERT INTO notifications (user_id, type, title, message, icon, data)
    VALUES (rec.user_id, 'competition_winner', rank_title,
      'Chúc mừng! ' || rank_message || ' (' || rec.wins || 'T - ' || rec.losses || 'B). +' || reward.xp_reward || ' XP' ||
        CASE WHEN reward.gem_reward > 0 THEN ', +' || reward.gem_reward || ' gems' ELSE '' END ||
        CASE WHEN v_item_name IS NOT NULL THEN ', +' || reward.item_quantity || ' ' || v_item_name ELSE '' END,
      'Trophy', json_build_object('competition', 'pvp_weekly', 'wins', rec.wins, 'losses', rec.losses, 'xp_awarded', reward.xp_reward, 'gems_awarded', reward.gem_reward, 'rank', cur_rank)::jsonb);

    awarded := awarded || json_build_object('rank', cur_rank, 'user_id', rec.user_id, 'wins', rec.wins, 'losses', rec.losses, 'xp_awarded', reward.xp_reward, 'gems_awarded', reward.gem_reward);
    v_item_name := NULL;
  END LOOP;

  IF cur_rank = 0 THEN
    RETURN json_build_object('status', 'no_activity', 'week_start', week_start);
  END IF;

  RETURN json_build_object('status', 'awarded', 'winners', array_to_json(awarded), 'week_start', week_start, 'week_end', week_end);
END;
$$;


--
-- Name: award_single_challenge_winners(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_single_challenge_winners(p_challenge_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  challenge_rec record;
  top1_user_id uuid;
  top2_user_id uuid;
  top3_user_id uuid;
  top1_xp integer;
  top1_gems integer;
  top2_xp integer;
  top2_gems integer;
  top3_xp integer;
  top3_gems integer;
  results json[];
BEGIN
  -- Get the challenge
  SELECT id, difficulty_level, top1_achievement_id, top2_achievement_id, top3_achievement_id, winners_awarded, is_locked
  INTO challenge_rec
  FROM daily_challenges
  WHERE id = p_challenge_id AND is_active = true;

  IF challenge_rec IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Challenge not found or inactive');
  END IF;

  IF challenge_rec.winners_awarded = true THEN
    RETURN json_build_object('success', false, 'error', 'Winners already awarded for this challenge');
  END IF;

  -- Get top 1 user
  SELECT user_id INTO top1_user_id
  FROM daily_challenge_participations
  WHERE challenge_id = challenge_rec.id AND score >= 75
  ORDER BY score DESC, time_spent ASC
  LIMIT 1;

  -- Get top 2 user (excluding top 1)
  SELECT user_id INTO top2_user_id
  FROM daily_challenge_participations
  WHERE challenge_id = challenge_rec.id
    AND score >= 75
    AND user_id != COALESCE(top1_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY score DESC, time_spent ASC
  LIMIT 1;

  -- Get top 3 user (excluding top 1 and top 2)
  SELECT user_id INTO top3_user_id
  FROM daily_challenge_participations
  WHERE challenge_id = challenge_rec.id
    AND score >= 75
    AND user_id != COALESCE(top1_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND user_id != COALESCE(top2_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY score DESC, time_spent ASC
  LIMIT 1;

  -- Award top 1
  IF top1_user_id IS NOT NULL AND challenge_rec.top1_achievement_id IS NOT NULL THEN
    -- Get achievement rewards
    SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
    INTO top1_xp, top1_gems
    FROM achievements
    WHERE id = challenge_rec.top1_achievement_id;

    -- Insert achievement record
    INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
    VALUES (top1_user_id, challenge_rec.top1_achievement_id, NOW(), NOW(), top1_xp);

    -- Award XP and gems
    UPDATE users
    SET xp = xp + top1_xp,
        gems = gems + top1_gems
    WHERE id = top1_user_id;

    results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 1, 'user_id', top1_user_id, 'xp', top1_xp, 'gems', top1_gems));
  END IF;

  -- Award top 2
  IF top2_user_id IS NOT NULL AND challenge_rec.top2_achievement_id IS NOT NULL THEN
    -- Get achievement rewards
    SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
    INTO top2_xp, top2_gems
    FROM achievements
    WHERE id = challenge_rec.top2_achievement_id;

    -- Insert achievement record
    INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
    VALUES (top2_user_id, challenge_rec.top2_achievement_id, NOW(), NOW(), top2_xp);

    -- Award XP and gems
    UPDATE users
    SET xp = xp + top2_xp,
        gems = gems + top2_gems
    WHERE id = top2_user_id;

    results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 2, 'user_id', top2_user_id, 'xp', top2_xp, 'gems', top2_gems));
  END IF;

  -- Award top 3
  IF top3_user_id IS NOT NULL AND challenge_rec.top3_achievement_id IS NOT NULL THEN
    -- Get achievement rewards
    SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
    INTO top3_xp, top3_gems
    FROM achievements
    WHERE id = challenge_rec.top3_achievement_id;

    -- Insert achievement record
    INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
    VALUES (top3_user_id, challenge_rec.top3_achievement_id, NOW(), NOW(), top3_xp);

    -- Award XP and gems
    UPDATE users
    SET xp = xp + top3_xp,
        gems = gems + top3_gems
    WHERE id = top3_user_id;

    results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 3, 'user_id', top3_user_id, 'xp', top3_xp, 'gems', top3_gems));
  END IF;

  -- Mark challenge as awarded AND locked
  UPDATE daily_challenges
  SET winners_awarded = true,
      is_locked = true
  WHERE id = p_challenge_id;

  RETURN json_build_object('success', true, 'awarded', results);
END;
$$;


--
-- Name: FUNCTION award_single_challenge_winners(p_challenge_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.award_single_challenge_winners(p_challenge_id uuid) IS 'Awards achievements to top 3 performers for a specific challenge (admin use).
IMPORTANT: Allows duplicate achievement records so users can earn the same rank multiple times.
Removed ON CONFLICT DO NOTHING to enable this.';


--
-- Name: award_weekly_scramble_champion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_weekly_scramble_champion() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  week_start_date timestamptz;
  week_end_date timestamptz;
  champion_user_id uuid;
  champion_score integer;
  gem_prize integer := 1;
BEGIN
  week_end_date := (date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh');
  week_start_date := week_end_date - INTERVAL '7 days';

  SELECT user_id, MAX(score) AS best_score
  INTO champion_user_id, champion_score
  FROM training_scores
  WHERE game_type = 'scramble'
    AND played_at >= week_start_date
    AND played_at < week_end_date
  GROUP BY user_id
  ORDER BY best_score DESC
  LIMIT 1;

  IF champion_user_id IS NULL THEN
    RETURN json_build_object('status', 'no_players', 'week_start', week_start_date);
  END IF;

  UPDATE users
  SET gems = COALESCE(gems, 0) + gem_prize, updated_at = NOW()
  WHERE id = champion_user_id;

  INSERT INTO notifications (user_id, type, title, message, icon, data)
  VALUES (champion_user_id, 'competition_winner', 'Vô địch Word Scramble tuần!',
    'Chúc mừng! Bạn đạt điểm cao nhất tuần (' || champion_score || ' điểm). +' || gem_prize || ' gems',
    'Trophy', json_build_object('competition', 'weekly_scramble', 'score', champion_score, 'gems', gem_prize)::jsonb);

  RETURN json_build_object(
    'status', 'awarded',
    'user_id', champion_user_id,
    'score', champion_score,
    'gems_awarded', gem_prize,
    'week_start', week_start_date,
    'week_end', week_end_date
  );
END;
$$;


--
-- Name: award_weekly_xp_champion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_weekly_xp_champion() RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_week_start timestamptz;
  v_week_end timestamptz;
  rec RECORD;
  ach RECORD;
  rank_labels text[] := ARRAY['weekly_xp_leader', 'weekly_xp_leader_2', 'weekly_xp_leader_3'];
  rank_titles text[] := ARRAY['Vô địch XP tuần!', 'Top 2 XP tuần!', 'Top 3 XP tuần!'];
  rank_messages text[] := ARRAY['Bạn đạt nhiều XP nhất tuần', 'Bạn đạt Top 2 XP tuần', 'Bạn đạt Top 3 XP tuần'];
  awarded json[] := ARRAY[]::json[];
  cur_rank integer := 0;
BEGIN
  v_week_end := (date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_week_start := v_week_end - INTERVAL '7 days';

  IF EXISTS(
    SELECT 1 FROM user_achievements ua
    JOIN achievements a ON a.id = ua.achievement_id
    WHERE a.criteria_type = 'weekly_xp_leader' AND a.is_active = true
      AND ua.week_start = v_week_start
  ) THEN
    RETURN json_build_object('status', 'already_awarded', 'week_start', v_week_start);
  END IF;

  FOR rec IN
    WITH exercise_xp AS (
      SELECT up.user_id,
        SUM(
          CASE
            WHEN up.max_score > 0 AND (up.score::float / up.max_score) >= 0.95 THEN ROUND(COALESCE(e.xp_reward, 10) * 1.5)
            WHEN up.max_score > 0 AND (up.score::float / up.max_score) >= 0.90 THEN ROUND(COALESCE(e.xp_reward, 10) * 1.3)
            ELSE COALESCE(e.xp_reward, 10)
          END
        ) AS total_xp
      FROM user_progress up
      LEFT JOIN exercises e ON e.id = up.exercise_id
      WHERE up.status = 'completed'
        AND up.completed_at >= v_week_start
        AND up.completed_at < v_week_end
      GROUP BY up.user_id
    ),
    chest_xp AS (
      SELECT user_id, SUM(xp_awarded) AS total_xp
      FROM session_reward_claims
      WHERE xp_awarded > 0
        AND claimed_at >= v_week_start
        AND claimed_at < v_week_end
      GROUP BY user_id
    ),
    combined AS (
      SELECT COALESCE(ex.user_id, ch.user_id) AS user_id,
             COALESCE(ex.total_xp, 0) + COALESCE(ch.total_xp, 0) AS total_xp
      FROM exercise_xp ex
      FULL OUTER JOIN chest_xp ch ON ex.user_id = ch.user_id
    )
    SELECT c.user_id, c.total_xp
    FROM combined c
    JOIN users u ON u.id = c.user_id AND u.role = 'user'
    ORDER BY c.total_xp DESC
    LIMIT 3
  LOOP
    cur_rank := cur_rank + 1;

    SELECT id, COALESCE(xp_reward, 0) AS xp_reward, COALESCE(gem_reward, 0) AS gem_reward
    INTO ach
    FROM achievements
    WHERE criteria_type = rank_labels[cur_rank] AND is_active = true
    LIMIT 1;

    IF ach.id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed, week_start)
    VALUES (rec.user_id, ach.id, NOW(), NOW(), ach.xp_reward, v_week_start);

    UPDATE users
    SET xp = xp + ach.xp_reward,
        gems = gems + ach.gem_reward,
        updated_at = NOW()
    WHERE id = rec.user_id;

    INSERT INTO notifications (user_id, type, title, message, icon, data)
    VALUES (rec.user_id, 'competition_winner', rank_titles[cur_rank],
      'Chúc mừng! ' || rank_messages[cur_rank] || ' (' || rec.total_xp::text || ' XP). +' || ach.xp_reward::text || ' XP, +' || ach.gem_reward::text || ' gems',
      'Trophy', json_build_object('competition', 'weekly_xp', 'weekly_xp', rec.total_xp, 'xp_awarded', ach.xp_reward, 'gems_awarded', ach.gem_reward, 'rank', cur_rank)::jsonb);

    awarded := array_append(awarded, json_build_object('rank', cur_rank, 'user_id', rec.user_id, 'weekly_xp', rec.total_xp, 'xp_awarded', ach.xp_reward, 'gems_awarded', ach.gem_reward));
  END LOOP;

  IF cur_rank = 0 THEN
    RETURN json_build_object('status', 'no_activity', 'week_start', v_week_start);
  END IF;

  RETURN json_build_object(
    'status', 'awarded',
    'winners', array_to_json(awarded),
    'week_start', v_week_start,
    'week_end', v_week_end
  );
END;
$$;


--
-- Name: buy_ball(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buy_ball(p_user_id uuid, p_ball_item_id uuid, p_currency text DEFAULT 'gems'::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  ball_record record;
  user_record record;
  cost integer;
BEGIN
  -- Get ball or ticket
  SELECT * INTO ball_record FROM collectible_items
  WHERE id = p_ball_item_id AND item_type IN ('ball', 'ticket') AND is_active = true;

  IF ball_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Ball not found');
  END IF;

  -- Get user balance
  SELECT gems, xp INTO user_record FROM users WHERE id = p_user_id;

  -- Determine cost and deduct
  IF p_currency = 'xp' THEN
    cost := COALESCE(ball_record.price_xp, 0);
    IF cost <= 0 THEN RETURN json_build_object('success', false, 'error', 'Not available for XP'); END IF;
    IF user_record.xp < cost THEN RETURN json_build_object('success', false, 'error', 'Not enough XP'); END IF;
    UPDATE users SET xp = xp - cost WHERE id = p_user_id;
  ELSE
    cost := COALESCE(ball_record.price_gems, 0);
    IF cost <= 0 THEN RETURN json_build_object('success', false, 'error', 'Not available for gems'); END IF;
    IF user_record.gems < cost THEN RETURN json_build_object('success', false, 'error', 'Not enough gems'); END IF;
    UPDATE users SET gems = gems - cost WHERE id = p_user_id;
  END IF;

  -- Add to inventory
  INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
  VALUES (p_user_id, (SELECT full_name FROM users WHERE id = p_user_id), p_ball_item_id, ball_record.name, 1)
  ON CONFLICT (user_id, item_id)
  DO UPDATE SET quantity = user_inventory.quantity + 1, updated_at = now();

  RETURN json_build_object(
    'success', true,
    'ball_name', ball_record.name,
    'gems_spent', CASE WHEN p_currency = 'gems' THEN cost ELSE 0 END,
    'xp_spent', CASE WHEN p_currency = 'xp' THEN cost ELSE 0 END
  );
END;
$$;


--
-- Name: buy_egg(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buy_egg(p_user_id uuid, p_egg_item_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  egg_record record;
  user_gems integer;
BEGIN
  -- Get egg item
  SELECT * INTO egg_record
  FROM collectible_items
  WHERE id = p_egg_item_id AND item_type = 'egg' AND is_active = true;

  IF egg_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Egg not found');
  END IF;

  IF egg_record.price_gems IS NULL OR egg_record.price_gems <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Egg not for sale');
  END IF;

  -- Check balance
  SELECT gems INTO user_gems FROM users WHERE id = p_user_id;
  IF user_gems < egg_record.price_gems THEN
    RETURN json_build_object('success', false, 'error', 'Not enough gems');
  END IF;

  -- Deduct gems
  UPDATE users SET gems = gems - egg_record.price_gems, updated_at = now()
  WHERE id = p_user_id;

  -- Add egg to inventory
  INSERT INTO user_inventory (user_id, item_id, quantity)
  VALUES (p_user_id, p_egg_item_id, 1)
  ON CONFLICT (user_id, item_id)
  DO UPDATE SET quantity = user_inventory.quantity + 1, updated_at = now();

  RETURN json_build_object(
    'success', true,
    'egg_name', egg_record.name,
    'egg_rarity', egg_record.rarity,
    'gems_spent', egg_record.price_gems
  );
END;
$$;


--
-- Name: buy_egg(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buy_egg(p_user_id uuid, p_egg_item_id uuid, p_currency text DEFAULT 'gems'::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_egg record;
  v_user record;
  v_price integer;
  v_currency_name text;
BEGIN
  -- Get egg details
  SELECT * INTO v_egg
  FROM collectible_items
  WHERE id = p_egg_item_id
    AND item_type = 'egg'
    AND is_active = true;

  IF v_egg IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Egg not found or not available'
    );
  END IF;

  -- Get user details
  SELECT * INTO v_user
  FROM users
  WHERE id = p_user_id;

  IF v_user IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Determine price based on currency
  IF p_currency = 'xp' THEN
    v_price := COALESCE(v_egg.price_xp, 0);
    v_currency_name := 'XP';

    IF v_price <= 0 THEN
      RETURN json_build_object(
        'success', false,
        'error', 'This egg cannot be purchased with XP'
      );
    END IF;

    IF v_user.xp < v_price THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Not enough XP',
        'required', v_price,
        'current', v_user.xp
      );
    END IF;

    -- Deduct XP
    UPDATE users
    SET xp = xp - v_price,
        updated_at = now()
    WHERE id = p_user_id;

  ELSE
    -- Default to gems
    v_price := COALESCE(v_egg.price_gems, 0);
    v_currency_name := 'gems';

    IF v_price <= 0 THEN
      RETURN json_build_object(
        'success', false,
        'error', 'This egg cannot be purchased with gems'
      );
    END IF;

    IF v_user.gems < v_price THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Not enough gems',
        'required', v_price,
        'current', v_user.gems
      );
    END IF;

    -- Deduct gems
    UPDATE users
    SET gems = gems - v_price,
        updated_at = now()
    WHERE id = p_user_id;
  END IF;

  -- Add egg to inventory
  INSERT INTO user_inventory (user_id, item_id, quantity)
  VALUES (p_user_id, p_egg_item_id, 1)
  ON CONFLICT (user_id, item_id)
  DO UPDATE SET quantity = user_inventory.quantity + 1, updated_at = now();

  RETURN json_build_object(
    'success', true,
    'egg_name', v_egg.name,
    'currency_spent', v_currency_name,
    'amount_spent', v_price,
    'gems_spent', CASE WHEN p_currency = 'gems' THEN v_price ELSE 0 END,
    'xp_spent', CASE WHEN p_currency = 'xp' THEN v_price ELSE 0 END
  );
END;
$$;


--
-- Name: check_and_award_achievements(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_award_achievements(user_id_param uuid) RETURNS TABLE(achievement_id uuid, title text, description text, xp_reward integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    achievement_record RECORD;
    user_stats RECORD;
    earned_count INTEGER;
BEGIN
    -- Get user statistics
    SELECT
        COALESCE(COUNT(up.id) FILTER (WHERE up.status = 'completed'), 0) as completed_exercises,
        COALESCE(SUM(up.xp_earned), 0) as total_xp,
        COALESCE(u.streak_count, 0) as current_streak,
        COALESCE(COUNT(up.id) FILTER (WHERE up.completed_at::date = CURRENT_DATE), 0) as daily_exercises
    INTO user_stats
    FROM public.users u
    LEFT JOIN public.user_progress up ON u.id = up.user_id
    WHERE u.id = user_id_param
    GROUP BY u.id, u.streak_count;

    -- If no user found, return empty
    IF user_stats IS NULL THEN
        RETURN;
    END IF;

    -- Check each active achievement
    FOR achievement_record IN
        SELECT * FROM public.achievements WHERE is_active = true
    LOOP
        -- Check if user already has this achievement
        SELECT COUNT(*) INTO earned_count
        FROM public.user_achievements
        WHERE user_id = user_id_param AND user_achievements.achievement_id = achievement_record.id;

        -- If not earned, check criteria
        IF earned_count = 0 THEN
            CASE achievement_record.criteria_type
                WHEN 'exercise_completed' THEN
                    IF user_stats.completed_exercises >= achievement_record.criteria_value THEN
                        INSERT INTO public.user_achievements (user_id, achievement_id, xp_claimed)
                        VALUES (user_id_param, achievement_record.id, achievement_record.xp_reward);

                        RETURN QUERY SELECT
                            achievement_record.id,
                            achievement_record.title,
                            achievement_record.description,
                            achievement_record.xp_reward;
                    END IF;

                WHEN 'total_xp' THEN
                    IF user_stats.total_xp >= achievement_record.criteria_value THEN
                        INSERT INTO public.user_achievements (user_id, achievement_id, xp_claimed)
                        VALUES (user_id_param, achievement_record.id, achievement_record.xp_reward);

                        RETURN QUERY SELECT
                            achievement_record.id,
                            achievement_record.title,
                            achievement_record.description,
                            achievement_record.xp_reward;
                    END IF;

                WHEN 'daily_streak' THEN
                    IF user_stats.current_streak >= achievement_record.criteria_value THEN
                        INSERT INTO public.user_achievements (user_id, achievement_id, xp_claimed)
                        VALUES (user_id_param, achievement_record.id, achievement_record.xp_reward);

                        RETURN QUERY SELECT
                            achievement_record.id,
                            achievement_record.title,
                            achievement_record.description,
                            achievement_record.xp_reward;
                    END IF;

                WHEN 'daily_exercises' THEN
                    IF user_stats.daily_exercises >= achievement_record.criteria_value THEN
                        INSERT INTO public.user_achievements (user_id, achievement_id, xp_claimed)
                        VALUES (user_id_param, achievement_record.id, achievement_record.xp_reward);

                        RETURN QUERY SELECT
                            achievement_record.id,
                            achievement_record.title,
                            achievement_record.description,
                            achievement_record.xp_reward;
                    END IF;
                ELSE
                    -- Handle unknown criteria types - do nothing
                    NULL;
            END CASE;
        END IF;
    END LOOP;
END;
$$;


--
-- Name: check_pet_evolution(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_pet_evolution(p_user_pet_id uuid) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
  pet_record record;
  evolution_data jsonb;
  next_stage jsonb;
  current_stage_num integer;
  evolved boolean := false;
BEGIN
  -- Get pet details
  SELECT 
    up.*,
    p.evolution_stages
  INTO pet_record
  FROM user_pets up
  JOIN pets p ON up.pet_id = p.id
  WHERE up.id = p_user_pet_id;

  IF pet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Pet not found');
  END IF;

  evolution_data := pet_record.evolution_stages;
  current_stage_num := pet_record.evolution_stage;

  -- Check if there's a next stage
  IF evolution_data IS NOT NULL THEN
    -- Find the next stage
    FOR next_stage IN SELECT * FROM jsonb_array_elements(evolution_data)
    LOOP
      IF (next_stage->>'stage')::integer = current_stage_num + 1 THEN
        -- Check if pet has enough XP for next stage
        IF next_stage ? 'xp_required' AND 
           pet_record.xp >= (next_stage->>'xp_required')::integer THEN
          -- Evolve!
          UPDATE user_pets
          SET 
            evolution_stage = current_stage_num + 1,
            updated_at = now()
          WHERE id = p_user_pet_id;

          evolved := true;

          -- Log evolution
          INSERT INTO pet_interactions (
            user_id, 
            user_pet_id, 
            interaction_type
          ) VALUES (
            pet_record.user_id,
            p_user_pet_id,
            'evolve'
          );

          RETURN json_build_object(
            'success', true,
            'evolved', true,
            'new_stage', current_stage_num + 1,
            'new_image_url', next_stage->>'image_url'
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- No evolution occurred
  RETURN json_build_object(
    'success', true,
    'evolved', false
  );
END;
$$;


--
-- Name: claim_achievement_xp(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_achievement_xp(user_id_param uuid, achievement_id_param uuid) RETURNS TABLE(success boolean, xp_awarded integer, gems_awarded integer, message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    user_achievement_record RECORD;
    xp_to_claim INTEGER;
    gems_to_claim INTEGER;
BEGIN
    SELECT * INTO user_achievement_record
    FROM public.user_achievements
    WHERE user_id = user_id_param
      AND user_achievements.achievement_id = achievement_id_param;

    IF user_achievement_record IS NULL THEN
        RETURN QUERY SELECT false, 0, 0, 'Achievement not found'::text;
        RETURN;
    END IF;

    IF user_achievement_record.claimed_at IS NOT NULL THEN
        RETURN QUERY SELECT false, 0, 0, 'Achievement already claimed'::text;
        RETURN;
    END IF;

    xp_to_claim := COALESCE(user_achievement_record.xp_claimed, 0);

    SELECT COALESCE(gem_reward, 0) INTO gems_to_claim
    FROM public.achievements
    WHERE id = achievement_id_param;

    gems_to_claim := COALESCE(gems_to_claim, 0);

    UPDATE public.users
    SET xp   = COALESCE(xp, 0)   + xp_to_claim,
        gems = COALESCE(gems, 0) + gems_to_claim
    WHERE id = user_id_param;

    UPDATE public.user_achievements
    SET claimed_at = NOW()
    WHERE user_id = user_id_param
      AND user_achievements.achievement_id = achievement_id_param;

    RETURN QUERY SELECT true, xp_to_claim, gems_to_claim, 'Reward claimed successfully'::text;
END;
$$;


--
-- Name: claim_all_mission_rewards(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_all_mission_rewards(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  total_xp integer := 0; total_gems integer := 0; claimed_count integer := 0;
  items_granted integer := 0; chests_granted integer := 0;
  rec RECORD; v_user_name text; v_item_name text;
  today date; week_start date;
BEGIN
  today := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  week_start := today - (EXTRACT(ISODOW FROM today)::int - 1);
  SELECT name INTO v_user_name FROM users WHERE id = p_user_id;

  -- Auto-complete eligible bonus missions before claiming
  FOR rec IN
    SELECT um.id AS user_mission_id, m.mission_type, m.goal_value, um.period_start
    FROM user_missions um JOIN missions m ON m.id = um.mission_id
    WHERE um.user_id = p_user_id AND um.status = 'active'
      AND m.goal_type = 'complete_all_missions' AND m.is_active = true
  LOOP
    DECLARE
      v_done integer;
    BEGIN
      IF rec.mission_type = 'daily' THEN
        SELECT COUNT(*) INTO v_done FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'daily' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = rec.period_start;
      ELSIF rec.mission_type = 'weekly' THEN
        SELECT COUNT(*) INTO v_done FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'weekly' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = rec.period_start;
      ELSIF rec.mission_type = 'special' THEN
        SELECT COUNT(*) INTO v_done FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'special' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = COALESCE(m2.start_date, today);
      END IF;
      IF v_done >= rec.goal_value THEN
        UPDATE user_missions SET status = 'completed' WHERE id = rec.user_mission_id;
      END IF;
    END;
  END LOOP;

  FOR rec IN
    SELECT um.id AS user_mission_id, m.reward_xp, m.reward_gems, m.title,
           m.reward_item_id, m.reward_item_quantity, m.reward_chest_id,
           m.mission_type, m.goal_type, m.id AS mission_id
    FROM user_missions um JOIN missions m ON m.id = um.mission_id
    WHERE um.user_id = p_user_id AND um.status = 'completed'
  LOOP
    UPDATE user_missions SET status = 'claimed', updated_at = NOW() WHERE id = rec.user_mission_id;
    total_xp := total_xp + COALESCE(rec.reward_xp, 0);
    total_gems := total_gems + COALESCE(rec.reward_gems, 0);
    claimed_count := claimed_count + 1;

    -- Grant item reward
    IF rec.reward_item_id IS NOT NULL THEN
      SELECT name INTO v_item_name FROM collectible_items WHERE id = rec.reward_item_id;
      INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
      VALUES (p_user_id, v_user_name, rec.reward_item_id, v_item_name, COALESCE(rec.reward_item_quantity, 1))
      ON CONFLICT (user_id, item_id) DO UPDATE
      SET quantity = user_inventory.quantity + COALESCE(rec.reward_item_quantity, 1), updated_at = NOW();
      items_granted := items_granted + 1;
    END IF;

    -- Grant chest reward
    IF rec.reward_chest_id IS NOT NULL THEN
      INSERT INTO user_chests (user_id, chest_id, source, source_ref)
      VALUES (p_user_id, rec.reward_chest_id, 'mission', rec.mission_id::text);
      chests_granted := chests_granted + 1;
    END IF;

  END LOOP;

  IF claimed_count > 0 THEN
    UPDATE users SET xp = COALESCE(xp, 0) + total_xp, gems = COALESCE(gems, 0) + total_gems, updated_at = NOW()
    WHERE id = p_user_id;

    INSERT INTO notifications (user_id, type, title, message, icon, data)
    VALUES (p_user_id, 'mission_reward', 'Missions Claimed!',
      'You claimed ' || claimed_count || ' missions! +' || total_xp || ' XP, +' || total_gems || ' Gems' ||
        CASE WHEN items_granted > 0 THEN ', +' || items_granted || ' items' ELSE '' END,
      'trophy', json_build_object('xp', total_xp, 'gems', total_gems, 'count', claimed_count, 'items_granted', items_granted));
  END IF;

  RETURN json_build_object('success', true, 'claimed_count', claimed_count, 'total_xp', total_xp, 'total_gems', total_gems, 'items_granted', items_granted);
END;
$$;


--
-- Name: claim_mission_reward(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_mission_reward(p_user_id uuid, p_user_mission_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_mission_id uuid; v_status text; v_reward_xp integer; v_reward_gems integer;
  v_mission_title text; v_reward_item_id uuid; v_reward_item_qty integer;
  v_reward_chest_id uuid;
  v_item_name text; v_user_name text; v_mission_type text; v_goal_type text;
  today date; week_start date;
BEGIN
  today := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  week_start := today - (EXTRACT(ISODOW FROM today)::int - 1);

  SELECT um.status, m.id, m.reward_xp, m.reward_gems, m.title,
         m.reward_item_id, m.reward_item_quantity, m.reward_chest_id,
         m.mission_type, m.goal_type
  INTO v_status, v_mission_id, v_reward_xp, v_reward_gems, v_mission_title,
       v_reward_item_id, v_reward_item_qty, v_reward_chest_id,
       v_mission_type, v_goal_type
  FROM user_missions um JOIN missions m ON m.id = um.mission_id
  WHERE um.id = p_user_mission_id AND um.user_id = p_user_id;

  IF v_mission_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mission not found');
  END IF;

  -- For complete_all_missions bonus: check dynamically if all other missions in the same type are claimed
  IF v_goal_type = 'complete_all_missions' AND v_status = 'active' THEN
    DECLARE
      v_completed_count integer;
      v_goal integer;
      v_period_start date;
    BEGIN
      SELECT goal_value INTO v_goal FROM missions WHERE id = v_mission_id;
      SELECT period_start INTO v_period_start FROM user_missions WHERE id = p_user_mission_id;

      IF v_mission_type = 'daily' THEN
        SELECT COUNT(*) INTO v_completed_count
        FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'daily' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = v_period_start;
      ELSIF v_mission_type = 'weekly' THEN
        SELECT COUNT(*) INTO v_completed_count
        FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'weekly' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = v_period_start;
      ELSIF v_mission_type = 'special' THEN
        SELECT COUNT(*) INTO v_completed_count
        FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'special' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = COALESCE(m2.start_date, today);
      END IF;

      IF v_completed_count >= v_goal THEN
        UPDATE user_missions SET status = 'completed' WHERE id = p_user_mission_id;
        v_status := 'completed';
      END IF;
    END;
  END IF;

  IF v_status != 'completed' THEN
    RETURN json_build_object('success', false, 'error', 'Mission not completed yet');
  END IF;

  UPDATE user_missions SET status = 'claimed', updated_at = NOW() WHERE id = p_user_mission_id;

  IF v_reward_xp > 0 THEN
    UPDATE users SET xp = COALESCE(xp, 0) + v_reward_xp, updated_at = NOW() WHERE id = p_user_id;
  END IF;
  IF v_reward_gems > 0 THEN
    UPDATE users SET gems = COALESCE(gems, 0) + v_reward_gems, updated_at = NOW() WHERE id = p_user_id;
  END IF;

  -- Award item reward
  IF v_reward_item_id IS NOT NULL THEN
    SELECT name INTO v_item_name FROM collectible_items WHERE id = v_reward_item_id;
    SELECT full_name INTO v_user_name FROM users WHERE id = p_user_id;

    INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
    VALUES (p_user_id, v_user_name, v_reward_item_id, v_item_name, COALESCE(v_reward_item_qty, 1))
    ON CONFLICT (user_id, item_id) DO UPDATE
    SET quantity = user_inventory.quantity + COALESCE(v_reward_item_qty, 1), updated_at = NOW();
  END IF;

  -- Award chest reward
  IF v_reward_chest_id IS NOT NULL THEN
    INSERT INTO user_chests (user_id, chest_id, source, source_ref)
    VALUES (p_user_id, v_reward_chest_id, 'mission', v_mission_id::text);
  END IF;

  INSERT INTO notifications (user_id, type, title, message, icon, data)
  VALUES (p_user_id, 'mission_reward', 'Mission Complete!',
    'You completed "' || v_mission_title || '"! ' ||
      CASE WHEN v_reward_xp > 0 THEN '+' || v_reward_xp || ' XP ' ELSE '' END ||
      CASE WHEN v_reward_gems > 0 THEN '+' || v_reward_gems || ' Gems ' ELSE '' END ||
      CASE WHEN v_reward_item_id IS NOT NULL THEN '+' || COALESCE(v_reward_item_qty, 1) || ' ' || COALESCE(v_item_name, 'Item') ELSE '' END,
    'trophy',
    json_build_object('xp', v_reward_xp, 'gems', v_reward_gems, 'mission_title', v_mission_title,
      'item_id', v_reward_item_id, 'item_name', v_item_name, 'item_quantity', v_reward_item_qty));

  RETURN json_build_object('success', true, 'xp_earned', v_reward_xp, 'gems_earned', v_reward_gems,
    'mission_title', v_mission_title, 'item_id', v_reward_item_id, 'item_name', v_item_name, 'item_quantity', v_reward_item_qty);
END;
$$;


--
-- Name: cleanup_old_user_missions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_user_missions() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM user_missions
  WHERE status = 'claimed'
    AND period_start < CURRENT_DATE - INTERVAL '30 days';

  DELETE FROM user_missions
  WHERE status = 'active'
    AND period_start < CURRENT_DATE - INTERVAL '7 days';
END;
$$;


--
-- Name: craft_recipe(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.craft_recipe(p_user_id uuid, p_recipe_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$DECLARE
  recipe_record record;
  ingredient jsonb;
  ingredient_item_id uuid;
  ingredient_qty integer;
  user_qty integer;
  crafts_count integer;
  result_item_name text;
  roll_result float;
  craft_success boolean;
  lost_item_record record;
  rarity_order text[] := ARRAY['common', 'uncommon', 'rare', 'epic', 'legendary'];
  r text;
  found_item boolean := false;
BEGIN
  -- Get recipe
  SELECT * INTO recipe_record
  FROM recipes
  WHERE id = p_recipe_id AND is_active = true;

  IF recipe_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Recipe not found or inactive');
  END IF;

  -- Check max crafts limit
  IF recipe_record.max_crafts_per_user IS NOT NULL THEN
    SELECT COUNT(*) INTO crafts_count
    FROM user_crafts
    WHERE user_id = p_user_id AND recipe_id = p_recipe_id;

    IF crafts_count >= recipe_record.max_crafts_per_user THEN
      RETURN json_build_object('success', false, 'error', 'Maximum crafts reached for this recipe');
    END IF;
  END IF;

  -- Verify all ingredients
  FOR ingredient IN SELECT * FROM jsonb_array_elements(recipe_record.ingredients)
  LOOP
    ingredient_item_id := (ingredient->>'item_id')::uuid;
    ingredient_qty := (ingredient->>'quantity')::integer;

    SELECT COALESCE(quantity, 0) INTO user_qty
    FROM user_inventory
    WHERE user_id = p_user_id AND item_id = ingredient_item_id;

    IF user_qty < ingredient_qty THEN
      RETURN json_build_object('success', false, 'error', 'Not enough ingredients');
    END IF;
  END LOOP;

  -- Roll for success (success_rate is 0-100, default 100)
  roll_result := random() * 100;
  craft_success := roll_result < COALESCE(recipe_record.success_rate, 100);

  IF NOT craft_success THEN
    -- FAILURE: Lose 1 item from ingredients, prioritizing common -> uncommon -> rare -> epic -> legendary
    FOREACH r IN ARRAY rarity_order
    LOOP
      IF found_item THEN EXIT; END IF;

      FOR ingredient IN SELECT * FROM jsonb_array_elements(recipe_record.ingredients)
      LOOP
        ingredient_item_id := (ingredient->>'item_id')::uuid;

        SELECT ci.* INTO lost_item_record
        FROM collectible_items ci
        WHERE ci.id = ingredient_item_id AND ci.rarity = r;

        IF lost_item_record IS NOT NULL THEN
          UPDATE user_inventory
          SET quantity = quantity - 1, updated_at = now()
          WHERE user_id = p_user_id AND item_id = ingredient_item_id;

          found_item := true;
          EXIT;
        END IF;
      END LOOP;
    END LOOP;

    -- Log failed craft attempt
    INSERT INTO user_crafts (user_id, recipe_id, result_data)
    VALUES (p_user_id, p_recipe_id, json_build_object(
      'success', false,
      'lost_item_id', lost_item_record.id,
      'lost_item_name', lost_item_record.name
    )::jsonb);

    RETURN json_build_object(
      'success', false,
      'craft_failed', true,
      'lost_item', json_build_object(
        'id', lost_item_record.id,
        'name', lost_item_record.name,
        'image_url', lost_item_record.image_url,
        'rarity', lost_item_record.rarity
      )
    );
  END IF;

  -- SUCCESS: Deduct all ingredients
  FOR ingredient IN SELECT * FROM jsonb_array_elements(recipe_record.ingredients)
  LOOP
    ingredient_item_id := (ingredient->>'item_id')::uuid;
    ingredient_qty := (ingredient->>'quantity')::integer;

    UPDATE user_inventory
    SET quantity = quantity - ingredient_qty, updated_at = now()
    WHERE user_id = p_user_id AND item_id = ingredient_item_id;
  END LOOP;

  -- Award result
  IF recipe_record.result_type = 'cosmetic' AND recipe_record.result_shop_item_id IS NOT NULL THEN
    INSERT INTO user_purchases (user_id, item_id)
    VALUES (p_user_id, recipe_record.result_shop_item_id)
    ON CONFLICT (user_id, item_id) DO NOTHING;
  ELSIF recipe_record.result_type = 'xp' AND recipe_record.result_xp > 0 THEN
    UPDATE users SET xp = xp + recipe_record.result_xp WHERE id = p_user_id;
  ELSIF recipe_record.result_type = 'gems' AND recipe_record.result_gems > 0 THEN
    UPDATE users SET gems = gems + recipe_record.result_gems WHERE id = p_user_id;
  ELSIF recipe_record.result_type = 'item' AND recipe_record.result_item_id IS NOT NULL THEN
    INSERT INTO user_inventory (user_id, item_id, quantity)
VALUES (p_user_id, recipe_record.result_item_id, COALESCE(recipe_record.result_quantity, 1))
ON CONFLICT (user_id, item_id)
DO UPDATE SET quantity = user_inventory.quantity + COALESCE(recipe_record.result_quantity, 1), updated_at = now();

  END IF;

  -- Look up result item name if applicable
  IF recipe_record.result_item_id IS NOT NULL THEN
    SELECT ci.name INTO result_item_name
    FROM collectible_items ci WHERE ci.id = recipe_record.result_item_id;
  END IF;

  -- Log successful craft
  INSERT INTO user_crafts (user_id, recipe_id, result_data)
  VALUES (p_user_id, p_recipe_id, json_build_object(
    'success', true,
    'result_type', recipe_record.result_type,
    'result_xp', recipe_record.result_xp,
    'result_gems', recipe_record.result_gems,
    'result_shop_item_id', recipe_record.result_shop_item_id,
    'result_item_id', recipe_record.result_item_id
  )::jsonb);

  RETURN json_build_object(
    'success', true,
    'result_type', recipe_record.result_type,
    'result_name', recipe_record.name,
    'result_image_url', recipe_record.result_image_url,
    'result_xp', recipe_record.result_xp,
    'result_gems', recipe_record.result_gems,
    'result_item_id', recipe_record.result_item_id,
    'result_item_name', result_item_name
  );
END;$$;


--
-- Name: create_user_equipment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_user_equipment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.user_equipment (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: decay_pet_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decay_pet_stats() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE user_pets
  SET
    happiness = GREATEST(0, happiness - 5),
    updated_at = now()
  WHERE is_active = true;
END;
$$;


--
-- Name: equip_background(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.equip_background(p_user_id uuid, p_item_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_background_url text;
  v_owns_item boolean;
BEGIN
  -- Check if user owns this background
  SELECT EXISTS(
    SELECT 1 FROM public.user_purchases
    WHERE user_id = p_user_id AND item_id = p_item_id
  ) INTO v_owns_item;

  IF NOT v_owns_item THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You do not own this background'
    );
  END IF;

  -- Get background URL from shop_items
  SELECT item_data->>'background_url'
  INTO v_background_url
  FROM public.shop_items
  WHERE id = p_item_id AND category = 'background';

  IF v_background_url IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid background item'
    );
  END IF;

  -- Update user's active background
  UPDATE public.users
  SET active_background_url = v_background_url,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'background_url', v_background_url
  );
END;
$$;


--
-- Name: evolve_pet(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.evolve_pet(p_user_id uuid, p_user_pet_id uuid, p_fruit_item_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_pet record;
  v_pet record;
  v_next_stage integer;
  v_required_xp integer;
  v_fruit record;
  v_inv record;
BEGIN
  -- Get user pet
  SELECT * INTO v_user_pet FROM user_pets WHERE id = p_user_pet_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pet not found');
  END IF;

  -- Get pet definition
  SELECT * INTO v_pet FROM pets WHERE id = v_user_pet.pet_id;
  IF v_pet.evolution_stages IS NULL OR jsonb_array_length(v_pet.evolution_stages) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'This pet cannot evolve');
  END IF;

  -- Find next stage
  v_next_stage := COALESCE(v_user_pet.evolution_stage, 0) + 1;
  v_required_xp := NULL;

  FOR i IN 0..jsonb_array_length(v_pet.evolution_stages) - 1 LOOP
    IF (v_pet.evolution_stages->i->>'stage')::integer = v_next_stage THEN
      v_required_xp := (v_pet.evolution_stages->i->>'xp_required')::integer;
    END IF;
  END LOOP;

  IF v_required_xp IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already at max evolution');
  END IF;

  -- Check XP
  IF COALESCE(v_user_pet.xp, 0) < v_required_xp THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough XP');
  END IF;

  -- Check fruit: must be pet_food and match pet rarity
  SELECT ci.* INTO v_fruit FROM collectible_items ci WHERE ci.id = p_fruit_item_id AND ci.item_type = 'pet_food';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid evolution fruit');
  END IF;

  IF v_fruit.rarity <> v_pet.rarity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fruit rarity does not match pet rarity');
  END IF;

  -- Check inventory
  SELECT * INTO v_inv FROM user_inventory WHERE user_id = p_user_id AND item_id = p_fruit_item_id AND quantity > 0;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have this fruit');
  END IF;

  -- Consume fruit
  UPDATE user_inventory SET quantity = quantity - 1, updated_at = now()
    WHERE user_id = p_user_id AND item_id = p_fruit_item_id;

  -- Evolve
  UPDATE user_pets SET evolution_stage = v_next_stage WHERE id = p_user_pet_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_stage', v_next_stage,
    'fruit_used', v_fruit.name
  );
END;
$$;


--
-- Name: feed_pet(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feed_pet(p_user_id uuid, p_user_pet_id uuid, p_item_id uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  pet_record record;
  item_record record;
  happiness_gain integer := 10;
  energy_gain integer := 15;
  new_happiness integer;
  new_energy integer;
  current_energy integer;
BEGIN
  SELECT * INTO pet_record
  FROM user_pets
  WHERE id = p_user_pet_id AND user_id = p_user_id;

  IF pet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Pet not found');
  END IF;

  IF p_item_id IS NOT NULL THEN
    SELECT * INTO item_record
    FROM collectible_items
    WHERE id = p_item_id AND item_type = 'pet_food';

    IF item_record IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Invalid pet food item');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM user_inventory
      WHERE user_id = p_user_id AND item_id = p_item_id AND quantity > 0
    ) THEN
      RETURN json_build_object('success', false, 'error', 'You don''t have this item');
    END IF;

    UPDATE user_inventory
    SET quantity = quantity - 1, updated_at = now()
    WHERE user_id = p_user_id AND item_id = p_item_id;

    happiness_gain := CASE item_record.rarity
      WHEN 'common' THEN 10
      WHEN 'uncommon' THEN 15
      WHEN 'rare' THEN 20
      WHEN 'epic' THEN 25
      ELSE 10
    END;
    
    energy_gain := CASE item_record.rarity
      WHEN 'common' THEN 5
      WHEN 'uncommon' THEN 10
      WHEN 'rare' THEN 15
      WHEN 'epic' THEN 20
      ELSE 15
    END;
  END IF;

  new_happiness := LEAST(100, pet_record.happiness + happiness_gain);

  -- Energy is now on users table
  SELECT COALESCE(energy, 100) INTO current_energy FROM users WHERE id = p_user_id;
  new_energy := LEAST(100, current_energy + energy_gain);

  UPDATE users
  SET energy = new_energy
  WHERE id = p_user_id;

  -- Pet only gets happiness update, not energy
  UPDATE user_pets
  SET
    happiness = new_happiness,
    last_fed_at = now(),
    updated_at = now()
  WHERE id = p_user_pet_id;

  INSERT INTO pet_interactions (user_id, user_pet_id, interaction_type, item_used_id, happiness_change, energy_change)
  VALUES (p_user_id, p_user_pet_id, 'feed', p_item_id, happiness_gain, energy_gain);

  RETURN json_build_object(
    'success', true,
    'happiness', new_happiness,
    'energy', new_energy,
    'happiness_change', happiness_gain,
    'energy_change', energy_gain
  );
END;
$$;


--
-- Name: fill_achievement_names(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_achievement_names() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  SELECT full_name INTO NEW.user_name FROM users WHERE id = NEW.user_id;
  SELECT title INTO NEW.achievement_name FROM achievements WHERE id = NEW.achievement_id;
  RETURN NEW;
END;
$$;


--
-- Name: fill_chest_user_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_chest_user_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  SELECT full_name INTO NEW.user_name FROM users WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;


--
-- Name: fill_craft_names(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_craft_names() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  SELECT full_name INTO NEW.user_name FROM users WHERE id = NEW.user_id;
  SELECT name INTO NEW.recipe_name FROM recipes WHERE id = NEW.recipe_id;
  RETURN NEW;
END;
$$;


--
-- Name: fill_inventory_names(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_inventory_names() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  SELECT full_name INTO NEW.user_name FROM users WHERE id = NEW.user_id;
  SELECT name INTO NEW.item_name FROM collectible_items WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$;


--
-- Name: fill_pet_names(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_pet_names() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  SELECT full_name INTO NEW.user_name FROM users WHERE id = NEW.user_id;
  SELECT name INTO NEW.pet_name FROM pets WHERE id = NEW.pet_id;
  RETURN NEW;
END;
$$;


--
-- Name: fill_purchase_names(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_purchase_names() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  SELECT full_name INTO NEW.user_name FROM users WHERE id = NEW.user_id;
  SELECT name INTO NEW.item_name FROM shop_items WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$;


--
-- Name: get_active_pet(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_pet(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
  pet_record record;
  bonuses json;
  user_energy integer;
  resolved_image text;
  evo_stage jsonb;
BEGIN
  SELECT up.*, p.name as pet_name, p.info as pet_info, p.description as pet_description,
    p.image_url as pet_image_url, p.rarity, p.evolution_stages
  INTO pet_record
  FROM user_pets up JOIN pets p ON up.pet_id = p.id
  WHERE up.user_id = p_user_id AND up.is_active = true LIMIT 1;

  IF pet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active pet');
  END IF;

  UPDATE users SET energy = 100, energy_last_reset = CURRENT_DATE
  WHERE id = p_user_id AND (energy_last_reset IS NULL OR energy_last_reset < CURRENT_DATE);

  SELECT energy INTO user_energy FROM users WHERE id = p_user_id;

  SELECT json_agg(json_build_object('bonus_type', pb.bonus_type, 'bonus_value', pb.bonus_value, 'description', pb.description))
  INTO bonuses FROM pet_bonuses pb
  WHERE pb.pet_id = pet_record.pet_id AND pet_record.happiness >= pb.min_happiness;

  resolved_image := pet_record.pet_image_url;
  IF pet_record.evolution_stage > 0 AND pet_record.evolution_stages IS NOT NULL THEN
    SELECT elem INTO evo_stage
    FROM jsonb_array_elements(pet_record.evolution_stages) AS elem
    WHERE (elem->>'stage')::int = pet_record.evolution_stage LIMIT 1;
    IF evo_stage IS NOT NULL AND evo_stage->>'image_url' IS NOT NULL THEN
      resolved_image := evo_stage->>'image_url';
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'pet', json_build_object(
      'id', pet_record.id, 'pet_id', pet_record.pet_id,
      'nickname', pet_record.nickname, 'name', pet_record.pet_name,
      'info', pet_record.pet_info, 'description', pet_record.pet_description,
      'image_url', resolved_image,
      'base_image_url', pet_record.pet_image_url,
      'rarity', pet_record.rarity,
      'happiness', pet_record.happiness, 'energy', COALESCE(user_energy, 100),
      'level', pet_record.level, 'xp', pet_record.xp,
      'evolution_stage', pet_record.evolution_stage,
      'evolution_stages', pet_record.evolution_stages,
      'last_fed_at', pet_record.last_fed_at, 'last_played_at', pet_record.last_played_at
    ),
    'bonuses', COALESCE(bonuses, '[]'::json)
  );
END;
$$;


--
-- Name: get_available_avatars(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_available_avatars(user_xp integer) RETURNS TABLE(avatar_data json)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT row_to_json(av.*) as avatar_data
  FROM public.avatars av
  WHERE av.unlock_xp <= user_xp
    AND av.is_active = true
  ORDER BY av.unlock_xp ASC, av.name ASC;
END;
$$;


--
-- Name: get_banh_chung_leaderboard(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_banh_chung_leaderboard(p_item_id uuid) RETURNS TABLE(user_id uuid, user_name text, quantity integer, full_name text, avatar_url text, active_title text, active_frame_ratio text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    ui.user_id,
    ui.user_name,
    ui.quantity,
    u.full_name,
    u.avatar_url,
    u.active_title,
    u.active_frame_ratio
  FROM user_inventory ui
  JOIN users u ON u.id = ui.user_id AND u.role = 'user'
  WHERE ui.item_id = p_item_id AND ui.quantity > 0
  ORDER BY ui.quantity DESC
  LIMIT 50;
END;
$$;


--
-- Name: get_daily_challenge_leaderboard(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_daily_challenge_leaderboard(p_challenge_id uuid, p_limit integer DEFAULT 50) RETURNS TABLE(rank integer, user_id uuid, full_name text, avatar_url text, active_frame_ratio text, score integer, time_spent integer, attempts integer, xp integer, level integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY dcp.score DESC, dcp.time_spent ASC)::integer AS rank,
    u.id AS user_id,
    u.full_name,
    u.avatar_url,
    ue.active_frame_ratio,
    dcp.score,
    dcp.time_spent,
    dcp.attempts,
    u.xp,
    u.level
  FROM daily_challenge_participations dcp
  JOIN users u ON u.id = dcp.user_id
  LEFT JOIN user_equipment ue ON ue.user_id = u.id
  WHERE dcp.challenge_id = p_challenge_id
  ORDER BY dcp.score DESC, dcp.time_spent ASC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_leaderboard(text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_leaderboard(p_period text, p_start_date date) RETURNS TABLE(id uuid, full_name text, email text, total_xp integer, streak_count integer, avatar_url text, active_title text, active_frame_ratio text, hide_frame boolean, timeframe_xp bigint, exercise_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH exercise_xp AS (
    SELECT
      up.user_id,
      SUM(
        CASE
          WHEN up.max_score > 0 AND (up.score::numeric / up.max_score) * 100 >= 95
            THEN round(COALESCE(e.xp_reward, 10) * 1.5)
          WHEN up.max_score > 0 AND (up.score::numeric / up.max_score) * 100 >= 90
            THEN round(COALESCE(e.xp_reward, 10) * 1.3)
          ELSE COALESCE(e.xp_reward, 10)
        END
      )::bigint AS xp,
      COUNT(*)::bigint AS ex_count
    FROM user_progress up
    LEFT JOIN exercises e ON e.id = up.exercise_id
    WHERE up.status = 'completed'
      AND CASE
        WHEN p_period = 'today'
          THEN (up.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_start_date
        ELSE (up.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      END
    GROUP BY up.user_id
  ),
  chest_xp AS (
    SELECT
      src.user_id,
      SUM(src.xp_awarded)::bigint AS xp
    FROM session_reward_claims src
    WHERE src.xp_awarded > 0
      AND CASE
        WHEN p_period = 'today'
          THEN (src.claimed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_start_date
        ELSE (src.claimed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      END
    GROUP BY src.user_id
  )
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.xp AS total_xp,
    u.streak_count,
    u.avatar_url,
    ue.active_title,
    ue.active_frame_ratio,
    ue.hide_frame,
    (COALESCE(ex.xp, 0) + COALESCE(c.xp, 0))::bigint AS timeframe_xp,
    COALESCE(ex.ex_count, 0)::bigint AS exercise_count
  FROM users u
  LEFT JOIN user_equipment ue ON ue.user_id = u.id
  LEFT JOIN exercise_xp ex ON ex.user_id = u.id
  LEFT JOIN chest_xp c ON c.user_id = u.id
  WHERE u.role = 'user'
    AND (COALESCE(ex.xp, 0) + COALESCE(c.xp, 0)) > 0
  ORDER BY timeframe_xp DESC
  LIMIT 50;
$$;


--
-- Name: get_next_level_info(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_level_info(user_xp integer) RETURNS TABLE(current_level json, next_level json, xp_needed integer, progress_percentage numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
  current_lvl public.student_levels;
  next_lvl public.student_levels;
BEGIN
  -- Get current level (highest level where xp_required <= user_xp)
  SELECT * INTO current_lvl
  FROM public.student_levels
  WHERE xp_required <= user_xp
    AND is_active = true
  ORDER BY level_number DESC
  LIMIT 1;

  -- Get next level
  SELECT * INTO next_lvl
  FROM public.student_levels
  WHERE level_number = current_lvl.level_number + 1
    AND is_active = true;

  -- Calculate progress
  RETURN QUERY
  SELECT
    row_to_json(current_lvl) as current_level,
    row_to_json(next_lvl) as next_level,
    CASE
      WHEN next_lvl.xp_required IS NOT NULL THEN next_lvl.xp_required - user_xp
      ELSE 0
    END as xp_needed,
    CASE
      WHEN next_lvl.xp_required IS NOT NULL THEN
        ROUND((user_xp - current_lvl.xp_required)::numeric / (next_lvl.xp_required - current_lvl.xp_required)::numeric * 100, 2)
      ELSE 100.0
    END as progress_percentage;
END;
$$;


--
-- Name: get_notifications(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_notifications(p_user_id uuid) RETURNS TABLE(id uuid, user_id uuid, type text, title text, message text, icon text, data jsonb, is_read boolean, cohort_id uuid, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH my_cohorts AS (
    SELECT cm.cohort_id
    FROM cohort_members cm
    WHERE cm.student_id = p_user_id
      AND cm.is_active = true
  ),
  user_notifs AS (
    SELECT n.id, n.user_id, n.type, n.title, n.message, n.icon, n.data,
           n.is_read, n.cohort_id, n.created_at
    FROM notifications n
    WHERE n.user_id = p_user_id
    ORDER BY n.created_at DESC
    LIMIT 50
  ),
  shared_notifs AS (
    SELECT n.id, n.user_id, n.type, n.title, n.message, n.icon, n.data,
           EXISTS (
             SELECT 1 FROM notification_reads r
             WHERE r.notification_id = n.id AND r.user_id = p_user_id
           ) AS is_read,
           n.cohort_id, n.created_at
    FROM notifications n
    WHERE n.user_id IS NULL
      AND (
        n.cohort_id IS NULL
        OR n.cohort_id IN (SELECT cohort_id FROM my_cohorts)
      )
    ORDER BY n.created_at DESC
    LIMIT 40
  ),
  combined AS (
    SELECT * FROM user_notifs
    UNION ALL
    SELECT * FROM shared_notifs
  ),
  deduped AS (
    SELECT DISTINCT ON (c.id)
           c.id, c.user_id, c.type, c.title, c.message, c.icon, c.data,
           c.is_read, c.cohort_id, c.created_at
    FROM combined c
    ORDER BY c.id, c.created_at DESC
  )
  SELECT d.id, d.user_id, d.type, d.title, d.message, d.icon, d.data,
         d.is_read, d.cohort_id, d.created_at
  FROM deduped d
  WHERE d.type <> 'mission_reward'
  ORDER BY d.created_at DESC
  LIMIT 50;
$$;


--
-- Name: get_student_weakness_by_course(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_student_weakness_by_course(p_course_id uuid) RETURNS TABLE(user_id uuid, full_name text, avatar_url text, tag text, total_questions bigint, correct bigint, accuracy numeric)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    qa.user_id,
    u.full_name,
    u.avatar_url,
    unnest(e.tags) AS tag,
    COUNT(*) AS total_questions,
    COUNT(*) FILTER (WHERE qa.is_correct) AS correct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE qa.is_correct) / COUNT(*)) AS accuracy
  FROM question_attempts qa
  JOIN exercises e ON e.id = qa.exercise_id
  JOIN exercise_assignments ea ON ea.exercise_id = e.id
  JOIN sessions s ON s.id = ea.session_id
  JOIN units un ON un.id = s.unit_id
  JOIN users u ON u.id = qa.user_id AND u.role = 'user'
  WHERE un.course_id = p_course_id
    AND e.tags IS NOT NULL
    AND array_length(e.tags, 1) > 0
  GROUP BY qa.user_id, u.full_name, u.avatar_url, unnest(e.tags)
  ORDER BY qa.user_id, accuracy ASC;
$$;


--
-- Name: get_user_challenge_attempts(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_challenge_attempts(p_challenge_id uuid, p_user_id uuid) RETURNS TABLE(attempt_number integer, score integer, started_at timestamp with time zone, completed_at timestamp with time zone, time_spent integer, is_best boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
  best_attempt_id_var uuid;
BEGIN
  -- Get the best attempt ID
  SELECT best_attempt_id INTO best_attempt_id_var
  FROM daily_challenge_participations
  WHERE challenge_id = p_challenge_id AND user_id = p_user_id;

  RETURN QUERY
  SELECT
    dca.attempt_number,
    dca.score,
    dca.started_at,
    dca.completed_at,
    dca.time_spent,
    (dca.id = best_attempt_id_var) AS is_best
  FROM daily_challenge_attempts dca
  WHERE dca.challenge_id = p_challenge_id
    AND dca.user_id = p_user_id
  ORDER BY dca.attempt_number ASC;
END;
$$;


--
-- Name: get_user_challenge_win_counts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_challenge_win_counts(p_user_id uuid) RETURNS TABLE(achievement_type text, win_count bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN a.criteria_type LIKE '%rank_1%' THEN 'rank_1'
      WHEN a.criteria_type LIKE '%rank_2%' THEN 'rank_2'
      WHEN a.criteria_type LIKE '%rank_3%' THEN 'rank_3'
    END as achievement_type,
    COUNT(*)::bigint as win_count
  FROM user_achievements ua
  JOIN achievements a ON a.id = ua.achievement_id
  WHERE ua.user_id = p_user_id
    AND a.criteria_type LIKE 'daily_challenge_rank_%'
  GROUP BY
    CASE
      WHEN a.criteria_type LIKE '%rank_1%' THEN 'rank_1'
      WHEN a.criteria_type LIKE '%rank_2%' THEN 'rank_2'
      WHEN a.criteria_type LIKE '%rank_3%' THEN 'rank_3'
    END
  ORDER BY achievement_type;
END;
$$;


--
-- Name: FUNCTION get_user_challenge_win_counts(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_user_challenge_win_counts(p_user_id uuid) IS 'Returns the count of how many times a user has earned rank 1, 2, or 3 achievements.
Simply counts records in user_achievements table.';


--
-- Name: get_user_daily_challenge(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_daily_challenge(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
  vietnam_today date;
  user_difficulty text;
  user_level_num integer;
  challenge_record record;
  user_participation record;
  result json;
BEGIN
  -- Get today's date in Vietnam timezone
  vietnam_today := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  -- Get user's current level number directly from users table
  SELECT current_level INTO user_level_num
  FROM users
  WHERE id = p_user_id;

  -- Determine difficulty based on level number
  IF user_level_num IS NULL OR user_level_num <= 10 THEN
    user_difficulty := 'beginner'; -- Levels 1-10
  ELSIF user_level_num <= 20 THEN
    user_difficulty := 'intermediate'; -- Levels 11-20
  ELSE
    user_difficulty := 'advanced'; -- Levels 21-30
  END IF;

  -- Get today's challenge for user's difficulty
  SELECT * INTO challenge_record
  FROM daily_challenges
  WHERE challenge_date = vietnam_today
    AND difficulty_level = user_difficulty
    AND is_active = true
  LIMIT 1;

  IF challenge_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No challenge available');
  END IF;

  -- Check user participation
  SELECT * INTO user_participation
  FROM daily_challenge_participations
  WHERE challenge_id = challenge_record.id AND user_id = p_user_id;

  -- Build result with exercise details
  SELECT json_build_object(
    'success', true,
    'challenge_id', challenge_record.id,
    'difficulty_level', challenge_record.difficulty_level,
    'exercise_id', challenge_record.exercise_id,
    'exercise_title', e.title,
    'exercise_type', e.exercise_type,
    'base_xp_reward', challenge_record.base_xp_reward,
    'base_gem_reward', challenge_record.base_gem_reward,
    'is_locked', challenge_record.is_locked,
    'winners_awarded', challenge_record.winners_awarded,
    'participated', (user_participation IS NOT NULL),
    'user_score', user_participation.score,
    'user_rank', (
      -- Calculate rank dynamically instead of using cached rank_calculated
      CASE
        WHEN user_participation.score >= 75 THEN
          (SELECT COUNT(*) + 1
           FROM daily_challenge_participations dcp
           WHERE dcp.challenge_id = challenge_record.id
             AND dcp.score >= 75
             AND (dcp.score > user_participation.score
               OR (dcp.score = user_participation.score
                 AND dcp.time_spent < user_participation.time_spent)))
        ELSE NULL
      END
    ),
    'user_time', user_participation.time_spent,
    'attempts_used', COALESCE(user_participation.attempts, 0),
    'max_attempts', 3,
    'session_id', e.session_id
  ) INTO result
  FROM exercises e
  WHERE e.id = challenge_record.exercise_id;

  RETURN result;
END;
$$;


--
-- Name: get_user_level(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_level(user_xp integer) RETURNS TABLE(level_info json)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT row_to_json(sl.*) as level_info
  FROM public.student_levels sl
  WHERE sl.xp_required <= user_xp
    AND sl.is_active = true
  ORDER BY sl.level_number DESC
  LIMIT 1;
END;
$$;


--
-- Name: get_user_missions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_missions(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  today date;
  week_start date;
  result json;
BEGIN
  today := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  week_start := today - (EXTRACT(ISODOW FROM today)::int - 1);

  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', today
  FROM missions m WHERE m.is_active = true AND m.mission_type = 'daily'
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', week_start
  FROM missions m WHERE m.is_active = true AND m.mission_type = 'weekly'
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', COALESCE(m.start_date, today)
  FROM missions m
  WHERE m.is_active = true AND m.mission_type = 'special'
    AND (m.start_date IS NULL OR m.start_date <= today)
    AND (m.end_date IS NULL OR m.end_date >= today)
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  SELECT json_build_object(
    'daily', COALESCE((
      SELECT json_agg(row_to_json(d) ORDER BY d.sort_order) FROM (
        SELECT m.id AS mission_id, m.title, m.description, m.icon,
               m.mission_type, m.goal_type, m.goal_value,
               m.reward_xp, m.reward_gems, m.reward_item_id, m.reward_item_quantity,
               ci.name AS reward_item_name, ci.image_url AS reward_item_image,
               ch.name AS reward_chest_name, ch.image_url AS reward_chest_image,
               m.reward_chest_id,
               m.sort_order,
               um.id AS user_mission_id,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN (
                 SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                 WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                   AND m2.mission_type = 'daily' AND m2.goal_type != 'complete_all_missions'
                   AND m2.is_active = true AND um2.period_start = today
               ) ELSE um.progress END AS progress,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN
                 CASE WHEN (
                   SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                   WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                     AND m2.mission_type = 'daily' AND m2.goal_type != 'complete_all_missions'
                     AND m2.is_active = true AND um2.period_start = today
                 ) >= m.goal_value AND um.status = 'active' THEN 'completed' ELSE um.status END
               ELSE um.status END AS status
        FROM missions m
        JOIN user_missions um ON um.mission_id = m.id AND um.user_id = p_user_id
        LEFT JOIN collectible_items ci ON ci.id = m.reward_item_id
        LEFT JOIN chests ch ON ch.id = m.reward_chest_id
        WHERE m.is_active = true AND m.mission_type = 'daily' AND um.period_start = today
      ) d
    ), '[]'::json),
    'weekly', COALESCE((
      SELECT json_agg(row_to_json(w) ORDER BY w.sort_order) FROM (
        SELECT m.id AS mission_id, m.title, m.description, m.icon,
               m.mission_type, m.goal_type, m.goal_value,
               m.reward_xp, m.reward_gems, m.reward_item_id, m.reward_item_quantity,
               ci.name AS reward_item_name, ci.image_url AS reward_item_image,
               ch.name AS reward_chest_name, ch.image_url AS reward_chest_image,
               m.reward_chest_id,
               m.sort_order,
               um.id AS user_mission_id,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN (
                 SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                 WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                   AND m2.mission_type = 'weekly' AND m2.goal_type != 'complete_all_missions'
                   AND m2.is_active = true AND um2.period_start = week_start
               ) ELSE um.progress END AS progress,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN
                 CASE WHEN (
                   SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                   WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                     AND m2.mission_type = 'weekly' AND m2.goal_type != 'complete_all_missions'
                     AND m2.is_active = true AND um2.period_start = week_start
                 ) >= m.goal_value AND um.status = 'active' THEN 'completed' ELSE um.status END
               ELSE um.status END AS status
        FROM missions m
        JOIN user_missions um ON um.mission_id = m.id AND um.user_id = p_user_id
        LEFT JOIN collectible_items ci ON ci.id = m.reward_item_id
        LEFT JOIN chests ch ON ch.id = m.reward_chest_id
        WHERE m.is_active = true AND m.mission_type = 'weekly' AND um.period_start = week_start
      ) w
    ), '[]'::json),
    'special', COALESCE((
      SELECT json_agg(row_to_json(s) ORDER BY s.sort_order) FROM (
        SELECT m.id AS mission_id, m.title, m.description, m.icon,
               m.mission_type, m.goal_type, m.goal_value,
               m.reward_xp, m.reward_gems, m.reward_item_id, m.reward_item_quantity,
               ci.name AS reward_item_name, ci.image_url AS reward_item_image,
               ch.name AS reward_chest_name, ch.image_url AS reward_chest_image,
               m.reward_chest_id,
               m.sort_order,
               m.start_date, m.end_date,
               um.id AS user_mission_id,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN (
                 SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                 WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                   AND m2.mission_type = 'special' AND m2.goal_type != 'complete_all_missions'
                   AND m2.is_active = true AND um2.period_start = COALESCE(m2.start_date, today)
               ) ELSE um.progress END AS progress,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN
                 CASE WHEN (
                   SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                   WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                     AND m2.mission_type = 'special' AND m2.goal_type != 'complete_all_missions'
                     AND m2.is_active = true AND um2.period_start = COALESCE(m2.start_date, today)
                 ) >= m.goal_value AND um.status = 'active' THEN 'completed' ELSE um.status END
               ELSE um.status END AS status
        FROM missions m
        JOIN user_missions um ON um.mission_id = m.id AND um.user_id = p_user_id
        LEFT JOIN collectible_items ci ON ci.id = m.reward_item_id
        LEFT JOIN chests ch ON ch.id = m.reward_chest_id
        WHERE m.is_active = true AND m.mission_type = 'special'
          AND (m.start_date IS NULL OR m.start_date <= today)
          AND (m.end_date IS NULL OR m.end_date >= today)
          AND um.period_start = COALESCE(m.start_date, today)
      ) s
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: get_user_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_profile(user_id uuid) RETURNS TABLE(id uuid, email text, full_name text, avatar_url text, role text, current_level integer, xp integer, streak_count integer, last_activity_date date, total_practice_time integer, created_at timestamp with time zone, updated_at timestamp with time zone, level integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    id,
    email,
    full_name,
    avatar_url,
    role,
    current_level,
    xp,
    streak_count,
    last_activity_date,
    total_practice_time,
    created_at,
    updated_at,
    level
  FROM public.users
  WHERE public.users.id = user_id;
$$;


--
-- Name: handle_new_oauth_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_oauth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Only create profile if it doesn't exist yet
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    INSERT INTO public.users (
      id,
      email,
      full_name,
      avatar_url,
      role,
      current_level,
      xp,
      streak_count
    ) VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      NEW.raw_user_meta_data->>'avatar_url',
      'user',
      1,
      0,
      0
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: increment_user_currency(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_user_currency(p_user_id uuid, p_xp integer DEFAULT 0, p_gems integer DEFAULT 0) RETURNS TABLE(xp integer, gems integer, level integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  UPDATE users u
     SET xp    = GREATEST(COALESCE(u.xp, 0) + p_xp, 0),
         gems  = GREATEST(COALESCE(u.gems, 0) + p_gems, 0),
         level = FLOOR(GREATEST(COALESCE(u.xp, 0) + p_xp, 0) / 1000) + 1,
         updated_at = now()
   WHERE u.id = p_user_id
  RETURNING u.xp, u.gems, u.level;
END;
$$;


--
-- Name: leave_queue(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leave_queue(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('wordtype'));
  DELETE FROM pvp_matchmaking WHERE user_id = p_user_id;
END;
$$;


--
-- Name: match_player(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_player(p_user_id uuid, p_game_type text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_my_row record;
  v_opponent record;
  v_challenge record;
  v_challenge_id uuid;
  v_seed int;
  v_queue_count int;
  v_opponent_user record;
BEGIN
  -- Serialize all matchmaking for this game type
  PERFORM pg_advisory_xact_lock(hashtext(p_game_type));

  -- Clean up stale matchmaking rows older than 5 minutes
  DELETE FROM pvp_matchmaking WHERE created_at < now() - interval '5 minutes';

  -- Clean up orphaned in_progress challenges older than 10 minutes
  UPDATE pvp_challenges SET status = 'expired'
    WHERE status = 'in_progress' AND realtime_mode = true
    AND created_at < now() - interval '10 minutes';

  -- Check if we already have a row
  SELECT * INTO v_my_row FROM pvp_matchmaking
    WHERE user_id = p_user_id AND game_type = p_game_type;

  -- If already matched, return match info and clean up
  IF v_my_row IS NOT NULL AND v_my_row.status = 'matched' AND v_my_row.challenge_id IS NOT NULL THEN
    SELECT id, challenger_id, word_seed INTO v_challenge
      FROM pvp_challenges WHERE id = v_my_row.challenge_id;
    SELECT id, full_name, avatar_url INTO v_opponent_user
      FROM users WHERE id = v_challenge.challenger_id;
    DELETE FROM pvp_matchmaking WHERE id = v_my_row.id;
    RETURN jsonb_build_object(
      'status', 'matched',
      'challenge_id', v_my_row.challenge_id,
      'opponent_id', v_challenge.challenger_id,
      'opponent_name', v_opponent_user.full_name,
      'opponent_avatar', v_opponent_user.avatar_url,
      'word_seed', v_challenge.word_seed,
      'is_challenger', false
    );
  END IF;

  -- Count queue
  SELECT count(*) INTO v_queue_count FROM pvp_matchmaking
    WHERE game_type = p_game_type AND status = 'waiting';

  -- Find a waiting opponent
  SELECT * INTO v_opponent FROM pvp_matchmaking
    WHERE game_type = p_game_type AND status = 'waiting' AND user_id != p_user_id
    ORDER BY created_at LIMIT 1;

  IF v_opponent IS NULL THEN
    -- No opponent, ensure we're in the queue
    IF v_my_row IS NULL THEN
      INSERT INTO pvp_matchmaking (user_id, game_type, status)
        VALUES (p_user_id, p_game_type, 'waiting');
      v_queue_count := v_queue_count + 1;
    END IF;
    RETURN jsonb_build_object('status', 'waiting', 'queue_count', v_queue_count);
  END IF;

  -- Match found - create challenge atomically
  v_seed := floor(random() * 2147483647);
  INSERT INTO pvp_challenges (challenger_id, opponent_id, game_type, challenger_score, status, realtime_mode, word_seed)
    VALUES (p_user_id, v_opponent.user_id, p_game_type, 0, 'in_progress', true, v_seed)
    RETURNING id INTO v_challenge_id;

  -- Update opponent's row to matched
  UPDATE pvp_matchmaking SET status = 'matched', challenge_id = v_challenge_id
    WHERE id = v_opponent.id;

  -- Remove our own row (we have the match info already)
  IF v_my_row IS NOT NULL THEN
    DELETE FROM pvp_matchmaking WHERE id = v_my_row.id;
  END IF;

  -- Get opponent info
  SELECT id, full_name, avatar_url INTO v_opponent_user
    FROM users WHERE id = v_opponent.user_id;

  RETURN jsonb_build_object(
    'status', 'matched',
    'challenge_id', v_challenge_id,
    'opponent_id', v_opponent.user_id,
    'opponent_name', v_opponent_user.full_name,
    'opponent_avatar', v_opponent_user.avatar_url,
    'word_seed', v_seed,
    'is_challenger', true
  );
END;
$$;


--
-- Name: open_chest(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_chest(p_user_id uuid, p_user_chest_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  chest_record record;
  user_chest_record record;
  loot_entry jsonb;
  guaranteed_entry jsonb;
  total_weight integer;
  roll float;
  cumulative_weight integer;
  selected_item_id uuid;
  drop_qty integer;
  received_items jsonb := '[]'::jsonb;
  i integer;
  reward_type text;
  shop_item_record record;
BEGIN
  -- Verify ownership and unopened status
  SELECT uc.*, c.loot_table, c.guaranteed_items, c.items_per_open, c.name as chest_name
  INTO user_chest_record
  FROM user_chests uc
  JOIN chests c ON uc.chest_id = c.id
  WHERE uc.id = p_user_chest_id AND uc.user_id = p_user_id AND uc.opened_at IS NULL;

  IF user_chest_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Chest not found or already opened');
  END IF;

  -- Process guaranteed items
  IF user_chest_record.guaranteed_items IS NOT NULL AND jsonb_array_length(user_chest_record.guaranteed_items) > 0 THEN
    FOR guaranteed_entry IN SELECT * FROM jsonb_array_elements(user_chest_record.guaranteed_items)
    LOOP
      reward_type := COALESCE(guaranteed_entry->>'reward_type', 'item');
      drop_qty := COALESCE((guaranteed_entry->>'quantity')::integer, 1);

      IF reward_type = 'xp' THEN
        UPDATE users SET xp = xp + drop_qty WHERE id = p_user_id;
        received_items := received_items || jsonb_build_object(
          'reward_type', 'xp', 'quantity', drop_qty, 'source', 'guaranteed',
          'name', drop_qty || ' XP', 'rarity', 'epic', 'item_type', 'xp', 'image_url', ''
        );
      ELSIF reward_type = 'gems' THEN
        UPDATE users SET gems = gems + drop_qty WHERE id = p_user_id;
        received_items := received_items || jsonb_build_object(
          'reward_type', 'gems', 'quantity', drop_qty, 'source', 'guaranteed',
          'name', drop_qty || ' Gems', 'rarity', 'rare', 'item_type', 'gems', 'image_url', ''
        );
      ELSIF reward_type = 'shop_item' THEN
        selected_item_id := (guaranteed_entry->>'shop_item_id')::uuid;
        SELECT * INTO shop_item_record FROM shop_items WHERE id = selected_item_id;
        IF shop_item_record IS NOT NULL THEN
          INSERT INTO user_purchases (user_id, item_id)
          VALUES (p_user_id, selected_item_id)
          ON CONFLICT (user_id, item_id) DO NOTHING;
          received_items := received_items || jsonb_build_object(
            'reward_type', 'shop_item', 'shop_item_id', selected_item_id, 'quantity', 1, 'source', 'guaranteed',
            'name', shop_item_record.name, 'rarity', 'legendary', 'item_type', 'shop_item',
            'image_url', COALESCE(shop_item_record.image_url, '')
          );
        END IF;
      ELSE
        -- Default: inventory item
        selected_item_id := (guaranteed_entry->>'item_id')::uuid;
        INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
        VALUES (p_user_id, (SELECT full_name FROM users WHERE id = p_user_id), selected_item_id, (SELECT name FROM collectible_items WHERE id = selected_item_id), drop_qty)
        ON CONFLICT (user_id, item_id)
        DO UPDATE SET quantity = user_inventory.quantity + drop_qty, updated_at = now();
        received_items := received_items || jsonb_build_object('item_id', selected_item_id, 'quantity', drop_qty, 'source', 'guaranteed', 'reward_type', 'item');
      END IF;
    END LOOP;
  END IF;

  -- Process random loot draws
  IF user_chest_record.loot_table IS NOT NULL AND jsonb_array_length(user_chest_record.loot_table) > 0 THEN
    total_weight := 0;
    FOR loot_entry IN SELECT * FROM jsonb_array_elements(user_chest_record.loot_table)
    LOOP
      total_weight := total_weight + COALESCE((loot_entry->>'weight')::integer, 1);
    END LOOP;

    FOR i IN 1..user_chest_record.items_per_open
    LOOP
      roll := random() * total_weight;
      cumulative_weight := 0;

      FOR loot_entry IN SELECT * FROM jsonb_array_elements(user_chest_record.loot_table)
      LOOP
        cumulative_weight := cumulative_weight + COALESCE((loot_entry->>'weight')::integer, 1);
        IF roll <= cumulative_weight THEN
          reward_type := COALESCE(loot_entry->>'reward_type', 'item');
          drop_qty := COALESCE((loot_entry->>'min_qty')::integer, 1);
          IF (loot_entry->>'max_qty') IS NOT NULL THEN
            drop_qty := drop_qty + floor(random() * ((loot_entry->>'max_qty')::integer - drop_qty + 1))::integer;
          END IF;

          IF reward_type = 'xp' THEN
            UPDATE users SET xp = xp + drop_qty WHERE id = p_user_id;
            received_items := received_items || jsonb_build_object(
              'reward_type', 'xp', 'quantity', drop_qty, 'source', 'random',
              'name', drop_qty || ' XP', 'rarity', 'epic', 'item_type', 'xp', 'image_url', ''
            );
          ELSIF reward_type = 'gems' THEN
            UPDATE users SET gems = gems + drop_qty WHERE id = p_user_id;
            received_items := received_items || jsonb_build_object(
              'reward_type', 'gems', 'quantity', drop_qty, 'source', 'random',
              'name', drop_qty || ' Gems', 'rarity', 'rare', 'item_type', 'gems', 'image_url', ''
            );
          ELSIF reward_type = 'shop_item' THEN
            selected_item_id := (loot_entry->>'shop_item_id')::uuid;
            SELECT * INTO shop_item_record FROM shop_items WHERE id = selected_item_id;
            IF shop_item_record IS NOT NULL THEN
              INSERT INTO user_purchases (user_id, item_id)
              VALUES (p_user_id, selected_item_id)
              ON CONFLICT (user_id, item_id) DO NOTHING;
              received_items := received_items || jsonb_build_object(
                'reward_type', 'shop_item', 'shop_item_id', selected_item_id, 'quantity', 1, 'source', 'random',
                'name', shop_item_record.name, 'rarity', 'legendary', 'item_type', 'shop_item',
                'image_url', COALESCE(shop_item_record.image_url, '')
              );
            END IF;
          ELSE
            selected_item_id := (loot_entry->>'item_id')::uuid;
            INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
            VALUES (p_user_id, (SELECT full_name FROM users WHERE id = p_user_id), selected_item_id, (SELECT name FROM collectible_items WHERE id = selected_item_id), drop_qty)
            ON CONFLICT (user_id, item_id)
            DO UPDATE SET quantity = user_inventory.quantity + drop_qty, updated_at = now();
            received_items := received_items || jsonb_build_object('item_id', selected_item_id, 'quantity', drop_qty, 'source', 'random', 'reward_type', 'item');
          END IF;

          EXIT;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- Mark chest as opened
  UPDATE user_chests
  SET opened_at = now(), items_received = received_items
  WHERE id = p_user_chest_id;

  -- Return received items with details
  RETURN json_build_object(
    'success', true,
    'chest_name', user_chest_record.chest_name,
    'items', (
      SELECT json_agg(
        CASE
          WHEN ri->>'reward_type' IN ('xp', 'gems', 'shop_item') THEN
            json_build_object(
              'item_id', COALESCE(ri->>'item_id', ri->>'shop_item_id'),
              'quantity', (ri->>'quantity')::integer,
              'source', ri->>'source',
              'name', ri->>'name',
              'image_url', ri->>'image_url',
              'rarity', ri->>'rarity',
              'item_type', ri->>'item_type',
              'reward_type', ri->>'reward_type'
            )
          ELSE
            json_build_object(
              'item_id', ri->>'item_id',
              'quantity', (ri->>'quantity')::integer,
              'source', ri->>'source',
              'name', ci.name,
              'image_url', ci.image_url,
              'rarity', ci.rarity,
              'item_type', ci.item_type,
              'reward_type', 'item'
            )
        END
      )
      FROM jsonb_array_elements(received_items) ri
      LEFT JOIN collectible_items ci ON ci.id = (ri->>'item_id')::uuid
        AND COALESCE(ri->>'reward_type', 'item') = 'item'
    )
  );
END;
$$;


--
-- Name: open_egg(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_egg(p_user_id uuid, p_egg_item_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  egg_record record;
  rolled_pet record;
  egg_price_gems integer;
  egg_price_xp integer;
  egg_rarity text;
  new_user_pet_id uuid;
  unowned_count integer;
  refund_type text;
  refund_amount integer;
BEGIN
  -- Get egg from user's inventory
  SELECT ui.*, ci.name as egg_name, ci.rarity, ci.price_gems, ci.price_xp
  INTO egg_record
  FROM user_inventory ui
  JOIN collectible_items ci ON ci.id = ui.item_id
  WHERE ui.user_id = p_user_id 
    AND ui.item_id = p_egg_item_id 
    AND ui.quantity > 0
    AND ci.item_type = 'egg';

  IF egg_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No egg found in inventory');
  END IF;

  egg_price_gems := COALESCE(egg_record.price_gems, 0);
  egg_price_xp := COALESCE(egg_record.price_xp, 0);
  egg_rarity := egg_record.rarity;

  -- Determine refund type: prefer gems, fallback to xp
  IF egg_price_gems > 0 THEN
    refund_type := 'gems';
    refund_amount := egg_price_gems;
  ELSIF egg_price_xp > 0 THEN
    refund_type := 'xp';
    refund_amount := egg_price_xp;
  ELSE
    refund_type := 'gems';
    refund_amount := 0;
  END IF;

  -- Count unowned pets of this rarity
  SELECT COUNT(*) INTO unowned_count
  FROM pets p
  WHERE p.rarity = egg_rarity 
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM user_pets up 
      WHERE up.user_id = p_user_id AND up.pet_id = p.id
    );

  -- Try to get a pet the user doesn't own yet
  IF unowned_count > 0 THEN
    SELECT * INTO rolled_pet
    FROM pets p
    WHERE p.rarity = egg_rarity 
      AND p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM user_pets up 
        WHERE up.user_id = p_user_id AND up.pet_id = p.id
      )
    ORDER BY random()
    LIMIT 1;
  ELSE
    SELECT * INTO rolled_pet
    FROM pets p
    WHERE p.rarity = egg_rarity AND p.is_active = true
    ORDER BY random()
    LIMIT 1;
  END IF;

  IF rolled_pet IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No pets available for this egg rarity');
  END IF;

  -- Consume the egg
  UPDATE user_inventory 
  SET quantity = quantity - 1, updated_at = now()
  WHERE user_id = p_user_id AND item_id = p_egg_item_id;

  DELETE FROM user_inventory 
  WHERE user_id = p_user_id AND item_id = p_egg_item_id AND quantity <= 0;

  -- If user owns all pets of this rarity, give duplicate refund
  IF unowned_count = 0 THEN
    -- Refund in the appropriate currency
    IF refund_type = 'gems' AND refund_amount > 0 THEN
      UPDATE users SET gems = gems + refund_amount WHERE id = p_user_id;
    ELSIF refund_type = 'xp' AND refund_amount > 0 THEN
      UPDATE users SET xp = xp + refund_amount WHERE id = p_user_id;
    END IF;

    RETURN json_build_object(
      'success', true,
      'result_type', 'duplicate_gems',
      'gems_awarded', CASE WHEN refund_type = 'gems' THEN refund_amount ELSE 0 END,
      'xp_awarded', CASE WHEN refund_type = 'xp' THEN refund_amount ELSE 0 END,
      'refund_type', refund_type,
      'pet', json_build_object(
        'id', rolled_pet.id,
        'name', rolled_pet.name,
        'rarity', rolled_pet.rarity,
        'image_url', rolled_pet.image_url,
        'description', rolled_pet.description
      ),
      'message', 'You already own all ' || egg_rarity || ' pets! Refunded ' || refund_amount || ' ' || refund_type || '.'
    );
  END IF;

  -- NEW PET: Add to user_pets
  INSERT INTO user_pets (user_id, pet_id, nickname, happiness, energy, is_active, obtained_at)
  VALUES (p_user_id, rolled_pet.id, NULL, 100, 100, false, now())
  RETURNING id INTO new_user_pet_id;

  -- If user has no active pet, set this one as active
  IF NOT EXISTS (SELECT 1 FROM user_pets WHERE user_id = p_user_id AND is_active = true AND id != new_user_pet_id) THEN
    UPDATE user_pets SET is_active = true WHERE id = new_user_pet_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'result_type', 'new_pet',
    'user_pet_id', new_user_pet_id,
    'pet', json_build_object(
      'id', rolled_pet.id,
      'name', rolled_pet.name,
      'rarity', rolled_pet.rarity,
      'image_url', rolled_pet.image_url,
      'description', rolled_pet.description
    ),
    'message', 'Congratulations! You got ' || rolled_pet.name || '!'
  );
END;
$$;


--
-- Name: play_with_pet(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.play_with_pet(p_user_id uuid, p_user_pet_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$DECLARE
  v_user_pet record;
  v_pet record;
  v_xp_gained integer;
  v_new_xp integer;
  v_new_level integer;
  v_new_happiness integer;
  v_evolved boolean := false;
  v_new_stage integer;
  v_cooldown_seconds integer := 10;
  v_seconds_since_play integer;
  v_user_energy integer;
BEGIN
  SELECT * INTO v_user_pet FROM user_pets WHERE id = p_user_pet_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pet not found');
  END IF;
  
  -- Check cooldown
  IF v_user_pet.last_played_at IS NOT NULL THEN
    v_seconds_since_play := EXTRACT(EPOCH FROM (now() - v_user_pet.last_played_at))::integer;
    IF v_seconds_since_play < v_cooldown_seconds THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Pet is tired', 
        'cooldown_remaining', v_cooldown_seconds - v_seconds_since_play
      );
    END IF;
  END IF;
  
  -- Get user energy from users table
  SELECT COALESCE(energy, 100) INTO v_user_energy FROM users WHERE id = p_user_id;
  
  SELECT * INTO v_pet FROM pets WHERE id = v_user_pet.pet_id;
  
  -- Random XP between 10-15
  v_xp_gained := 10 + floor(random() * 6)::integer;
  v_new_xp := COALESCE(v_user_pet.xp, 0) + v_xp_gained;
  
  -- Cap XP at next evolution threshold
IF v_pet.evolution_stages IS NOT NULL THEN
  FOR i IN 0..jsonb_array_length(v_pet.evolution_stages) - 1 LOOP
    IF (v_pet.evolution_stages->i->>'stage')::integer = COALESCE(v_user_pet.evolution_stage, 0) + 1 THEN
      v_new_xp := LEAST(v_new_xp, (v_pet.evolution_stages->i->>'xp_required')::integer);
    END IF;
  END LOOP;
END IF;

-- Level from XP: 100/level for 1-10, then 100+(level-10)*20
v_new_level := 1;
v_seconds_since_play := v_new_xp;  -- reuse as temp remaining XP
LOOP
  IF v_new_level <= 10 THEN
    EXIT WHEN v_seconds_since_play < 100;
    v_seconds_since_play := v_seconds_since_play - 100;
  ELSE
    EXIT WHEN v_seconds_since_play < 100 + (v_new_level - 10) * 20;
    v_seconds_since_play := v_seconds_since_play - (100 + (v_new_level - 10) * 20);
  END IF;
  v_new_level := v_new_level + 1;
END LOOP;


  v_new_happiness := LEAST(100, COALESCE(v_user_pet.happiness, 50) + 5);
  
  v_new_stage := COALESCE(v_user_pet.evolution_stage, 0);

  
  -- Update pet (no energy change here)
  UPDATE user_pets SET
    xp = v_new_xp,
    level = v_new_level,
    happiness = v_new_happiness,
    evolution_stage = v_new_stage,
    last_played_at = now()
  WHERE id = p_user_pet_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'xp_gained', v_xp_gained,
    'xp', v_new_xp,
    'level', v_new_level,
    'happiness', v_new_happiness,
    'energy', v_user_energy,
    'level_up', v_new_level > COALESCE(v_user_pet.level, 1),
    'evolution', jsonb_build_object('evolved', v_evolved, 'new_stage', v_new_stage)
  );
END;$$;


--
-- Name: populate_user_progress_tracking_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.populate_user_progress_tracking_fields() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Populate full_name from users table
  IF NEW.full_name IS NULL THEN
    SELECT full_name INTO NEW.full_name
    FROM public.users
    WHERE id = NEW.user_id;
  END IF;

  -- Populate exercise_title from exercises table
  IF NEW.exercise_title IS NULL THEN
    SELECT title INTO NEW.exercise_title
    FROM public.exercises
    WHERE id = NEW.exercise_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: record_challenge_participation(uuid, uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_challenge_participation(p_challenge_id uuid, p_user_id uuid, p_score integer, p_time_spent integer) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
  challenge_record record;
  existing_participation record;
  participation_id uuid;
  user_rank integer;
  base_xp integer;
  base_gems integer;
  attempts_used integer;
BEGIN
  -- Validate score minimum
  IF p_score < 75 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Minimum score of 75% required'
    );
  END IF;

  -- Get challenge details
  SELECT * INTO challenge_record
  FROM daily_challenges
  WHERE id = p_challenge_id AND is_active = true;

  IF challenge_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Challenge not found');
  END IF;

  -- Check user role
  IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND role IN ('teacher', 'admin')) THEN
    RETURN json_build_object('success', false, 'error', 'Only students can participate');
  END IF;

  -- Check existing participation
  SELECT * INTO existing_participation
  FROM daily_challenge_participations
  WHERE challenge_id = p_challenge_id AND user_id = p_user_id;

  -- Enforce 3 attempt limit
  IF existing_participation IS NOT NULL AND existing_participation.attempts >= 3 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Maximum 3 attempts reached',
      'attempts_used', existing_participation.attempts
    );
  END IF;

  attempts_used := COALESCE(existing_participation.attempts, 0) + 1;

  -- Insert or update participation
  INSERT INTO daily_challenge_participations (
    challenge_id, user_id, score, time_spent, attempts, completed_at
  ) VALUES (
    p_challenge_id, p_user_id, p_score, p_time_spent, attempts_used, NOW()
  )
  ON CONFLICT (challenge_id, user_id)
  DO UPDATE SET
    score = GREATEST(daily_challenge_participations.score, p_score),
    time_spent = CASE
      WHEN EXCLUDED.score > daily_challenge_participations.score THEN EXCLUDED.time_spent
      WHEN EXCLUDED.score = daily_challenge_participations.score THEN
        LEAST(daily_challenge_participations.time_spent, EXCLUDED.time_spent)
      ELSE daily_challenge_participations.time_spent
    END,
    attempts = attempts_used,
    completed_at = NOW()
  RETURNING id INTO participation_id;

  -- Calculate rank (only count scores >= 75%)
  SELECT COUNT(*) + 1 INTO user_rank
  FROM daily_challenge_participations
  WHERE challenge_id = p_challenge_id
    AND score >= 75
    AND (score > p_score OR (score = p_score AND time_spent < p_time_spent));

  -- Update cached rank
  UPDATE daily_challenge_participations
  SET rank_calculated = user_rank
  WHERE id = participation_id;

  -- Award base rewards (only on first participation)
  IF attempts_used = 1 THEN
    UPDATE users
    SET xp = xp + challenge_record.base_xp_reward,
        gems = gems + challenge_record.base_gem_reward
    WHERE id = p_user_id;

    UPDATE daily_challenge_participations
    SET base_reward_claimed = true
    WHERE id = participation_id;

    base_xp := challenge_record.base_xp_reward;
    base_gems := challenge_record.base_gem_reward;
  ELSE
    base_xp := 0;
    base_gems := 0;
  END IF;

  RETURN json_build_object(
    'success', true,
    'rank', user_rank,
    'score', p_score,
    'xp_awarded', base_xp,
    'gems_awarded', base_gems,
    'attempts_used', attempts_used,
    'attempts_remaining', 3 - attempts_used
  );
END;
$$;


--
-- Name: record_challenge_participation(uuid, uuid, integer, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_challenge_participation(p_challenge_id uuid, p_user_id uuid, p_score integer, p_time_spent integer, p_started_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  challenge_record record;
  existing_participation record;
  participation_id uuid;
  user_rank integer;
  base_xp integer;
  base_gems integer;
  attempts_used integer;
  new_attempt_id uuid;
  is_passing boolean;
  best_score integer;
  best_time integer;
BEGIN
  is_passing := p_score >= 75;

  SELECT * INTO challenge_record
  FROM daily_challenges
  WHERE id = p_challenge_id AND is_active = true;

  IF challenge_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Challenge not found');
  END IF;

  IF challenge_record.is_locked = true THEN
    RETURN json_build_object('success', false, 'error', 'Challenge is locked. Winners have been awarded.');
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND role IN ('teacher', 'admin')) THEN
    RETURN json_build_object('success', false, 'error', 'Only students can participate');
  END IF;

  SELECT * INTO existing_participation
  FROM daily_challenge_participations
  WHERE challenge_id = p_challenge_id AND user_id = p_user_id;

  IF existing_participation IS NOT NULL AND existing_participation.attempts >= 3 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Maximum 3 attempts reached',
      'attempts_used', existing_participation.attempts
    );
  END IF;

  attempts_used := COALESCE(existing_participation.attempts, 0) + 1;

  INSERT INTO daily_challenge_participations (
    challenge_id, user_id, score, time_spent, attempts, completed_at
  ) VALUES (
    p_challenge_id, p_user_id, p_score, p_time_spent, attempts_used, NOW()
  )
  ON CONFLICT (challenge_id, user_id)
  DO UPDATE SET
    score = CASE
      WHEN EXCLUDED.score >= 75 THEN GREATEST(daily_challenge_participations.score, EXCLUDED.score)
      ELSE daily_challenge_participations.score
    END,
    time_spent = CASE
      WHEN EXCLUDED.score >= 75 AND EXCLUDED.score > daily_challenge_participations.score THEN EXCLUDED.time_spent
      WHEN EXCLUDED.score >= 75 AND EXCLUDED.score = daily_challenge_participations.score THEN
        LEAST(daily_challenge_participations.time_spent, EXCLUDED.time_spent)
      ELSE daily_challenge_participations.time_spent
    END,
    attempts = attempts_used,
    completed_at = NOW()
  RETURNING id INTO participation_id;

  -- Calculate rank using the participation's best score (not current attempt score)
  -- and exclude the user's own row so they don't rank against themselves
  SELECT dcp.score, dcp.time_spent INTO best_score, best_time
  FROM daily_challenge_participations dcp
  WHERE dcp.id = participation_id;

  IF best_score >= 75 THEN
    SELECT COUNT(*) + 1 INTO user_rank
    FROM daily_challenge_participations
    WHERE challenge_id = p_challenge_id
      AND user_id != p_user_id
      AND score >= 75
      AND (score > best_score OR (score = best_score AND time_spent < best_time));

    UPDATE daily_challenge_participations
    SET rank_calculated = user_rank
    WHERE id = participation_id;
  ELSE
    user_rank := NULL;
  END IF;

  INSERT INTO daily_challenge_attempts (
    participation_id, challenge_id, user_id, attempt_number,
    score, started_at, completed_at, time_spent
  ) VALUES (
    participation_id, p_challenge_id, p_user_id, attempts_used,
    p_score,
    COALESCE(p_started_at, NOW() - (p_time_spent || ' seconds')::interval),
    NOW(), p_time_spent
  ) RETURNING id INTO new_attempt_id;

  IF is_passing AND (
     existing_participation IS NULL OR
     p_score > existing_participation.score OR
     (p_score = existing_participation.score AND p_time_spent < existing_participation.time_spent)
  ) THEN
    UPDATE daily_challenge_participations
    SET best_attempt_id = new_attempt_id
    WHERE id = participation_id;
  END IF;

  IF attempts_used = 1 THEN
    UPDATE daily_challenge_participations
    SET first_attempt_at = COALESCE(p_started_at, NOW() - (p_time_spent || ' seconds')::interval)
    WHERE id = participation_id;
  END IF;

  IF is_passing AND attempts_used = 1 THEN
    UPDATE users
    SET xp = xp + challenge_record.base_xp_reward,
        gems = gems + challenge_record.base_gem_reward
    WHERE id = p_user_id;

    UPDATE daily_challenge_participations
    SET base_reward_claimed = true
    WHERE id = participation_id;

    base_xp := challenge_record.base_xp_reward;
    base_gems := challenge_record.base_gem_reward;
  ELSIF is_passing AND existing_participation IS NOT NULL AND existing_participation.score < 75 THEN
    UPDATE users
    SET xp = xp + challenge_record.base_xp_reward,
        gems = gems + challenge_record.base_gem_reward
    WHERE id = p_user_id;

    UPDATE daily_challenge_participations
    SET base_reward_claimed = true
    WHERE id = participation_id;

    base_xp := challenge_record.base_xp_reward;
    base_gems := challenge_record.base_gem_reward;
  ELSE
    base_xp := 0;
    base_gems := 0;
  END IF;

  RETURN json_build_object(
    'success', true,
    'is_passing', is_passing,
    'rank', user_rank,
    'score', p_score,
    'xp_awarded', base_xp,
    'gems_awarded', base_gems,
    'attempts_used', attempts_used,
    'attempts_remaining', 3 - attempts_used,
    'attempt_id', new_attempt_id
  );
END;
$$;


--
-- Name: redeem_giftcode(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_giftcode(p_user_id uuid, p_code text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_giftcode record;
  v_reward_item jsonb;
  v_total_xp integer := 0;
  v_total_gems integer := 0;
BEGIN
  SELECT * INTO v_giftcode
  FROM giftcodes
  WHERE UPPER(code) = UPPER(p_code) AND is_active = true;

  IF v_giftcode IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mã không hợp lệ hoặc đã hết hạn');
  END IF;

  IF v_giftcode.expires_at IS NOT NULL AND v_giftcode.expires_at < NOW() THEN
    RETURN json_build_object('success', false, 'error', 'Mã đã hết hạn');
  END IF;

  IF v_giftcode.is_single_use AND v_giftcode.current_redemptions >= 1 THEN
    RETURN json_build_object('success', false, 'error', 'Mã đã được sử dụng');
  END IF;

  IF v_giftcode.max_redemptions IS NOT NULL AND v_giftcode.current_redemptions >= v_giftcode.max_redemptions THEN
    RETURN json_build_object('success', false, 'error', 'Mã đã hết lượt sử dụng');
  END IF;

  IF EXISTS (SELECT 1 FROM giftcode_redemptions WHERE giftcode_id = v_giftcode.id AND user_id = p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Bạn đã sử dụng mã này rồi');
  END IF;

  -- Award XP and gems
  v_total_xp := COALESCE((v_giftcode.rewards->>'xp')::integer, 0);
  v_total_gems := COALESCE((v_giftcode.rewards->>'gems')::integer, 0);

  IF v_total_xp > 0 OR v_total_gems > 0 THEN
    UPDATE users SET xp = xp + v_total_xp, gems = gems + v_total_gems WHERE id = p_user_id;
  END IF;

  -- Award items
  IF v_giftcode.rewards->'items' IS NOT NULL THEN
    FOR v_reward_item IN SELECT * FROM jsonb_array_elements(v_giftcode.rewards->'items')
    LOOP
      INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
      VALUES (
        p_user_id,
        (SELECT full_name FROM users WHERE id = p_user_id),
        (v_reward_item->>'item_id')::uuid,
        (SELECT name FROM collectible_items WHERE id = (v_reward_item->>'item_id')::uuid),
        COALESCE((v_reward_item->>'quantity')::integer, 1)
      )
      ON CONFLICT (user_id, item_id)
      DO UPDATE SET quantity = user_inventory.quantity + COALESCE((v_reward_item->>'quantity')::integer, 1), updated_at = now();
    END LOOP;
  END IF;

  -- Award chests
  IF v_giftcode.rewards->'chests' IS NOT NULL THEN
    FOR v_reward_item IN SELECT * FROM jsonb_array_elements(v_giftcode.rewards->'chests')
    LOOP
      INSERT INTO user_chests (user_id, chest_id, source, source_ref)
      VALUES (p_user_id, (v_reward_item->>'chest_id')::uuid, 'giftcode', v_giftcode.code);
    END LOOP;
  END IF;

  -- Award pets
  IF v_giftcode.rewards->'pets' IS NOT NULL THEN
    FOR v_reward_item IN SELECT * FROM jsonb_array_elements(v_giftcode.rewards->'pets')
    LOOP
      INSERT INTO user_pets (user_id, pet_id)
      VALUES (p_user_id, (v_reward_item->>'pet_id')::uuid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Award cosmetics (shop items)
  IF v_giftcode.rewards->'cosmetics' IS NOT NULL THEN
    FOR v_reward_item IN SELECT * FROM jsonb_array_elements(v_giftcode.rewards->'cosmetics')
    LOOP
      INSERT INTO user_purchases (user_id, item_id)
      VALUES (p_user_id, (v_reward_item->>'shop_item_id')::uuid)
      ON CONFLICT (user_id, item_id) DO NOTHING;
    END LOOP;
  END IF;

  -- Record redemption
  INSERT INTO giftcode_redemptions (giftcode_id, user_id, rewards_granted)
  VALUES (v_giftcode.id, p_user_id, v_giftcode.rewards);

  UPDATE giftcodes SET current_redemptions = current_redemptions + 1, updated_at = now() WHERE id = v_giftcode.id;

  IF v_giftcode.is_single_use THEN
    UPDATE giftcodes SET is_active = false, updated_at = now() WHERE id = v_giftcode.id;
  END IF;

  -- Create notification
  INSERT INTO notifications (user_id, type, title, message, icon, data)
  VALUES (
    p_user_id,
    'giftcode_redeemed',
    'Nhập mã thành công!',
    'Bạn đã nhận phần thưởng từ mã ' || v_giftcode.code,
    'Gift',
    json_build_object('code', v_giftcode.code, 'rewards', v_giftcode.rewards)::jsonb
  );

  RETURN json_build_object(
    'success', true,
    'rewards', v_giftcode.rewards,
    'code', v_giftcode.code,
    'description', v_giftcode.description
  );
END;
$$;


--
-- Name: regenerate_pet_energy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.regenerate_pet_energy() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE users
  SET energy = 100, energy_last_reset = CURRENT_DATE
  WHERE energy_last_reset IS NULL OR energy_last_reset < CURRENT_DATE;
END;
$$;


--
-- Name: roll_exercise_drop(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.roll_exercise_drop(p_user_id uuid, p_exercise_id uuid, p_score integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  config_record record;
  base_chance float;
  rarity_weights jsonb;
  total_weight integer;
  roll float;
  rarity_roll float;
  selected_rarity text;
  cumulative_weight integer;
  rarity_key text;
  rarity_value integer;
  selected_item record;
  included_items jsonb;
  has_include_filter boolean;
BEGIN
  -- No drop if score below 75%
  IF p_score < 75 THEN
    RETURN json_build_object('dropped', false);
  END IF;

  -- Get drop config
  SELECT config_value INTO config_record
  FROM drop_config
  WHERE config_key = 'exercise_drop_rate';

  IF config_record IS NULL THEN
    RETURN json_build_object('dropped', false);
  END IF;

  base_chance := (config_record.config_value->>'base_chance')::float;
  rarity_weights := config_record.config_value->'rarity_weights';
  included_items := COALESCE(config_record.config_value->'included_items', '[]'::jsonb);
  has_include_filter := jsonb_array_length(included_items) > 0;

  -- Roll for drop
  roll := random();
  IF roll > base_chance THEN
    RETURN json_build_object('dropped', false);
  END IF;

  -- Calculate total weight
  total_weight := 0;
  FOR rarity_key, rarity_value IN SELECT * FROM jsonb_each_text(rarity_weights)
  LOOP
    total_weight := total_weight + rarity_value::integer;
  END LOOP;

  -- Roll for rarity
  rarity_roll := random() * total_weight;
  cumulative_weight := 0;
  selected_rarity := 'common';

  FOR rarity_key, rarity_value IN SELECT * FROM jsonb_each_text(rarity_weights)
  LOOP
    cumulative_weight := cumulative_weight + rarity_value::integer;
    IF rarity_roll <= cumulative_weight THEN
      selected_rarity := rarity_key;
      EXIT;
    END IF;
  END LOOP;

  -- Pick a random active item of that rarity (filtered by included_items if set)
  SELECT * INTO selected_item
  FROM collectible_items
  WHERE is_active = true AND rarity = selected_rarity
    AND (NOT has_include_filter OR (included_items ? id::text))
  ORDER BY random()
  LIMIT 1;

  IF selected_item IS NULL THEN
    -- Fallback to any active item (filtered by included_items if set)
    SELECT * INTO selected_item
    FROM collectible_items
    WHERE is_active = true
      AND (NOT has_include_filter OR (included_items ? id::text))
    ORDER BY random()
    LIMIT 1;
  END IF;

  IF selected_item IS NULL THEN
    RETURN json_build_object('dropped', false);
  END IF;

  -- Add to user inventory
  INSERT INTO user_inventory (user_id, item_id, quantity)
  VALUES (p_user_id, selected_item.id, 1)
  ON CONFLICT (user_id, item_id)
  DO UPDATE SET quantity = user_inventory.quantity + 1, updated_at = now();

  RETURN json_build_object(
    'dropped', true,
    'item', json_build_object(
      'id', selected_item.id,
      'name', selected_item.name,
      'description', selected_item.description,
      'rarity', selected_item.rarity,
      'image_url', selected_item.image_url,
      'item_type', selected_item.item_type
    )
  );
END;
$$;


--
-- Name: roll_pet_encounter(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.roll_pet_encounter(p_user_id uuid, p_score integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  config_val jsonb;
  base_chance float;
  rarity_weights jsonb;
  total_weight integer;
  roll float;
  rarity_roll float;
  selected_rarity text;
  cumulative_weight integer;
  rarity_key text;
  rarity_value integer;
  selected_pet record;
BEGIN
  -- No encounter if score below 75%
  IF p_score < 75 THEN
    RETURN json_build_object('encountered', false);
  END IF;

  SELECT config_value INTO config_val
  FROM drop_config WHERE config_key = 'pet_encounter';

  IF config_val IS NULL THEN
    RETURN json_build_object('encountered', false);
  END IF;

  base_chance := (config_val->>'base_chance')::float;
  rarity_weights := config_val->'rarity_weights';

  -- Roll for encounter
  roll := random();
  IF roll > base_chance THEN
    RETURN json_build_object('encountered', false);
  END IF;

  -- Calculate total weight
  total_weight := 0;
  FOR rarity_key, rarity_value IN SELECT * FROM jsonb_each_text(rarity_weights)
  LOOP
    total_weight := total_weight + rarity_value::integer;
  END LOOP;

  -- Roll for rarity
  rarity_roll := random() * total_weight;
  cumulative_weight := 0;
  selected_rarity := 'common';

  FOR rarity_key, rarity_value IN SELECT * FROM jsonb_each_text(rarity_weights)
  LOOP
    cumulative_weight := cumulative_weight + rarity_value::integer;
    IF rarity_roll <= cumulative_weight THEN
      selected_rarity := rarity_key;
      EXIT;
    END IF;
  END LOOP;

  -- Pick random active pet of that rarity (prefer unowned)
  SELECT * INTO selected_pet
  FROM pets
  WHERE is_active = true AND rarity = selected_rarity
    AND id NOT IN (SELECT pet_id FROM user_pets WHERE user_id = p_user_id)
  ORDER BY random() LIMIT 1;

  -- If all of that rarity owned, allow any pet of that rarity
  IF selected_pet IS NULL THEN
    SELECT * INTO selected_pet
    FROM pets
    WHERE is_active = true AND rarity = selected_rarity
    ORDER BY random() LIMIT 1;
  END IF;

  IF selected_pet IS NULL THEN
    RETURN json_build_object('encountered', false);
  END IF;

  RETURN json_build_object(
    'encountered', true,
    'pet', json_build_object(
      'id', selected_pet.id,
      'name', selected_pet.name,
      'image_url', selected_pet.image_url,
      'rarity', selected_pet.rarity,
      'description', selected_pet.description
    )
  );
END;
$$;


--
-- Name: roll_wild_area_encounter(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.roll_wild_area_encounter(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  config_val jsonb;
  cooldown_minutes integer;
  last_encounter timestamptz;
  user_role text;
  ticket_item_id uuid;
  ticket_qty integer;
  rarity_weights jsonb;
  total_weight integer;
  rarity_roll float;
  selected_rarity text;
  cumulative_weight integer;
  rarity_key text;
  rarity_value integer;
  selected_pet record;
  v_daily_limit integer;
  v_today_count integer;
  v_today_start timestamptz;
BEGIN
  SELECT config_value INTO config_val
  FROM drop_config WHERE config_key = 'pet_encounter';

  IF config_val IS NULL OR NOT COALESCE((config_val->>'wild_area_enabled')::boolean, false) THEN
    RETURN json_build_object('encountered', false, 'error', 'Wild area disabled');
  END IF;

  -- Check user role for admin bypass
  SELECT role INTO user_role FROM users WHERE id = p_user_id;

  cooldown_minutes := COALESCE((config_val->>'wild_area_cooldown_minutes')::integer, 30);

  -- Check cooldown (skip for admins)
  IF user_role IS DISTINCT FROM 'admin' THEN
    SELECT wild_area_last_encounter INTO last_encounter FROM users WHERE id = p_user_id;

    IF last_encounter IS NOT NULL AND
       last_encounter > now() - (cooldown_minutes * interval '1 minute') THEN
      RETURN json_build_object(
        'encountered', false,
        'cooldown_remaining', EXTRACT(EPOCH FROM (last_encounter + (cooldown_minutes * interval '1 minute') - now()))::integer
      );
    END IF;

    -- Check daily limit from site_settings
    SELECT (setting_value)::integer INTO v_daily_limit
    FROM site_settings
    WHERE setting_key = 'maze_daily_limit';

    v_daily_limit := COALESCE(v_daily_limit, 0);

    IF v_daily_limit > 0 THEN
      -- Calculate start of today in Vietnam timezone
      v_today_start := date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';

      SELECT COUNT(*) INTO v_today_count
      FROM wild_area_logs
      WHERE user_id = p_user_id
        AND action = 'encounter'
        AND created_at >= v_today_start;

      IF v_today_count >= v_daily_limit THEN
        RETURN json_build_object(
          'encountered', false,
          'error', 'daily_limit',
          'daily_limit', v_daily_limit,
          'today_count', v_today_count
        );
      END IF;
    END IF;

    -- Consume adventure ticket (non-admins only)
    SELECT ci.id INTO ticket_item_id
    FROM collectible_items ci
    WHERE ci.item_type = 'ticket' AND ci.name = 'Adventure Ticket' AND ci.is_active = true
    LIMIT 1;

    IF ticket_item_id IS NOT NULL THEN
      SELECT ui.quantity INTO ticket_qty
      FROM user_inventory ui
      WHERE ui.user_id = p_user_id AND ui.item_id = ticket_item_id;

      IF ticket_qty IS NULL OR ticket_qty < 1 THEN
        RETURN json_build_object('encountered', false, 'error', 'no_ticket');
      END IF;

      UPDATE user_inventory
      SET quantity = quantity - 1, updated_at = now()
      WHERE user_id = p_user_id AND item_id = ticket_item_id;

      DELETE FROM user_inventory
      WHERE user_id = p_user_id AND item_id = ticket_item_id AND quantity <= 0;
    END IF;
  END IF;

  -- Update last encounter time
  UPDATE users SET wild_area_last_encounter = now() WHERE id = p_user_id;

  -- Roll rarity (always encounter in wild area, just roll which rarity)
  rarity_weights := config_val->'rarity_weights';

  total_weight := 0;
  FOR rarity_key, rarity_value IN SELECT * FROM jsonb_each_text(rarity_weights)
  LOOP
    total_weight := total_weight + rarity_value::integer;
  END LOOP;

  rarity_roll := random() * total_weight;
  cumulative_weight := 0;
  selected_rarity := 'common';

  FOR rarity_key, rarity_value IN SELECT * FROM jsonb_each_text(rarity_weights)
  LOOP
    cumulative_weight := cumulative_weight + rarity_value::integer;
    IF rarity_roll <= cumulative_weight THEN
      selected_rarity := rarity_key;
      EXIT;
    END IF;
  END LOOP;

  -- Pick random active pet (prefer unowned)
  SELECT * INTO selected_pet
  FROM pets
  WHERE is_active = true AND rarity = selected_rarity
    AND id NOT IN (SELECT pet_id FROM user_pets WHERE user_id = p_user_id)
  ORDER BY random() LIMIT 1;

  IF selected_pet IS NULL THEN
    SELECT * INTO selected_pet
    FROM pets
    WHERE is_active = true AND rarity = selected_rarity
    ORDER BY random() LIMIT 1;
  END IF;

  IF selected_pet IS NULL THEN
    RETURN json_build_object('encountered', false);
  END IF;

  -- Log the encounter
  INSERT INTO wild_area_logs (user_id, pet_id, pet_name, pet_rarity, action)
  VALUES (p_user_id, selected_pet.id, selected_pet.name, selected_pet.rarity, 'encounter');

  RETURN jsonb_build_object(
    'encountered', true,
    'pet', jsonb_build_object(
      'id', selected_pet.id,
      'name', selected_pet.name,
      'image_url', selected_pet.image_url,
      'rarity', selected_pet.rarity,
      'description', selected_pet.description
    )
  );
END;
$$;


--
-- Name: set_active_pet(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_active_pet(p_user_id uuid, p_user_pet_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM user_pets
    WHERE id = p_user_pet_id AND user_id = p_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Pet not found');
  END IF;

  -- Deactivate all user's pets
  UPDATE user_pets
  SET is_active = false, updated_at = now()
  WHERE user_id = p_user_id;

  -- Activate selected pet
  UPDATE user_pets
  SET is_active = true, updated_at = now()
  WHERE id = p_user_pet_id;

  -- Update user's active_pet_id
  UPDATE users
  SET active_pet_id = p_user_pet_id, updated_at = now()
  WHERE id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;


--
-- Name: spend_user_gems(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.spend_user_gems(p_user_id uuid, p_amount integer) RETURNS TABLE(success boolean, gems integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_gems integer;
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT false, COALESCE(u.gems, 0) FROM users u WHERE u.id = p_user_id;
    RETURN;
  END IF;

  UPDATE users u
     SET gems = u.gems - p_amount,
         updated_at = now()
   WHERE u.id = p_user_id
     AND COALESCE(u.gems, 0) >= p_amount
  RETURNING u.gems INTO v_new_gems;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_new_gems;
  ELSE
    -- Not enough gems: report the unchanged balance.
    RETURN QUERY SELECT false, COALESCE(u.gems, 0) FROM users u WHERE u.id = p_user_id;
  END IF;
END;
$$;


--
-- Name: spend_user_xp(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.spend_user_xp(p_user_id uuid, p_amount integer) RETURNS TABLE(success boolean, xp integer, level integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new_xp integer;
  v_new_level integer;
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT false, COALESCE(u.xp, 0), COALESCE(u.level, 1) FROM users u WHERE u.id = p_user_id;
    RETURN;
  END IF;

  UPDATE users u
     SET xp = u.xp - p_amount,
         level = FLOOR((u.xp - p_amount) / 1000) + 1,
         updated_at = now()
   WHERE u.id = p_user_id
     AND COALESCE(u.xp, 0) >= p_amount
  RETURNING u.xp, u.level INTO v_new_xp, v_new_level;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_new_xp, v_new_level;
  ELSE
    RETURN QUERY SELECT false, COALESCE(u.xp, 0), COALESCE(u.level, 1) FROM users u WHERE u.id = p_user_id;
  END IF;
END;
$$;


--
-- Name: track_weekly_xp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_weekly_xp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  week_start DATE;
  week_end DATE;
BEGIN
  -- Calculate the start of the current week (Monday)
  week_start := DATE_TRUNC('week', NEW.completed_at::DATE);
  week_end := week_start + INTERVAL '6 days';

  -- Insert or update weekly XP tracking
  INSERT INTO weekly_xp_tracking (user_id, week_start_date, week_end_date, total_xp)
  VALUES (NEW.user_id, week_start, week_end, NEW.xp_earned)
  ON CONFLICT (user_id, week_start_date)
  DO UPDATE SET
    total_xp = weekly_xp_tracking.total_xp + NEW.xp_earned;

  RETURN NEW;
END;
$$;


--
-- Name: update_individual_assignments_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_individual_assignments_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_mission_progress(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_mission_progress(p_user_id uuid, p_goal_type text, p_increment integer DEFAULT 1) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  today date;
  week_start date;
  updated_count integer := 0;
BEGIN
  today := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  week_start := today - (EXTRACT(ISODOW FROM today)::int - 1);

  -- Ensure user_missions rows exist (student may not have logged in yet)
  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', today
  FROM missions m WHERE m.is_active = true AND m.mission_type = 'daily'
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', week_start
  FROM missions m WHERE m.is_active = true AND m.mission_type = 'weekly'
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', COALESCE(m.start_date, today)
  FROM missions m
  WHERE m.is_active = true AND m.mission_type = 'special'
    AND (m.start_date IS NULL OR m.start_date <= today)
    AND (m.end_date IS NULL OR m.end_date >= today)
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  UPDATE user_missions um
  SET progress = LEAST(um.progress + p_increment, m.goal_value),
      status = CASE
        WHEN LEAST(um.progress + p_increment, m.goal_value) >= m.goal_value AND um.status = 'active'
        THEN 'completed' ELSE um.status END,
      updated_at = NOW()
  FROM missions m
  WHERE um.mission_id = m.id AND um.user_id = p_user_id AND um.status = 'active'
    AND m.goal_type = p_goal_type AND m.is_active = true
    AND (
      (m.mission_type = 'daily' AND um.period_start = today)
      OR (m.mission_type = 'weekly' AND um.period_start = week_start)
      OR (m.mission_type = 'special' AND um.period_start = COALESCE(m.start_date, today)
          AND (m.end_date IS NULL OR m.end_date >= today))
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN json_build_object('success', true, 'updated_count', updated_count);
END;
$$;


--
-- Name: update_pet_on_activity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_pet_on_activity(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql
    AS $$
DECLARE
  pet_record record;
  happiness_gain integer := 5;
  xp_gain integer := 3;
  new_happiness integer;
  new_xp integer;
  evolution_result json;
BEGIN
  SELECT * INTO pet_record
  FROM user_pets
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;

  IF pet_record IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'No active pet');
  END IF;

  new_happiness := LEAST(100, pet_record.happiness + happiness_gain);
  new_xp := pet_record.xp + xp_gain;

  UPDATE user_pets
  SET
    happiness = new_happiness,
    xp = new_xp,
    updated_at = now()
  WHERE id = pet_record.id;

  -- Check for evolution
  evolution_result := check_pet_evolution(pet_record.id);

  RETURN json_build_object(
    'success', true,
    'happiness', new_happiness,
    'xp', new_xp,
    'evolution', evolution_result
  );
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievements (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    description text,
    icon text,
    criteria jsonb NOT NULL,
    xp_reward integer DEFAULT 0,
    badge_color text DEFAULT 'blue'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    badge_image_url text,
    badge_image_alt text DEFAULT 'Achievement Badge'::text,
    criteria_type text DEFAULT 'exercise_completed'::text,
    criteria_value integer DEFAULT 1,
    criteria_period text DEFAULT 'all_time'::text,
    gem_reward integer DEFAULT 0
);


--
-- Name: avatar_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avatar_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    image_url text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reject_reason text,
    created_at timestamp with time zone DEFAULT now(),
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    CONSTRAINT avatar_uploads_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: avatars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avatars (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    image_url text NOT NULL,
    unlock_xp integer DEFAULT 0 NOT NULL,
    description text,
    tier text NOT NULL,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT avatars_tier_check CHECK ((tier = ANY (ARRAY['default'::text, 'bronze'::text, 'silver'::text, 'gold'::text, 'platinum'::text, 'diamond'::text])))
);


--
-- Name: chests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    image_url text,
    chest_type text DEFAULT 'common'::text NOT NULL,
    loot_table jsonb DEFAULT '[]'::jsonb NOT NULL,
    guaranteed_items jsonb DEFAULT '[]'::jsonb,
    items_per_open integer DEFAULT 3 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chests_chest_type_check CHECK ((chest_type = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'epic'::text, 'legendary'::text])))
);


--
-- Name: class_war_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_war_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    war_id uuid NOT NULL,
    user_id uuid NOT NULL,
    team text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT class_war_members_team_check CHECK ((team = ANY (ARRAY['A'::text, 'B'::text])))
);


--
-- Name: class_wars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_wars (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    course_id uuid NOT NULL,
    name text DEFAULT 'Class War'::text,
    team_a_name text DEFAULT 'Red Team'::text,
    team_b_name text DEFAULT 'Blue Team'::text,
    status text DEFAULT 'active'::text,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT class_wars_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])))
);


--
-- Name: cohort_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cohort_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    cohort_id uuid,
    student_id uuid,
    joined_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: cohorts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cohorts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    created_by uuid,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: collectible_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collectible_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    image_url text,
    item_type text NOT NULL,
    set_name text,
    rarity text DEFAULT 'common'::text NOT NULL,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    price_gems integer,
    price_xp integer DEFAULT 0,
    CONSTRAINT collectible_items_item_type_check CHECK ((item_type = ANY (ARRAY['fragment'::text, 'card'::text, 'material'::text, 'egg'::text, 'pet_food'::text, 'pet_toy'::text, 'background'::text, 'item'::text, 'ball'::text, 'ticket'::text]))),
    CONSTRAINT collectible_items_rarity_check CHECK ((rarity = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'epic'::text, 'legendary'::text])))
);


--
-- Name: COLUMN collectible_items.price_xp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.collectible_items.price_xp IS 'Price in XP to purchase this item (0 means not purchasable with XP)';


--
-- Name: course_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_enrollments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    course_id uuid,
    student_id uuid,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cohort_id uuid
);


--
-- Name: course_teachers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_teachers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    course_id uuid NOT NULL,
    teacher_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    description text,
    level_number integer NOT NULL,
    difficulty_label text NOT NULL,
    color_theme text DEFAULT 'blue'::text,
    unlock_requirement integer DEFAULT 0,
    is_active boolean DEFAULT true,
    thumbnail_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    teacher_id uuid,
    chest_enabled boolean DEFAULT false
);


--
-- Name: daily_challenge_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_challenge_attempts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    participation_id uuid NOT NULL,
    challenge_id uuid NOT NULL,
    user_id uuid NOT NULL,
    attempt_number integer NOT NULL,
    score integer NOT NULL,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    time_spent integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT daily_challenge_attempts_attempt_number_check CHECK (((attempt_number >= 1) AND (attempt_number <= 3))),
    CONSTRAINT daily_challenge_attempts_score_check CHECK (((score >= 0) AND (score <= 100)))
);


--
-- Name: daily_challenge_participations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_challenge_participations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    challenge_id uuid NOT NULL,
    user_id uuid NOT NULL,
    score integer NOT NULL,
    time_spent integer NOT NULL,
    attempts integer DEFAULT 1,
    completed_at timestamp with time zone DEFAULT now(),
    base_reward_claimed boolean DEFAULT false,
    rank_calculated integer,
    created_at timestamp with time zone DEFAULT now(),
    best_attempt_id uuid,
    first_attempt_at timestamp with time zone,
    CONSTRAINT daily_challenge_participations_attempts_check CHECK (((attempts >= 1) AND (attempts <= 3))),
    CONSTRAINT daily_challenge_participations_score_check CHECK (((score >= 0) AND (score <= 100)))
);


--
-- Name: daily_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_challenges (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    challenge_date date NOT NULL,
    difficulty_level text NOT NULL,
    exercise_id uuid NOT NULL,
    base_xp_reward integer DEFAULT 50,
    base_gem_reward integer DEFAULT 5,
    top1_achievement_id uuid,
    top3_achievement_id uuid,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    top2_achievement_id uuid,
    winners_awarded boolean DEFAULT false,
    is_locked boolean DEFAULT false,
    CONSTRAINT daily_challenges_difficulty_level_check CHECK ((difficulty_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])))
);


--
-- Name: drop_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drop_config (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    config_key text NOT NULL,
    config_value jsonb NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: exercise_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_assignments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    exercise_id uuid,
    session_id uuid,
    order_index integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: exercise_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_folders (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    parent_folder_id uuid,
    description text,
    color text DEFAULT 'blue'::text,
    icon text DEFAULT 'folder'::text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    read_only boolean DEFAULT true
);


--
-- Name: exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercises (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    session_id uuid,
    title text NOT NULL,
    exercise_type text NOT NULL,
    content jsonb NOT NULL,
    image_urls text[],
    difficulty_level integer DEFAULT 1,
    xp_reward integer DEFAULT 10,
    order_index integer NOT NULL,
    is_active boolean DEFAULT true,
    estimated_duration integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    folder_id uuid,
    is_in_bank boolean DEFAULT false,
    tags text[],
    category text,
    description text,
    score_boost integer DEFAULT 0,
    CONSTRAINT exercises_difficulty_level_check CHECK (((difficulty_level >= 1) AND (difficulty_level <= 5))),
    CONSTRAINT exercises_exercise_type_check CHECK ((exercise_type = ANY (ARRAY['flashcard'::text, 'pronunciation'::text, 'fill_blank'::text, 'video'::text, 'quiz'::text, 'multiple_choice'::text, 'listening'::text, 'speaking'::text, 'drag_drop'::text, 'dropdown'::text, 'ai_fill_blank'::text, 'image_hotspot'::text, 'pdf_worksheet'::text, 'speaking_assessment'::text, 'video_upload'::text, 'ielts_reading'::text, 'listening_dictation'::text])))
);


--
-- Name: COLUMN exercises.exercise_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exercises.exercise_type IS 'Exercise types: flashcard, pronunciation, fill_blank, video, quiz, multiple_choice, listening, speaking, drag_drop, dropdown, ai_fill_blank, image_hotspot, pdf_worksheet, speaking_assessment, video_upload, ielts_reading, listening_dictation';


--
-- Name: giftcode_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.giftcode_redemptions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    giftcode_id uuid NOT NULL,
    user_id uuid NOT NULL,
    redeemed_at timestamp with time zone DEFAULT now(),
    rewards_granted jsonb
);


--
-- Name: giftcodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.giftcodes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    code text NOT NULL,
    description text,
    rewards jsonb DEFAULT '{}'::jsonb NOT NULL,
    max_redemptions integer,
    current_redemptions integer DEFAULT 0,
    is_single_use boolean DEFAULT false,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: guest_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_attempts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    guest_id uuid NOT NULL,
    session_id uuid NOT NULL,
    score integer DEFAULT 0,
    total_correct integer DEFAULT 0,
    total_questions integer DEFAULT 0,
    time_used_seconds integer DEFAULT 0,
    timed_out boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    answers jsonb
);


--
-- Name: guest_visitors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_visitors (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: leaderboard_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leaderboard_rewards (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    timeframe text NOT NULL,
    rank integer NOT NULL,
    xp_reward integer DEFAULT 0 NOT NULL,
    gem_reward integer DEFAULT 0 NOT NULL,
    item_id uuid,
    item_quantity integer DEFAULT 1 NOT NULL,
    achievement_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    chest_id uuid,
    CONSTRAINT leaderboard_rewards_rank_check CHECK (((rank >= 1) AND (rank <= 10))),
    CONSTRAINT leaderboard_rewards_timeframe_check CHECK ((timeframe = ANY (ARRAY['weekly'::text, 'monthly'::text, 'pvp'::text])))
);


--
-- Name: lesson_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_info (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    course_id uuid NOT NULL,
    session_date date NOT NULL,
    lesson_name text,
    lesson_mode text,
    skill text,
    feedback text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    lesson_tags text,
    is_draft boolean DEFAULT false
);


--
-- Name: lesson_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_records (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    lesson_info_id uuid NOT NULL,
    student_id uuid NOT NULL,
    attendance_status text DEFAULT 'present'::text,
    participation_level text DEFAULT 'medium'::text,
    homework_status text,
    homework_notes text,
    homework_score integer,
    performance_rating text,
    star_flag text DEFAULT ''::text,
    engagement_level text DEFAULT 'medium'::text,
    notes text,
    recorded_by uuid,
    recorded_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    photo_url text,
    homework_photo_url text,
    score numeric,
    max_score numeric,
    homework_max_score numeric,
    vocab_score integer,
    vocab_max_score integer,
    CONSTRAINT lesson_records_attendance_status_check CHECK ((attendance_status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text]))),
    CONSTRAINT lesson_records_engagement_level_check CHECK ((engagement_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT lesson_records_homework_score_check CHECK (((homework_score IS NULL) OR ((homework_score >= 0) AND (homework_score <= 100)))),
    CONSTRAINT lesson_records_participation_level_check CHECK ((participation_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT lesson_records_star_flag_check CHECK ((star_flag = ANY (ARRAY[''::text, 'star'::text, 'flag'::text])))
);


--
-- Name: live_battle_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_battle_participants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    user_pet_id uuid,
    team text NOT NULL,
    individual_score integer DEFAULT 0,
    xp_awarded integer DEFAULT 0,
    CONSTRAINT live_battle_participants_team_check CHECK ((team = ANY (ARRAY['a'::text, 'b'::text])))
);


--
-- Name: live_battle_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_battle_sessions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    course_id uuid NOT NULL,
    teacher_id uuid,
    status text DEFAULT 'setup'::text NOT NULL,
    team_a_name text DEFAULT 'Team Alpha'::text,
    team_b_name text DEFAULT 'Team Beta'::text,
    team_a_score integer DEFAULT 0,
    team_b_score integer DEFAULT 0,
    winner_team text,
    xp_winner integer DEFAULT 30,
    xp_loser integer DEFAULT 10,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT live_battle_sessions_status_check CHECK ((status = ANY (ARRAY['setup'::text, 'active'::text, 'finished'::text]))),
    CONSTRAINT live_battle_sessions_winner_team_check CHECK ((winner_team = ANY (ARRAY['a'::text, 'b'::text, 'draw'::text])))
);


--
-- Name: missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.missions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    icon text DEFAULT 'target'::text,
    mission_type text NOT NULL,
    goal_type text NOT NULL,
    goal_value integer DEFAULT 1 NOT NULL,
    reward_xp integer DEFAULT 0,
    reward_gems integer DEFAULT 0,
    is_active boolean DEFAULT true,
    start_date date,
    end_date date,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    reward_item_id uuid,
    reward_item_quantity integer DEFAULT 1,
    reward_chest_type text,
    reward_chest_id uuid,
    CONSTRAINT missions_goal_type_check CHECK ((goal_type = ANY (ARRAY['complete_exercises'::text, 'score_high'::text, 'earn_xp'::text, 'play_games'::text, 'win_pvp'::text, 'win_quickmatch'::text, 'daily_challenge'::text, 'login_streak'::text, 'complete_session'::text, 'open_chests'::text, 'collect_items'::text, 'all_green_lesson'::text, 'blast_words'::text, 'whack_moles'::text, 'scramble_words'::text, 'type_words'::text, 'match_pairs'::text, 'pronounce_words'::text, 'earn_3_stars'::text, 'catch_fish'::text, 'complete_all_missions'::text]))),
    CONSTRAINT missions_mission_type_check CHECK ((mission_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'special'::text]))),
    CONSTRAINT missions_reward_chest_type_check CHECK ((reward_chest_type = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'epic'::text, 'legendary'::text])))
);


--
-- Name: notification_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_reads (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    notification_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    icon text,
    data jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false,
    cohort_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['info'::text, 'success'::text, 'warning'::text, 'error'::text, 'achievement'::text, 'reward'::text, 'system'::text, 'pvp_challenge'::text, 'pvp_result'::text, 'mission_reward'::text, 'admin_announcement'::text, 'giftcode_redeemed'::text, 'competition_winner'::text])))
);


--
-- Name: pet_bonuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pet_bonuses (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    pet_id uuid NOT NULL,
    bonus_type text NOT NULL,
    bonus_value numeric NOT NULL,
    min_happiness integer DEFAULT 50,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pet_bonuses_bonus_type_check CHECK ((bonus_type = ANY (ARRAY['xp_boost'::text, 'gem_boost'::text, 'streak_protection'::text, 'drop_rate_boost'::text])))
);


--
-- Name: pet_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pet_interactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    user_pet_id uuid NOT NULL,
    interaction_type text NOT NULL,
    item_used_id uuid,
    happiness_change integer DEFAULT 0,
    xp_gained integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    energy_change integer DEFAULT 0,
    CONSTRAINT pet_interactions_interaction_type_check CHECK ((interaction_type = ANY (ARRAY['feed'::text, 'play'::text, 'evolve'::text, 'equip_cosmetic'::text])))
);


--
-- Name: pet_question_bank; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pet_question_bank (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    question text NOT NULL,
    choices jsonb NOT NULL,
    answer_index integer NOT NULL,
    image_url text,
    category text,
    min_level integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: pet_word_bank; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pet_word_bank (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    word text NOT NULL,
    hint text NOT NULL,
    difficulty text DEFAULT 'easy'::text NOT NULL,
    min_level integer DEFAULT 1 NOT NULL,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pet_word_bank_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])))
);


--
-- Name: pets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    image_url text,
    rarity text DEFAULT 'common'::text NOT NULL,
    base_happiness integer DEFAULT 100 NOT NULL,
    evolution_stages jsonb DEFAULT '[]'::jsonb,
    unlock_requirement text DEFAULT 'shop'::text,
    unlock_xp integer DEFAULT 0,
    price_gems integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    image_url_sad text,
    image_url_sleepy text,
    info text,
    CONSTRAINT pets_rarity_check CHECK ((rarity = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'epic'::text, 'legendary'::text])))
);


--
-- Name: pvp_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pvp_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenger_id uuid,
    opponent_id uuid,
    game_type text NOT NULL,
    challenger_score integer DEFAULT 0,
    opponent_score integer,
    winner_id uuid,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    winner_taunt text,
    word_seed integer,
    realtime_mode boolean DEFAULT false
);


--
-- Name: pvp_matchmaking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pvp_matchmaking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    game_type text DEFAULT 'wordtype'::text NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    challenge_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: question_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_attempts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    exercise_id uuid,
    question_id text NOT NULL,
    selected_answer text,
    correct_answer text,
    is_correct boolean NOT NULL,
    attempt_number integer DEFAULT 1,
    response_time integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    manually_overridden boolean DEFAULT false,
    overridden_by uuid,
    overridden_at timestamp with time zone,
    exercise_type text,
    question_index integer
);


--
-- Name: recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    result_type text NOT NULL,
    result_shop_item_id uuid,
    result_xp integer DEFAULT 0,
    result_gems integer DEFAULT 0,
    result_image_url text,
    result_data jsonb DEFAULT '{}'::jsonb,
    ingredients jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    max_crafts_per_user integer,
    created_at timestamp with time zone DEFAULT now(),
    result_item_id uuid,
    success_rate integer DEFAULT 100,
    result_quantity integer DEFAULT 1,
    CONSTRAINT recipes_result_quantity_check CHECK ((result_quantity >= 1)),
    CONSTRAINT recipes_result_type_check CHECK ((result_type = ANY (ARRAY['cosmetic'::text, 'xp'::text, 'gems'::text, 'item'::text]))),
    CONSTRAINT recipes_success_rate_check CHECK (((success_rate >= 0) AND (success_rate <= 100)))
);


--
-- Name: report_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    sender_role text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    attachment_url text,
    CONSTRAINT report_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['user'::text, 'admin'::text])))
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    screenshot_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_reply text,
    replied_by uuid,
    replied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_reply text,
    user_replied_at timestamp with time zone
);


--
-- Name: session_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_progress (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    session_id uuid,
    status text DEFAULT 'locked'::text,
    progress_percentage integer DEFAULT 0,
    exercises_completed integer DEFAULT 0,
    total_exercises integer DEFAULT 0,
    xp_earned integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT session_progress_progress_percentage_check CHECK (((progress_percentage >= 0) AND (progress_percentage <= 100))),
    CONSTRAINT session_progress_status_check CHECK ((status = ANY (ARRAY['locked'::text, 'available'::text, 'in_progress'::text, 'completed'::text])))
);


--
-- Name: session_reward_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_reward_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    full_name text,
    xp_awarded integer DEFAULT 0 NOT NULL,
    claimed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    gems_awarded integer DEFAULT 0
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    unit_id uuid,
    title text NOT NULL,
    description text,
    session_number integer NOT NULL,
    session_type text DEFAULT 'mixed'::text,
    difficulty_level integer DEFAULT 1,
    xp_reward integer DEFAULT 50,
    unlock_requirement text,
    is_active boolean DEFAULT true,
    thumbnail_url text,
    estimated_duration integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_test boolean DEFAULT false,
    time_limit_minutes integer DEFAULT 30,
    passing_score integer DEFAULT 70,
    max_attempts integer DEFAULT 1,
    assigned_student_id uuid,
    open_date timestamp with time zone,
    close_date timestamp with time zone,
    CONSTRAINT sessions_difficulty_level_check CHECK (((difficulty_level >= 1) AND (difficulty_level <= 5))),
    CONSTRAINT sessions_session_type_check CHECK ((session_type = ANY (ARRAY['vocabulary'::text, 'grammar'::text, 'pronunciation'::text, 'listening'::text, 'mixed'::text])))
);


--
-- Name: shop_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    price integer NOT NULL,
    image_url text,
    item_data jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    price_type text DEFAULT 'gem'::text
);


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    setting_key text NOT NULL,
    setting_value text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: student_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_levels (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    level_number integer NOT NULL,
    xp_required integer NOT NULL,
    badge_name text NOT NULL,
    badge_tier text NOT NULL,
    badge_icon text,
    badge_color text NOT NULL,
    badge_description text,
    title_unlocked text,
    perks_unlocked jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT student_levels_badge_tier_check CHECK ((badge_tier = ANY (ARRAY['bronze'::text, 'silver'::text, 'gold'::text, 'platinum'::text, 'diamond'::text])))
);


--
-- Name: student_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    student_id uuid NOT NULL,
    created_by uuid,
    report_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: test_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_attempts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    score integer,
    passed boolean,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    time_used_seconds integer,
    status text DEFAULT 'in_progress'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    draft_answers jsonb,
    CONSTRAINT test_attempts_score_check CHECK (((score >= 0) AND (score <= 100))),
    CONSTRAINT test_attempts_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'timed_out'::text])))
);


--
-- Name: test_question_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_question_attempts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    test_attempt_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    question_index integer DEFAULT 0 NOT NULL,
    exercise_type text,
    selected_answer jsonb,
    correct_answer jsonb,
    is_correct boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    teacher_override boolean DEFAULT false,
    teacher_is_correct boolean,
    teacher_note text,
    overridden_by uuid,
    overridden_at timestamp with time zone
);


--
-- Name: tournament_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_matches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tournament_id uuid NOT NULL,
    round integer NOT NULL,
    match_position integer NOT NULL,
    player1_id uuid,
    player2_id uuid,
    player1_score integer,
    player2_score integer,
    winner_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ready_at timestamp with time zone,
    team1_id uuid,
    team2_id uuid,
    team_winner_id uuid,
    round_scores jsonb,
    CONSTRAINT tournament_matches_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'ready'::text, 'completed'::text])))
);


--
-- Name: tournament_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_participants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tournament_id uuid NOT NULL,
    user_id uuid NOT NULL,
    seed integer NOT NULL,
    eliminated_in_round integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tournament_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_team_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tournament_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_teams (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tournament_id uuid NOT NULL,
    name text NOT NULL,
    seed integer NOT NULL,
    eliminated_in_round integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tournaments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournaments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    bracket_size integer NOT NULL,
    game_type text DEFAULT 'wordtype'::text NOT NULL,
    current_round integer DEFAULT 1 NOT NULL,
    total_rounds integer NOT NULL,
    created_by uuid NOT NULL,
    winner_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    round_rewards jsonb DEFAULT '{}'::jsonb,
    entry_fee integer DEFAULT 0 NOT NULL,
    min_level integer,
    max_level integer,
    allowed_levels integer[],
    mode text DEFAULT 'solo'::text NOT NULL,
    team_size integer DEFAULT 1 NOT NULL,
    winning_team_id uuid,
    best_of integer DEFAULT 1 NOT NULL,
    info text,
    CONSTRAINT tournaments_best_of_check CHECK (((best_of >= 1) AND ((best_of % 2) = 1))),
    CONSTRAINT tournaments_bracket_size_check CHECK ((bracket_size = ANY (ARRAY[4, 8, 16, 32, 64]))),
    CONSTRAINT tournaments_game_type_check CHECK ((game_type = ANY (ARRAY['wordtype'::text, 'scramble'::text, 'matchgame'::text, 'whackmole'::text, 'astroblast'::text, 'flappy'::text, 'sayitright'::text, 'quizrush'::text]))),
    CONSTRAINT tournaments_mode_check CHECK ((mode = ANY (ARRAY['solo'::text, 'team'::text]))),
    CONSTRAINT tournaments_status_check CHECK ((status = ANY (ARRAY['registration'::text, 'active'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT tournaments_team_size_check CHECK (((team_size >= 1) AND (team_size <= 4)))
);


--
-- Name: training_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    game_type text NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    played_at timestamp with time zone DEFAULT now()
);


--
-- Name: unit_reward_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unit_reward_claims (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    xp_awarded integer NOT NULL,
    claimed_at timestamp with time zone DEFAULT now(),
    full_name text,
    CONSTRAINT unit_reward_claims_xp_awarded_check CHECK (((xp_awarded >= 5) AND (xp_awarded <= 20)))
);


--
-- Name: TABLE unit_reward_claims; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.unit_reward_claims IS 'Tracks unit completion reward claims with XP awarded and timestamp';


--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    course_id uuid,
    title text NOT NULL,
    description text,
    unit_number integer NOT NULL,
    color_theme text DEFAULT 'blue'::text,
    unlock_requirement integer DEFAULT 0,
    is_active boolean DEFAULT true,
    thumbnail_url text,
    estimated_duration integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    assigned_student_id uuid
);


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_achievements (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    achievement_id uuid,
    earned_at timestamp with time zone DEFAULT now(),
    claimed_at timestamp with time zone,
    xp_claimed integer DEFAULT 0,
    user_name text,
    achievement_name text,
    week_start timestamp with time zone
);


--
-- Name: TABLE user_achievements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_achievements IS 'Stores user achievement records.
IMPORTANT: No unique constraint on (user_id, achievement_id) to allow daily challenge achievements to be earned multiple times.';


--
-- Name: user_chests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_chests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    chest_id uuid NOT NULL,
    source text DEFAULT 'milestone'::text NOT NULL,
    source_ref text,
    earned_at timestamp with time zone DEFAULT now(),
    opened_at timestamp with time zone,
    items_received jsonb,
    user_name text
);


--
-- Name: user_crafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_crafts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    recipe_id uuid NOT NULL,
    crafted_at timestamp with time zone DEFAULT now(),
    result_data jsonb,
    user_name text,
    recipe_name text
);


--
-- Name: user_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_equipment (
    user_id uuid NOT NULL,
    active_title text,
    active_frame_ratio text,
    hide_frame boolean DEFAULT false,
    active_background_url text,
    active_bowl_url text,
    active_spaceship_url text,
    active_spaceship_laser text,
    active_hammer_url text,
    updated_at timestamp with time zone DEFAULT now(),
    active_boat_url text
);


--
-- Name: user_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_inventory (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    item_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    obtained_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_name text,
    item_name text,
    CONSTRAINT user_inventory_quantity_check CHECK ((quantity >= 0))
);


--
-- Name: user_missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_missions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    mission_id uuid NOT NULL,
    progress integer DEFAULT 0,
    status text DEFAULT 'active'::text,
    period_start date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_missions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'claimed'::text])))
);


--
-- Name: user_pets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_pets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    pet_id uuid NOT NULL,
    nickname text,
    happiness integer DEFAULT 100 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    xp integer DEFAULT 0 NOT NULL,
    evolution_stage integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    last_fed_at timestamp with time zone,
    last_played_at timestamp with time zone,
    obtained_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    energy integer DEFAULT 100 NOT NULL,
    user_name text,
    pet_name text,
    habitat_x real,
    habitat_y real,
    habitat_flip boolean DEFAULT false,
    CONSTRAINT user_pets_energy_check CHECK (((energy >= 0) AND (energy <= 100))),
    CONSTRAINT user_pets_happiness_check CHECK (((happiness >= 0) AND (happiness <= 100)))
);


--
-- Name: user_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_progress (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    course_id uuid,
    unit_id uuid,
    session_id uuid,
    exercise_id uuid,
    status text DEFAULT 'not_started'::text,
    score integer,
    max_score integer,
    attempts integer DEFAULT 0,
    time_spent integer DEFAULT 0,
    first_attempt_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    question_index integer DEFAULT 0,
    xp_earned integer DEFAULT 0,
    full_name text,
    exercise_title text,
    CONSTRAINT user_progress_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'attempted'::text])))
);


--
-- Name: COLUMN user_progress.question_index; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_progress.question_index IS 'Index of the current question (0-based)';


--
-- Name: COLUMN user_progress.xp_earned; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_progress.xp_earned IS 'XP points earned from this exercise attempt';


--
-- Name: COLUMN user_progress.full_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_progress.full_name IS 'User full name for easier tracking and debugging (denormalized from users table)';


--
-- Name: COLUMN user_progress.exercise_title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_progress.exercise_title IS 'Exercise title for easier tracking and debugging (denormalized from exercises table)';


--
-- Name: user_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    item_id uuid NOT NULL,
    purchased_at timestamp with time zone DEFAULT now(),
    user_name text,
    item_name text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    role text DEFAULT 'user'::text,
    current_level integer DEFAULT 1,
    xp integer DEFAULT 0,
    streak_count integer DEFAULT 0,
    last_activity_date date,
    total_practice_time integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    level integer DEFAULT 1,
    username text,
    gems integer DEFAULT 0,
    active_pet_id uuid,
    name_changed_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    energy integer DEFAULT 100,
    energy_last_reset date DEFAULT CURRENT_DATE,
    is_banned boolean DEFAULT false,
    wild_area_last_encounter timestamp with time zone,
    real_name text,
    real_avatar_url text,
    CONSTRAINT users_energy_check CHECK (((energy >= 0) AND (energy <= 100))),
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'teacher'::text])))
);


--
-- Name: v_cohort_members_detailed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_cohort_members_detailed AS
 SELECT cm.id,
    cm.cohort_id,
    cm.student_id,
    u.full_name,
    u.email,
    u.xp,
    cm.joined_at,
    cm.is_active
   FROM (public.cohort_members cm
     JOIN public.users u ON ((u.id = cm.student_id)));


--
-- Name: video_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    session_id uuid,
    question_index integer DEFAULT 0 NOT NULL,
    video_url text NOT NULL,
    transcription text,
    ai_result jsonb,
    ai_score integer,
    teacher_score integer,
    teacher_feedback text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT video_submissions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text])))
);


--
-- Name: weekly_xp_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_xp_tracking (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    week_start_date date NOT NULL,
    week_end_date date NOT NULL,
    total_xp integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: wild_area_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wild_area_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pet_id uuid,
    pet_name text,
    pet_rarity text,
    ball_item_id uuid,
    ball_name text,
    action text NOT NULL,
    is_duplicate boolean DEFAULT false,
    refund_xp integer DEFAULT 0,
    catch_rate integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT wild_area_logs_action_check CHECK ((action = ANY (ARRAY['encounter'::text, 'catch_success'::text, 'catch_fail'::text])))
);


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: avatar_uploads avatar_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_uploads
    ADD CONSTRAINT avatar_uploads_pkey PRIMARY KEY (id);


--
-- Name: avatars avatars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatars
    ADD CONSTRAINT avatars_pkey PRIMARY KEY (id);


--
-- Name: chests chests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chests
    ADD CONSTRAINT chests_pkey PRIMARY KEY (id);


--
-- Name: class_war_members class_war_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_war_members
    ADD CONSTRAINT class_war_members_pkey PRIMARY KEY (id);


--
-- Name: class_war_members class_war_members_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_war_members
    ADD CONSTRAINT class_war_members_unique UNIQUE (war_id, user_id);


--
-- Name: class_wars class_wars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_wars
    ADD CONSTRAINT class_wars_pkey PRIMARY KEY (id);


--
-- Name: cohort_members cohort_members_cohort_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cohort_members
    ADD CONSTRAINT cohort_members_cohort_id_student_id_key UNIQUE (cohort_id, student_id);


--
-- Name: cohort_members cohort_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cohort_members
    ADD CONSTRAINT cohort_members_pkey PRIMARY KEY (id);


--
-- Name: cohorts cohorts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cohorts
    ADD CONSTRAINT cohorts_pkey PRIMARY KEY (id);


--
-- Name: collectible_items collectible_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collectible_items
    ADD CONSTRAINT collectible_items_pkey PRIMARY KEY (id);


--
-- Name: course_enrollments course_enrollments_course_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_enrollments
    ADD CONSTRAINT course_enrollments_course_id_student_id_key UNIQUE (course_id, student_id);


--
-- Name: course_enrollments course_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_enrollments
    ADD CONSTRAINT course_enrollments_pkey PRIMARY KEY (id);


--
-- Name: course_teachers course_teachers_course_id_teacher_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_teachers
    ADD CONSTRAINT course_teachers_course_id_teacher_id_key UNIQUE (course_id, teacher_id);


--
-- Name: course_teachers course_teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_teachers
    ADD CONSTRAINT course_teachers_pkey PRIMARY KEY (id);


--
-- Name: daily_challenge_attempts daily_challenge_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_attempts
    ADD CONSTRAINT daily_challenge_attempts_pkey PRIMARY KEY (id);


--
-- Name: daily_challenge_attempts daily_challenge_attempts_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_attempts
    ADD CONSTRAINT daily_challenge_attempts_unique UNIQUE (challenge_id, user_id, attempt_number);


--
-- Name: daily_challenge_participations daily_challenge_participations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_participations
    ADD CONSTRAINT daily_challenge_participations_pkey PRIMARY KEY (id);


--
-- Name: daily_challenge_participations daily_challenge_participations_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_participations
    ADD CONSTRAINT daily_challenge_participations_unique UNIQUE (challenge_id, user_id);


--
-- Name: daily_challenges daily_challenges_date_level_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenges
    ADD CONSTRAINT daily_challenges_date_level_key UNIQUE (challenge_date, difficulty_level);


--
-- Name: daily_challenges daily_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenges
    ADD CONSTRAINT daily_challenges_pkey PRIMARY KEY (id);


--
-- Name: drop_config drop_config_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_config
    ADD CONSTRAINT drop_config_config_key_key UNIQUE (config_key);


--
-- Name: drop_config drop_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_config
    ADD CONSTRAINT drop_config_pkey PRIMARY KEY (id);


--
-- Name: exercise_assignments exercise_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_assignments
    ADD CONSTRAINT exercise_assignments_pkey PRIMARY KEY (id);


--
-- Name: exercise_assignments exercise_assignments_session_id_order_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_assignments
    ADD CONSTRAINT exercise_assignments_session_id_order_index_key UNIQUE (session_id, order_index);


--
-- Name: exercise_folders exercise_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_folders
    ADD CONSTRAINT exercise_folders_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_session_id_order_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_session_id_order_index_key UNIQUE (session_id, order_index);


--
-- Name: giftcode_redemptions giftcode_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giftcode_redemptions
    ADD CONSTRAINT giftcode_redemptions_pkey PRIMARY KEY (id);


--
-- Name: giftcode_redemptions giftcode_redemptions_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giftcode_redemptions
    ADD CONSTRAINT giftcode_redemptions_unique UNIQUE (giftcode_id, user_id);


--
-- Name: giftcodes giftcodes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giftcodes
    ADD CONSTRAINT giftcodes_code_key UNIQUE (code);


--
-- Name: giftcodes giftcodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giftcodes
    ADD CONSTRAINT giftcodes_pkey PRIMARY KEY (id);


--
-- Name: guest_attempts guest_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_attempts
    ADD CONSTRAINT guest_attempts_pkey PRIMARY KEY (id);


--
-- Name: guest_visitors guest_visitors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_visitors
    ADD CONSTRAINT guest_visitors_pkey PRIMARY KEY (id);


--
-- Name: leaderboard_rewards leaderboard_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_rewards
    ADD CONSTRAINT leaderboard_rewards_pkey PRIMARY KEY (id);


--
-- Name: leaderboard_rewards leaderboard_rewards_timeframe_rank_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_rewards
    ADD CONSTRAINT leaderboard_rewards_timeframe_rank_key UNIQUE (timeframe, rank);


--
-- Name: lesson_info lesson_info_course_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_info
    ADD CONSTRAINT lesson_info_course_date_unique UNIQUE (course_id, session_date);


--
-- Name: lesson_info lesson_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_info
    ADD CONSTRAINT lesson_info_pkey PRIMARY KEY (id);


--
-- Name: lesson_info lesson_info_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_info
    ADD CONSTRAINT lesson_info_unique UNIQUE (course_id, session_date);


--
-- Name: lesson_records lesson_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_records
    ADD CONSTRAINT lesson_records_pkey PRIMARY KEY (id);


--
-- Name: lesson_records lesson_records_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_records
    ADD CONSTRAINT lesson_records_unique UNIQUE (lesson_info_id, student_id);


--
-- Name: courses levels_level_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT levels_level_number_key UNIQUE (level_number);


--
-- Name: courses levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT levels_pkey PRIMARY KEY (id);


--
-- Name: live_battle_participants live_battle_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_battle_participants
    ADD CONSTRAINT live_battle_participants_pkey PRIMARY KEY (id);


--
-- Name: live_battle_participants live_battle_participants_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_battle_participants
    ADD CONSTRAINT live_battle_participants_unique UNIQUE (session_id, user_id);


--
-- Name: live_battle_sessions live_battle_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_battle_sessions
    ADD CONSTRAINT live_battle_sessions_pkey PRIMARY KEY (id);


--
-- Name: missions missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_pkey PRIMARY KEY (id);


--
-- Name: notification_reads notification_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_pkey PRIMARY KEY (id);


--
-- Name: notification_reads notification_reads_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_unique UNIQUE (notification_id, user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: pet_bonuses pet_bonuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_bonuses
    ADD CONSTRAINT pet_bonuses_pkey PRIMARY KEY (id);


--
-- Name: pet_interactions pet_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_interactions
    ADD CONSTRAINT pet_interactions_pkey PRIMARY KEY (id);


--
-- Name: pet_question_bank pet_question_bank_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_question_bank
    ADD CONSTRAINT pet_question_bank_pkey PRIMARY KEY (id);


--
-- Name: pet_word_bank pet_word_bank_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_word_bank
    ADD CONSTRAINT pet_word_bank_pkey PRIMARY KEY (id);


--
-- Name: pet_word_bank pet_word_bank_word_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_word_bank
    ADD CONSTRAINT pet_word_bank_word_key UNIQUE (word);


--
-- Name: pets pets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pets
    ADD CONSTRAINT pets_pkey PRIMARY KEY (id);


--
-- Name: pvp_challenges pvp_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pvp_challenges
    ADD CONSTRAINT pvp_challenges_pkey PRIMARY KEY (id);


--
-- Name: pvp_matchmaking pvp_matchmaking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pvp_matchmaking
    ADD CONSTRAINT pvp_matchmaking_pkey PRIMARY KEY (id);


--
-- Name: question_attempts question_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_attempts
    ADD CONSTRAINT question_attempts_pkey PRIMARY KEY (id);


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);


--
-- Name: report_messages report_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_messages
    ADD CONSTRAINT report_messages_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: session_progress session_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_progress
    ADD CONSTRAINT session_progress_pkey PRIMARY KEY (id);


--
-- Name: session_reward_claims session_reward_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_reward_claims
    ADD CONSTRAINT session_reward_claims_pkey PRIMARY KEY (id);


--
-- Name: session_reward_claims session_reward_claims_user_id_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_reward_claims
    ADD CONSTRAINT session_reward_claims_user_id_session_id_key UNIQUE (user_id, session_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_unit_id_session_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_unit_id_session_number_key UNIQUE (unit_id, session_number);


--
-- Name: shop_items shop_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_items
    ADD CONSTRAINT shop_items_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: student_levels student_levels_level_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_levels
    ADD CONSTRAINT student_levels_level_number_key UNIQUE (level_number);


--
-- Name: student_levels student_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_levels
    ADD CONSTRAINT student_levels_pkey PRIMARY KEY (id);


--
-- Name: student_reports student_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_reports
    ADD CONSTRAINT student_reports_pkey PRIMARY KEY (id);


--
-- Name: test_attempts test_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_pkey PRIMARY KEY (id);


--
-- Name: test_question_attempts test_question_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_question_attempts
    ADD CONSTRAINT test_question_attempts_pkey PRIMARY KEY (id);


--
-- Name: tournament_matches tournament_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_pkey PRIMARY KEY (id);


--
-- Name: tournament_matches tournament_matches_round_pos_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_round_pos_unique UNIQUE (tournament_id, round, match_position);


--
-- Name: tournament_participants tournament_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_participants
    ADD CONSTRAINT tournament_participants_pkey PRIMARY KEY (id);


--
-- Name: tournament_participants tournament_participants_seed_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_participants
    ADD CONSTRAINT tournament_participants_seed_unique UNIQUE (tournament_id, seed);


--
-- Name: tournament_participants tournament_participants_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_participants
    ADD CONSTRAINT tournament_participants_unique UNIQUE (tournament_id, user_id);


--
-- Name: tournament_team_members tournament_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_pkey PRIMARY KEY (id);


--
-- Name: tournament_team_members tournament_team_members_team_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- Name: tournament_teams tournament_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_pkey PRIMARY KEY (id);


--
-- Name: tournament_teams tournament_teams_tournament_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_tournament_id_name_key UNIQUE (tournament_id, name);


--
-- Name: tournament_teams tournament_teams_tournament_id_seed_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_tournament_id_seed_key UNIQUE (tournament_id, seed);


--
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);


--
-- Name: training_scores training_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_scores
    ADD CONSTRAINT training_scores_pkey PRIMARY KEY (id);


--
-- Name: unit_reward_claims unit_reward_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_reward_claims
    ADD CONSTRAINT unit_reward_claims_pkey PRIMARY KEY (id);


--
-- Name: unit_reward_claims unit_reward_claims_user_id_unit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_reward_claims
    ADD CONSTRAINT unit_reward_claims_user_id_unit_id_key UNIQUE (user_id, unit_id);


--
-- Name: units units_level_id_unit_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_level_id_unit_number_key UNIQUE (course_id, unit_number);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_user_achievement_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_achievement_unique UNIQUE (user_id, achievement_id, week_start);


--
-- Name: user_chests user_chests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_chests
    ADD CONSTRAINT user_chests_pkey PRIMARY KEY (id);


--
-- Name: user_crafts user_crafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_crafts
    ADD CONSTRAINT user_crafts_pkey PRIMARY KEY (id);


--
-- Name: user_equipment user_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_equipment
    ADD CONSTRAINT user_equipment_pkey PRIMARY KEY (user_id);


--
-- Name: user_inventory user_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_inventory
    ADD CONSTRAINT user_inventory_pkey PRIMARY KEY (id);


--
-- Name: user_inventory user_inventory_user_item_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_inventory
    ADD CONSTRAINT user_inventory_user_item_key UNIQUE (user_id, item_id);


--
-- Name: user_missions user_missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_missions
    ADD CONSTRAINT user_missions_pkey PRIMARY KEY (id);


--
-- Name: user_missions user_missions_user_id_mission_id_period_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_missions
    ADD CONSTRAINT user_missions_user_id_mission_id_period_start_key UNIQUE (user_id, mission_id, period_start);


--
-- Name: user_pets user_pets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pets
    ADD CONSTRAINT user_pets_pkey PRIMARY KEY (id);


--
-- Name: user_progress user_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_progress
    ADD CONSTRAINT user_progress_pkey PRIMARY KEY (id);


--
-- Name: user_progress user_progress_user_id_exercise_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_progress
    ADD CONSTRAINT user_progress_user_id_exercise_id_key UNIQUE (user_id, exercise_id);


--
-- Name: user_purchases user_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_purchases
    ADD CONSTRAINT user_purchases_pkey PRIMARY KEY (id);


--
-- Name: user_purchases user_purchases_user_id_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_purchases
    ADD CONSTRAINT user_purchases_user_id_item_id_key UNIQUE (user_id, item_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: video_submissions video_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_submissions
    ADD CONSTRAINT video_submissions_pkey PRIMARY KEY (id);


--
-- Name: weekly_xp_tracking weekly_xp_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_xp_tracking
    ADD CONSTRAINT weekly_xp_tracking_pkey PRIMARY KEY (id);


--
-- Name: weekly_xp_tracking weekly_xp_tracking_user_id_week_start_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_xp_tracking
    ADD CONSTRAINT weekly_xp_tracking_user_id_week_start_date_key UNIQUE (user_id, week_start_date);


--
-- Name: wild_area_logs wild_area_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wild_area_logs
    ADD CONSTRAINT wild_area_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_avatar_uploads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avatar_uploads_status ON public.avatar_uploads USING btree (status);


--
-- Name: idx_avatar_uploads_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avatar_uploads_user_id ON public.avatar_uploads USING btree (user_id);


--
-- Name: idx_avatars_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avatars_is_active ON public.avatars USING btree (is_active);


--
-- Name: idx_avatars_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avatars_tier ON public.avatars USING btree (tier);


--
-- Name: idx_avatars_unlock_xp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_avatars_unlock_xp ON public.avatars USING btree (unlock_xp);


--
-- Name: idx_challenge_attempts_participation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_attempts_participation ON public.daily_challenge_attempts USING btree (participation_id, attempt_number);


--
-- Name: idx_challenge_attempts_ranking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_attempts_ranking ON public.daily_challenge_attempts USING btree (challenge_id, score DESC, time_spent);


--
-- Name: idx_challenge_participations_ranking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_participations_ranking ON public.daily_challenge_participations USING btree (challenge_id, score DESC, time_spent);


--
-- Name: idx_challenge_participations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_participations_user ON public.daily_challenge_participations USING btree (user_id, completed_at DESC);


--
-- Name: idx_collectible_items_set; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collectible_items_set ON public.collectible_items USING btree (set_name);


--
-- Name: idx_collectible_items_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collectible_items_type ON public.collectible_items USING btree (item_type);


--
-- Name: idx_course_teachers_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_teachers_course_id ON public.course_teachers USING btree (course_id);


--
-- Name: idx_course_teachers_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_teachers_teacher_id ON public.course_teachers USING btree (teacher_id);


--
-- Name: idx_daily_challenges_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_challenges_active ON public.daily_challenges USING btree (is_active, challenge_date);


--
-- Name: idx_daily_challenges_date_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_challenges_date_level ON public.daily_challenges USING btree (challenge_date DESC, difficulty_level);


--
-- Name: idx_daily_challenges_locked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_challenges_locked ON public.daily_challenges USING btree (is_locked, challenge_date);


--
-- Name: idx_giftcode_redemptions_giftcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_giftcode_redemptions_giftcode ON public.giftcode_redemptions USING btree (giftcode_id);


--
-- Name: idx_giftcode_redemptions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_giftcode_redemptions_user ON public.giftcode_redemptions USING btree (user_id);


--
-- Name: idx_giftcodes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_giftcodes_active ON public.giftcodes USING btree (is_active, expires_at);


--
-- Name: idx_giftcodes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_giftcodes_code ON public.giftcodes USING btree (code);


--
-- Name: idx_lesson_info_course_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_info_course_date ON public.lesson_info USING btree (course_id, session_date DESC);


--
-- Name: idx_lesson_records_lesson_info; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_records_lesson_info ON public.lesson_records USING btree (lesson_info_id);


--
-- Name: idx_lesson_records_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_records_student ON public.lesson_records USING btree (student_id);


--
-- Name: idx_missions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_missions_type ON public.missions USING btree (mission_type, is_active);


--
-- Name: idx_notification_reads_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_reads_user ON public.notification_reads USING btree (user_id);


--
-- Name: idx_notifications_broadcast; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_broadcast ON public.notifications USING btree (created_at DESC) WHERE (user_id IS NULL);


--
-- Name: idx_notifications_cohort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_cohort ON public.notifications USING btree (cohort_id, created_at DESC) WHERE (cohort_id IS NOT NULL);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);


--
-- Name: idx_participations_best_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_best_attempt ON public.daily_challenge_participations USING btree (best_attempt_id);


--
-- Name: idx_pet_bonuses_pet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pet_bonuses_pet ON public.pet_bonuses USING btree (pet_id);


--
-- Name: idx_pet_interactions_user_pet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pet_interactions_user_pet ON public.pet_interactions USING btree (user_pet_id, created_at DESC);


--
-- Name: idx_pets_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pets_active ON public.pets USING btree (is_active);


--
-- Name: idx_pets_rarity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pets_rarity ON public.pets USING btree (rarity);


--
-- Name: idx_question_attempts_exercise_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_question_attempts_exercise_id ON public.question_attempts USING btree (exercise_id);


--
-- Name: idx_question_attempts_user_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_question_attempts_user_exercise ON public.question_attempts USING btree (user_id, exercise_id);


--
-- Name: idx_question_attempts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_question_attempts_user_id ON public.question_attempts USING btree (user_id);


--
-- Name: idx_report_messages_report_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_messages_report_id ON public.report_messages USING btree (report_id);


--
-- Name: idx_reports_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_created_at ON public.reports USING btree (created_at DESC);


--
-- Name: idx_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_status ON public.reports USING btree (status);


--
-- Name: idx_reports_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_user_id ON public.reports USING btree (user_id);


--
-- Name: idx_session_progress_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_progress_session_id ON public.session_progress USING btree (session_id);


--
-- Name: idx_session_progress_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_progress_user_id ON public.session_progress USING btree (user_id);


--
-- Name: idx_student_levels_level_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_levels_level_number ON public.student_levels USING btree (level_number);


--
-- Name: idx_student_levels_xp_required; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_levels_xp_required ON public.student_levels USING btree (xp_required);


--
-- Name: idx_tournament_matches_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_matches_tournament ON public.tournament_matches USING btree (tournament_id, round);


--
-- Name: idx_tournament_participants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournament_participants_user ON public.tournament_participants USING btree (user_id);


--
-- Name: idx_training_scores_user_game; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_scores_user_game ON public.training_scores USING btree (user_id, game_type, played_at);


--
-- Name: idx_unit_reward_claims_claimed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unit_reward_claims_claimed_at ON public.unit_reward_claims USING btree (claimed_at);


--
-- Name: idx_unit_reward_claims_unit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unit_reward_claims_unit_id ON public.unit_reward_claims USING btree (unit_id);


--
-- Name: idx_unit_reward_claims_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unit_reward_claims_user_id ON public.unit_reward_claims USING btree (user_id);


--
-- Name: idx_user_chests_user_unopened; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_chests_user_unopened ON public.user_chests USING btree (user_id) WHERE (opened_at IS NULL);


--
-- Name: idx_user_crafts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_crafts_user ON public.user_crafts USING btree (user_id);


--
-- Name: idx_user_equipment_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_equipment_user_id ON public.user_equipment USING btree (user_id);


--
-- Name: idx_user_inventory_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_inventory_user ON public.user_inventory USING btree (user_id);


--
-- Name: idx_user_missions_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_missions_period ON public.user_missions USING btree (user_id, period_start);


--
-- Name: idx_user_missions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_missions_user ON public.user_missions USING btree (user_id, status);


--
-- Name: idx_user_pets_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_pets_active ON public.user_pets USING btree (user_id, is_active);


--
-- Name: idx_user_pets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_pets_user ON public.user_pets USING btree (user_id);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: idx_video_submissions_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_submissions_exercise ON public.video_submissions USING btree (exercise_id);


--
-- Name: idx_video_submissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_submissions_status ON public.video_submissions USING btree (status);


--
-- Name: idx_video_submissions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_submissions_user ON public.video_submissions USING btree (user_id);


--
-- Name: idx_weekly_xp_tracking_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_xp_tracking_user_id ON public.weekly_xp_tracking USING btree (user_id);


--
-- Name: idx_weekly_xp_tracking_week_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_xp_tracking_week_start ON public.weekly_xp_tracking USING btree (week_start_date);


--
-- Name: idx_wild_area_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wild_area_logs_created_at ON public.wild_area_logs USING btree (created_at DESC);


--
-- Name: idx_wild_area_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wild_area_logs_user_id ON public.wild_area_logs USING btree (user_id);


--
-- Name: users on_user_created_equipment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_user_created_equipment AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.create_user_equipment();


--
-- Name: user_achievements trg_fill_achievement_names; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fill_achievement_names BEFORE INSERT ON public.user_achievements FOR EACH ROW EXECUTE FUNCTION public.fill_achievement_names();


--
-- Name: user_chests trg_fill_chest_user_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fill_chest_user_name BEFORE INSERT ON public.user_chests FOR EACH ROW EXECUTE FUNCTION public.fill_chest_user_name();


--
-- Name: user_crafts trg_fill_craft_names; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fill_craft_names BEFORE INSERT ON public.user_crafts FOR EACH ROW EXECUTE FUNCTION public.fill_craft_names();


--
-- Name: user_inventory trg_fill_inventory_names; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fill_inventory_names BEFORE INSERT ON public.user_inventory FOR EACH ROW EXECUTE FUNCTION public.fill_inventory_names();


--
-- Name: user_pets trg_fill_pet_names; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fill_pet_names BEFORE INSERT ON public.user_pets FOR EACH ROW EXECUTE FUNCTION public.fill_pet_names();


--
-- Name: user_purchases trg_fill_purchase_names; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fill_purchase_names BEFORE INSERT ON public.user_purchases FOR EACH ROW EXECUTE FUNCTION public.fill_purchase_names();


--
-- Name: user_progress trigger_populate_user_progress_tracking_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_populate_user_progress_tracking_fields BEFORE INSERT ON public.user_progress FOR EACH ROW EXECUTE FUNCTION public.populate_user_progress_tracking_fields();


--
-- Name: user_progress trigger_track_weekly_xp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_track_weekly_xp AFTER INSERT OR UPDATE ON public.user_progress FOR EACH ROW WHEN (((new.status = 'completed'::text) AND (new.xp_earned > 0))) EXECUTE FUNCTION public.track_weekly_xp();


--
-- Name: avatars update_avatars_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_avatars_updated_at BEFORE UPDATE ON public.avatars FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cohort_members update_cohort_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cohort_members_updated_at BEFORE UPDATE ON public.cohort_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cohorts update_cohorts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cohorts_updated_at BEFORE UPDATE ON public.cohorts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: course_enrollments update_course_enrollments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_course_enrollments_updated_at BEFORE UPDATE ON public.course_enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: exercise_assignments update_exercise_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_exercise_assignments_updated_at BEFORE UPDATE ON public.exercise_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: exercise_folders update_exercise_folders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_exercise_folders_updated_at BEFORE UPDATE ON public.exercise_folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: exercises update_exercises_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON public.exercises FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: courses update_levels_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_levels_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: question_attempts update_question_attempts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_question_attempts_updated_at BEFORE UPDATE ON public.question_attempts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sessions update_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: student_levels update_student_levels_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_student_levels_updated_at BEFORE UPDATE ON public.student_levels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: units update_units_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_progress update_user_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_progress_updated_at BEFORE UPDATE ON public.user_progress FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: avatar_uploads avatar_uploads_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_uploads
    ADD CONSTRAINT avatar_uploads_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: avatar_uploads avatar_uploads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avatar_uploads
    ADD CONSTRAINT avatar_uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: class_war_members class_war_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_war_members
    ADD CONSTRAINT class_war_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: class_war_members class_war_members_war_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_war_members
    ADD CONSTRAINT class_war_members_war_id_fkey FOREIGN KEY (war_id) REFERENCES public.class_wars(id) ON DELETE CASCADE;


--
-- Name: class_wars class_wars_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_wars
    ADD CONSTRAINT class_wars_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id);


--
-- Name: class_wars class_wars_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_wars
    ADD CONSTRAINT class_wars_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: cohort_members cohort_members_cohort_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cohort_members
    ADD CONSTRAINT cohort_members_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id) ON DELETE CASCADE;


--
-- Name: cohort_members cohort_members_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cohort_members
    ADD CONSTRAINT cohort_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cohorts cohorts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cohorts
    ADD CONSTRAINT cohorts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: course_enrollments course_enrollments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_enrollments
    ADD CONSTRAINT course_enrollments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: course_enrollments course_enrollments_cohort_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_enrollments
    ADD CONSTRAINT course_enrollments_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id);


--
-- Name: course_enrollments course_enrollments_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_enrollments
    ADD CONSTRAINT course_enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: course_enrollments course_enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_enrollments
    ADD CONSTRAINT course_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: course_teachers course_teachers_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_teachers
    ADD CONSTRAINT course_teachers_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: course_teachers course_teachers_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_teachers
    ADD CONSTRAINT course_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: courses courses_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: daily_challenge_attempts daily_challenge_attempts_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_attempts
    ADD CONSTRAINT daily_challenge_attempts_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.daily_challenges(id) ON DELETE CASCADE;


--
-- Name: daily_challenge_attempts daily_challenge_attempts_participation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_attempts
    ADD CONSTRAINT daily_challenge_attempts_participation_id_fkey FOREIGN KEY (participation_id) REFERENCES public.daily_challenge_participations(id) ON DELETE CASCADE;


--
-- Name: daily_challenge_attempts daily_challenge_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_attempts
    ADD CONSTRAINT daily_challenge_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: daily_challenge_participations daily_challenge_participations_best_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_participations
    ADD CONSTRAINT daily_challenge_participations_best_attempt_id_fkey FOREIGN KEY (best_attempt_id) REFERENCES public.daily_challenge_attempts(id) ON DELETE SET NULL;


--
-- Name: daily_challenge_participations daily_challenge_participations_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_participations
    ADD CONSTRAINT daily_challenge_participations_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.daily_challenges(id) ON DELETE CASCADE;


--
-- Name: daily_challenge_participations daily_challenge_participations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_participations
    ADD CONSTRAINT daily_challenge_participations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: daily_challenges daily_challenges_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenges
    ADD CONSTRAINT daily_challenges_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id);


--
-- Name: daily_challenges daily_challenges_top1_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenges
    ADD CONSTRAINT daily_challenges_top1_achievement_id_fkey FOREIGN KEY (top1_achievement_id) REFERENCES public.achievements(id);


--
-- Name: daily_challenges daily_challenges_top2_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenges
    ADD CONSTRAINT daily_challenges_top2_achievement_id_fkey FOREIGN KEY (top2_achievement_id) REFERENCES public.achievements(id);


--
-- Name: daily_challenges daily_challenges_top3_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenges
    ADD CONSTRAINT daily_challenges_top3_achievement_id_fkey FOREIGN KEY (top3_achievement_id) REFERENCES public.achievements(id);


--
-- Name: exercise_assignments exercise_assignments_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_assignments
    ADD CONSTRAINT exercise_assignments_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


--
-- Name: exercise_assignments exercise_assignments_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_assignments
    ADD CONSTRAINT exercise_assignments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: exercise_folders exercise_folders_parent_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_folders
    ADD CONSTRAINT exercise_folders_parent_folder_id_fkey FOREIGN KEY (parent_folder_id) REFERENCES public.exercise_folders(id) ON DELETE CASCADE;


--
-- Name: exercises exercises_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.exercise_folders(id);


--
-- Name: exercises exercises_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: giftcode_redemptions giftcode_redemptions_giftcode_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giftcode_redemptions
    ADD CONSTRAINT giftcode_redemptions_giftcode_fkey FOREIGN KEY (giftcode_id) REFERENCES public.giftcodes(id) ON DELETE CASCADE;


--
-- Name: giftcode_redemptions giftcode_redemptions_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giftcode_redemptions
    ADD CONSTRAINT giftcode_redemptions_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: giftcodes giftcodes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.giftcodes
    ADD CONSTRAINT giftcodes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guest_attempts guest_attempts_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_attempts
    ADD CONSTRAINT guest_attempts_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES public.guest_visitors(id);


--
-- Name: guest_attempts guest_attempts_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_attempts
    ADD CONSTRAINT guest_attempts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id);


--
-- Name: leaderboard_rewards leaderboard_rewards_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_rewards
    ADD CONSTRAINT leaderboard_rewards_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id);


--
-- Name: leaderboard_rewards leaderboard_rewards_chest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_rewards
    ADD CONSTRAINT leaderboard_rewards_chest_id_fkey FOREIGN KEY (chest_id) REFERENCES public.chests(id);


--
-- Name: leaderboard_rewards leaderboard_rewards_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_rewards
    ADD CONSTRAINT leaderboard_rewards_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.collectible_items(id);


--
-- Name: lesson_info lesson_info_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_info
    ADD CONSTRAINT lesson_info_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: lesson_info lesson_info_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_info
    ADD CONSTRAINT lesson_info_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: lesson_records lesson_records_lesson_info_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_records
    ADD CONSTRAINT lesson_records_lesson_info_id_fkey FOREIGN KEY (lesson_info_id) REFERENCES public.lesson_info(id) ON DELETE CASCADE;


--
-- Name: lesson_records lesson_records_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_records
    ADD CONSTRAINT lesson_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: lesson_records lesson_records_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_records
    ADD CONSTRAINT lesson_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: live_battle_participants live_battle_participants_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_battle_participants
    ADD CONSTRAINT live_battle_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.live_battle_sessions(id) ON DELETE CASCADE;


--
-- Name: live_battle_participants live_battle_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_battle_participants
    ADD CONSTRAINT live_battle_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: live_battle_participants live_battle_participants_user_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_battle_participants
    ADD CONSTRAINT live_battle_participants_user_pet_id_fkey FOREIGN KEY (user_pet_id) REFERENCES public.user_pets(id);


--
-- Name: live_battle_sessions live_battle_sessions_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_battle_sessions
    ADD CONSTRAINT live_battle_sessions_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id);


--
-- Name: live_battle_sessions live_battle_sessions_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_battle_sessions
    ADD CONSTRAINT live_battle_sessions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: missions missions_reward_chest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_reward_chest_id_fkey FOREIGN KEY (reward_chest_id) REFERENCES public.chests(id);


--
-- Name: missions missions_reward_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_reward_item_id_fkey FOREIGN KEY (reward_item_id) REFERENCES public.collectible_items(id);


--
-- Name: notification_reads notification_reads_notification_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_notification_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: notification_reads notification_reads_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_reads
    ADD CONSTRAINT notification_reads_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_cohort_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pet_bonuses pet_bonuses_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_bonuses
    ADD CONSTRAINT pet_bonuses_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;


--
-- Name: pet_interactions pet_interactions_item_used_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_interactions
    ADD CONSTRAINT pet_interactions_item_used_fkey FOREIGN KEY (item_used_id) REFERENCES public.collectible_items(id);


--
-- Name: pet_interactions pet_interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_interactions
    ADD CONSTRAINT pet_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pet_interactions pet_interactions_user_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pet_interactions
    ADD CONSTRAINT pet_interactions_user_pet_id_fkey FOREIGN KEY (user_pet_id) REFERENCES public.user_pets(id) ON DELETE CASCADE;


--
-- Name: pvp_challenges pvp_challenges_challenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pvp_challenges
    ADD CONSTRAINT pvp_challenges_challenger_id_fkey FOREIGN KEY (challenger_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pvp_challenges pvp_challenges_opponent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pvp_challenges
    ADD CONSTRAINT pvp_challenges_opponent_id_fkey FOREIGN KEY (opponent_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pvp_challenges pvp_challenges_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pvp_challenges
    ADD CONSTRAINT pvp_challenges_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pvp_matchmaking pvp_matchmaking_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pvp_matchmaking
    ADD CONSTRAINT pvp_matchmaking_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.pvp_challenges(id);


--
-- Name: pvp_matchmaking pvp_matchmaking_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pvp_matchmaking
    ADD CONSTRAINT pvp_matchmaking_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: question_attempts question_attempts_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_attempts
    ADD CONSTRAINT question_attempts_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


--
-- Name: question_attempts question_attempts_overridden_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_attempts
    ADD CONSTRAINT question_attempts_overridden_by_fkey FOREIGN KEY (overridden_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: question_attempts question_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_attempts
    ADD CONSTRAINT question_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: recipes recipes_result_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_result_item_id_fkey FOREIGN KEY (result_item_id) REFERENCES public.collectible_items(id);


--
-- Name: recipes recipes_result_shop_item_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_result_shop_item_fkey FOREIGN KEY (result_shop_item_id) REFERENCES public.shop_items(id);


--
-- Name: report_messages report_messages_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_messages
    ADD CONSTRAINT report_messages_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- Name: reports reports_replied_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_replied_by_fkey FOREIGN KEY (replied_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: reports reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: session_progress session_progress_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_progress
    ADD CONSTRAINT session_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: session_progress session_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_progress
    ADD CONSTRAINT session_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: session_reward_claims session_reward_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_reward_claims
    ADD CONSTRAINT session_reward_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: session_reward_claims session_reward_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_reward_claims
    ADD CONSTRAINT session_reward_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_assigned_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_assigned_student_id_fkey FOREIGN KEY (assigned_student_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sessions sessions_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: student_reports student_reports_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_reports
    ADD CONSTRAINT student_reports_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: student_reports student_reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_reports
    ADD CONSTRAINT student_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: student_reports student_reports_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_reports
    ADD CONSTRAINT student_reports_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: test_attempts test_attempts_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id);


--
-- Name: test_attempts test_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: test_question_attempts test_question_attempts_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_question_attempts
    ADD CONSTRAINT test_question_attempts_attempt_id_fkey FOREIGN KEY (test_attempt_id) REFERENCES public.test_attempts(id) ON DELETE CASCADE;


--
-- Name: test_question_attempts test_question_attempts_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_question_attempts
    ADD CONSTRAINT test_question_attempts_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id);


--
-- Name: test_question_attempts test_question_attempts_overridden_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_question_attempts
    ADD CONSTRAINT test_question_attempts_overridden_by_fkey FOREIGN KEY (overridden_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tournament_matches tournament_matches_player1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_player1_fkey FOREIGN KEY (player1_id) REFERENCES public.users(id);


--
-- Name: tournament_matches tournament_matches_player2_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_player2_fkey FOREIGN KEY (player2_id) REFERENCES public.users(id);


--
-- Name: tournament_matches tournament_matches_team1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_team1_id_fkey FOREIGN KEY (team1_id) REFERENCES public.tournament_teams(id);


--
-- Name: tournament_matches tournament_matches_team2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_team2_id_fkey FOREIGN KEY (team2_id) REFERENCES public.tournament_teams(id);


--
-- Name: tournament_matches tournament_matches_team_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_team_winner_id_fkey FOREIGN KEY (team_winner_id) REFERENCES public.tournament_teams(id);


--
-- Name: tournament_matches tournament_matches_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_tournament_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_matches tournament_matches_winner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_winner_fkey FOREIGN KEY (winner_id) REFERENCES public.users(id);


--
-- Name: tournament_participants tournament_participants_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_participants
    ADD CONSTRAINT tournament_participants_tournament_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournament_participants tournament_participants_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_participants
    ADD CONSTRAINT tournament_participants_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tournament_team_members tournament_team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.tournament_teams(id) ON DELETE CASCADE;


--
-- Name: tournament_team_members tournament_team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tournament_teams tournament_teams_tournament_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;


--
-- Name: tournaments tournaments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: tournaments tournaments_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.users(id);


--
-- Name: tournaments tournaments_winning_team_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_winning_team_fkey FOREIGN KEY (winning_team_id) REFERENCES public.tournament_teams(id);


--
-- Name: training_scores training_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_scores
    ADD CONSTRAINT training_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: unit_reward_claims unit_reward_claims_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_reward_claims
    ADD CONSTRAINT unit_reward_claims_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: unit_reward_claims unit_reward_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_reward_claims
    ADD CONSTRAINT unit_reward_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: units units_assigned_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_assigned_student_id_fkey FOREIGN KEY (assigned_student_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: units units_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_level_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_chests user_chests_chest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_chests
    ADD CONSTRAINT user_chests_chest_id_fkey FOREIGN KEY (chest_id) REFERENCES public.chests(id);


--
-- Name: user_chests user_chests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_chests
    ADD CONSTRAINT user_chests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_crafts user_crafts_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_crafts
    ADD CONSTRAINT user_crafts_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id);


--
-- Name: user_crafts user_crafts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_crafts
    ADD CONSTRAINT user_crafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_equipment user_equipment_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_equipment
    ADD CONSTRAINT user_equipment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_inventory user_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_inventory
    ADD CONSTRAINT user_inventory_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.collectible_items(id);


--
-- Name: user_inventory user_inventory_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_inventory
    ADD CONSTRAINT user_inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_missions user_missions_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_missions
    ADD CONSTRAINT user_missions_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;


--
-- Name: user_missions user_missions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_missions
    ADD CONSTRAINT user_missions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_pets user_pets_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pets
    ADD CONSTRAINT user_pets_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE;


--
-- Name: user_pets user_pets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pets
    ADD CONSTRAINT user_pets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_progress user_progress_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_progress
    ADD CONSTRAINT user_progress_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


--
-- Name: user_progress user_progress_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_progress
    ADD CONSTRAINT user_progress_level_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: user_progress user_progress_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_progress
    ADD CONSTRAINT user_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: user_progress user_progress_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_progress
    ADD CONSTRAINT user_progress_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: user_progress user_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_progress
    ADD CONSTRAINT user_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_purchases user_purchases_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_purchases
    ADD CONSTRAINT user_purchases_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.shop_items(id);


--
-- Name: user_purchases user_purchases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_purchases
    ADD CONSTRAINT user_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_active_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_active_pet_id_fkey FOREIGN KEY (active_pet_id) REFERENCES public.user_pets(id) ON DELETE SET NULL;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: video_submissions video_submissions_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_submissions
    ADD CONSTRAINT video_submissions_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


--
-- Name: video_submissions video_submissions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_submissions
    ADD CONSTRAINT video_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: video_submissions video_submissions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_submissions
    ADD CONSTRAINT video_submissions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: video_submissions video_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_submissions
    ADD CONSTRAINT video_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: weekly_xp_tracking weekly_xp_tracking_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_xp_tracking
    ADD CONSTRAINT weekly_xp_tracking_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wild_area_logs wild_area_logs_ball_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wild_area_logs
    ADD CONSTRAINT wild_area_logs_ball_item_id_fkey FOREIGN KEY (ball_item_id) REFERENCES public.collectible_items(id) ON DELETE SET NULL;


--
-- Name: wild_area_logs wild_area_logs_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wild_area_logs
    ADD CONSTRAINT wild_area_logs_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE SET NULL;


--
-- Name: wild_area_logs wild_area_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wild_area_logs
    ADD CONSTRAINT wild_area_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: achievements Achievements readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Achievements readable by authenticated users" ON public.achievements FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: chests Admin manage chests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin manage chests" ON public.chests USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: drop_config Admin manage drop config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin manage drop config" ON public.drop_config USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: collectible_items Admin manage items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin manage items" ON public.collectible_items USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: recipes Admin manage recipes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin manage recipes" ON public.recipes USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: missions Admins can delete missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete missions" ON public.missions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: missions Admins can insert missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert missions" ON public.missions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: user_chests Admins can insert user_chests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert user_chests" ON public.user_chests FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: user_inventory Admins can insert user_inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert user_inventory" ON public.user_inventory FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: user_purchases Admins can insert user_purchases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert user_purchases" ON public.user_purchases FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: notifications Admins can manage all notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all notifications" ON public.notifications USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: exercise_assignments Admins can manage assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage assignments" ON public.exercise_assignments USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: course_teachers Admins can manage course teachers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage course teachers" ON public.course_teachers TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: exercise_folders Admins can manage folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage folders" ON public.exercise_folders USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: giftcodes Admins can manage giftcodes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage giftcodes" ON public.giftcodes USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: pet_question_bank Admins can manage question bank; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage question bank" ON public.pet_question_bank USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: pet_word_bank Admins can manage word bank; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage word bank" ON public.pet_word_bank USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: giftcode_redemptions Admins can read all redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all redemptions" ON public.giftcode_redemptions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: wild_area_logs Admins can read all wild area logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all wild area logs" ON public.wild_area_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: user_chests Admins can read user_chests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read user_chests" ON public.user_chests FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: user_inventory Admins can read user_inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read user_inventory" ON public.user_inventory FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: user_purchases Admins can read user_purchases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read user_purchases" ON public.user_purchases FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: avatar_uploads Admins can update avatar uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update avatar uploads" ON public.avatar_uploads FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: missions Admins can update missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update missions" ON public.missions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: user_inventory Admins can update user_inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update user_inventory" ON public.user_inventory FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: avatar_uploads Admins can view all avatar uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all avatar uploads" ON public.avatar_uploads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: unit_reward_claims Admins can view all reward claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all reward claims" ON public.unit_reward_claims FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: cohort_members Admins delete cohort_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete cohort_members" ON public.cohort_members FOR DELETE USING (((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))) OR (cohort_id IN ( SELECT cohorts.id
   FROM public.cohorts
  WHERE (cohorts.created_by = auth.uid())))));


--
-- Name: cohorts Admins delete cohorts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete cohorts" ON public.cohorts FOR DELETE USING (((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))) OR (created_by = auth.uid())));


--
-- Name: report_messages Admins full access to report messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access to report messages" ON public.report_messages USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: reports Admins full access to reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins full access to reports" ON public.reports USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: cohort_members Admins insert cohort_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins insert cohort_members" ON public.cohort_members FOR INSERT WITH CHECK (((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))) OR (cohort_id IN ( SELECT cohorts.id
   FROM public.cohorts
  WHERE (cohorts.created_by = auth.uid())))));


--
-- Name: cohorts Admins insert cohorts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins insert cohorts" ON public.cohorts FOR INSERT WITH CHECK (((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))) OR (created_by = auth.uid())));


--
-- Name: course_enrollments Admins manage enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage enrollments" ON public.course_enrollments USING ((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))));


--
-- Name: cohort_members Admins select cohort_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins select cohort_members" ON public.cohort_members FOR SELECT USING (((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))) OR (cohort_id IN ( SELECT cohorts.id
   FROM public.cohorts
  WHERE (cohorts.created_by = auth.uid())))));


--
-- Name: cohorts Admins select cohorts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins select cohorts" ON public.cohorts FOR SELECT USING (((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))) OR (created_by = auth.uid())));


--
-- Name: cohort_members Admins update cohort_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update cohort_members" ON public.cohort_members FOR UPDATE USING (((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))) OR (cohort_id IN ( SELECT cohorts.id
   FROM public.cohorts
  WHERE (cohorts.created_by = auth.uid()))))) WITH CHECK (((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))) OR (cohort_id IN ( SELECT cohorts.id
   FROM public.cohorts
  WHERE (cohorts.created_by = auth.uid())))));


--
-- Name: cohorts Admins update cohorts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update cohorts" ON public.cohorts FOR UPDATE USING (((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))) OR (created_by = auth.uid()))) WITH CHECK (((auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))) OR (created_by = auth.uid())));


--
-- Name: site_settings Allow admin write access to site_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admin write access to site_settings" ON public.site_settings TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: live_battle_participants Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.live_battle_participants USING ((auth.role() = 'authenticated'::text));


--
-- Name: live_battle_sessions Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all for authenticated users" ON public.live_battle_sessions USING ((auth.role() = 'authenticated'::text));


--
-- Name: notifications Allow all users to read competition winner notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all users to read competition winner notifications" ON public.notifications FOR SELECT USING ((type = 'competition_winner'::text));


--
-- Name: guest_attempts Allow anonymous insert on guest_attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous insert on guest_attempts" ON public.guest_attempts FOR INSERT TO anon WITH CHECK (true);


--
-- Name: guest_visitors Allow anonymous insert on guest_visitors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous insert on guest_visitors" ON public.guest_visitors FOR INSERT TO anon WITH CHECK (true);


--
-- Name: courses Allow anonymous read on courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous read on courses" ON public.courses FOR SELECT TO anon USING (true);


--
-- Name: exercise_assignments Allow anonymous read on exercise_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous read on exercise_assignments" ON public.exercise_assignments FOR SELECT TO anon USING (true);


--
-- Name: exercises Allow anonymous read on exercises; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous read on exercises" ON public.exercises FOR SELECT TO anon USING (true);


--
-- Name: sessions Allow anonymous read on sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous read on sessions" ON public.sessions FOR SELECT TO anon USING (true);


--
-- Name: site_settings Allow anonymous read on site_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous read on site_settings" ON public.site_settings FOR SELECT TO anon USING (true);


--
-- Name: units Allow anonymous read on units; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous read on units" ON public.units FOR SELECT TO anon USING (true);


--
-- Name: guest_attempts Allow anonymous read own guest_attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous read own guest_attempts" ON public.guest_attempts FOR SELECT TO anon USING (true);


--
-- Name: guest_attempts Allow authenticated insert on guest_attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated insert on guest_attempts" ON public.guest_attempts FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: guest_visitors Allow authenticated insert on guest_visitors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated insert on guest_visitors" ON public.guest_visitors FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: guest_attempts Allow authenticated read on guest_attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated read on guest_attempts" ON public.guest_attempts FOR SELECT TO authenticated USING (true);


--
-- Name: guest_visitors Allow authenticated read on guest_visitors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated read on guest_visitors" ON public.guest_visitors FOR SELECT TO authenticated USING (true);


--
-- Name: user_inventory Allow authenticated users to read all inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read all inventory" ON public.user_inventory FOR SELECT TO authenticated USING (true);


--
-- Name: site_settings Allow public read access to site_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to site_settings" ON public.site_settings FOR SELECT USING (true);


--
-- Name: users Allow username lookup for login; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow username lookup for login" ON public.users FOR SELECT TO anon USING (true);


--
-- Name: chests Anyone can read active chests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active chests" ON public.chests FOR SELECT USING (true);


--
-- Name: giftcodes Anyone can read active giftcodes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active giftcodes" ON public.giftcodes FOR SELECT USING (true);


--
-- Name: collectible_items Anyone can read active items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active items" ON public.collectible_items FOR SELECT USING (true);


--
-- Name: recipes Anyone can read active recipes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active recipes" ON public.recipes FOR SELECT USING (true);


--
-- Name: drop_config Anyone can read drop config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read drop config" ON public.drop_config FOR SELECT USING (true);


--
-- Name: tournament_team_members Anyone can read tournament_team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read tournament_team_members" ON public.tournament_team_members FOR SELECT USING (true);


--
-- Name: tournament_teams Anyone can read tournament_teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read tournament_teams" ON public.tournament_teams FOR SELECT USING (true);


--
-- Name: pvp_matchmaking Anyone can see matchmaking queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can see matchmaking queue" ON public.pvp_matchmaking FOR SELECT TO authenticated USING (true);


--
-- Name: user_missions Anyone can view claimed missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view claimed missions" ON public.user_missions FOR SELECT TO authenticated USING ((status = 'claimed'::text));


--
-- Name: course_teachers Anyone can view course teachers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view course teachers" ON public.course_teachers FOR SELECT TO authenticated USING (true);


--
-- Name: session_reward_claims Anyone can view session reward claims for leaderboard; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view session reward claims for leaderboard" ON public.session_reward_claims FOR SELECT USING (true);


--
-- Name: user_equipment Anyone can view user equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view user equipment" ON public.user_equipment FOR SELECT USING (true);


--
-- Name: exercise_assignments Assignments readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assignments readable by authenticated users" ON public.exercise_assignments FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: tournament_team_members Authenticated users can delete tournament_team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete tournament_team_members" ON public.tournament_team_members FOR DELETE USING (true);


--
-- Name: tournament_teams Authenticated users can delete tournament_teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can delete tournament_teams" ON public.tournament_teams FOR DELETE USING (true);


--
-- Name: tournament_team_members Authenticated users can insert tournament_team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert tournament_team_members" ON public.tournament_team_members FOR INSERT WITH CHECK (true);


--
-- Name: tournament_teams Authenticated users can insert tournament_teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert tournament_teams" ON public.tournament_teams FOR INSERT WITH CHECK (true);


--
-- Name: tournament_teams Authenticated users can update tournament_teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update tournament_teams" ON public.tournament_teams FOR UPDATE USING (true);


--
-- Name: avatars Avatars manageable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Avatars manageable by admins" ON public.avatars USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: avatars Avatars readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Avatars readable by authenticated users" ON public.avatars FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: courses Content readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Content readable by authenticated users" ON public.courses FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: exercises Content readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Content readable by authenticated users" ON public.exercises FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: sessions Content readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Content readable by authenticated users" ON public.sessions FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: units Content readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Content readable by authenticated users" ON public.units FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: users Enable insert for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users" ON public.users FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: courses Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users only" ON public.courses FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: courses Enable read access for all authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all authenticated users" ON public.courses FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: users Enable read access for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for authenticated users" ON public.users FOR SELECT TO authenticated USING (true);


--
-- Name: courses Enable update for authenticated users only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update for authenticated users only" ON public.courses FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: users Enable update for users based on id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update for users based on id" ON public.users FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: exercise_folders Folders readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Folders readable by authenticated users" ON public.exercise_folders FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: missions Missions are viewable by all authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Missions are viewable by all authenticated users" ON public.missions FOR SELECT TO authenticated USING (true);


--
-- Name: giftcode_redemptions Service can insert redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service can insert redemptions" ON public.giftcode_redemptions FOR INSERT WITH CHECK (true);


--
-- Name: wild_area_logs Service can insert wild area logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service can insert wild area logs" ON public.wild_area_logs FOR INSERT WITH CHECK (true);


--
-- Name: notifications Service role can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: video_submissions Staff can update submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update submissions" ON public.video_submissions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role = 'admin'::text) OR (users.role = 'teacher'::text))))));


--
-- Name: video_submissions Staff can view all submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view all submissions" ON public.video_submissions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role = 'admin'::text) OR (users.role = 'teacher'::text))))));


--
-- Name: student_levels Student levels manageable by admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Student levels manageable by admins" ON public.student_levels USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: student_levels Student levels readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Student levels readable by authenticated users" ON public.student_levels FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: lesson_info Students can read lesson_info for enrolled courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can read lesson_info for enrolled courses" ON public.lesson_info FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.course_enrollments
  WHERE ((course_enrollments.course_id = lesson_info.course_id) AND (course_enrollments.student_id = auth.uid()) AND (course_enrollments.is_active = true)))));


--
-- Name: video_submissions Students can view all submissions for same exercise; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view all submissions for same exercise" ON public.video_submissions FOR SELECT USING (true);


--
-- Name: lesson_records Students can view their own lesson records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own lesson records" ON public.lesson_records FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: courses Students view enrolled courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students view enrolled courses" ON public.courses FOR SELECT USING (((id IN ( SELECT course_enrollments.course_id
   FROM public.course_enrollments
  WHERE ((course_enrollments.student_id = auth.uid()) AND (course_enrollments.is_active = true)))) OR (auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text))) OR (teacher_id = auth.uid())));


--
-- Name: course_enrollments Students view own enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students view own enrollments" ON public.course_enrollments FOR SELECT USING (((student_id = auth.uid()) AND (is_active = true)));


--
-- Name: weekly_xp_tracking System can insert weekly XP tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert weekly XP tracking" ON public.weekly_xp_tracking FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: weekly_xp_tracking System can update weekly XP tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can update weekly XP tracking" ON public.weekly_xp_tracking FOR UPDATE TO authenticated USING (true);


--
-- Name: lesson_info Teachers can delete lesson info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can delete lesson info" ON public.lesson_info FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.course_teachers ct
  WHERE ((ct.course_id = lesson_info.course_id) AND (ct.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))));


--
-- Name: lesson_records Teachers can delete lesson records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can delete lesson records" ON public.lesson_records FOR DELETE USING (((EXISTS ( SELECT 1
   FROM (public.lesson_info li
     JOIN public.course_teachers ct ON ((ct.course_id = li.course_id)))
  WHERE ((li.id = lesson_records.lesson_info_id) AND (ct.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))));


--
-- Name: lesson_info Teachers can insert lesson info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can insert lesson info" ON public.lesson_info FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.course_teachers ct
  WHERE ((ct.course_id = lesson_info.course_id) AND (ct.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))));


--
-- Name: lesson_records Teachers can insert lesson records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can insert lesson records" ON public.lesson_records FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.lesson_info li
     JOIN public.course_teachers ct ON ((ct.course_id = li.course_id)))
  WHERE ((li.id = lesson_records.lesson_info_id) AND (ct.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))));


--
-- Name: lesson_info Teachers can update lesson info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update lesson info" ON public.lesson_info FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.course_teachers ct
  WHERE ((ct.course_id = lesson_info.course_id) AND (ct.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))));


--
-- Name: lesson_records Teachers can update lesson records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update lesson records" ON public.lesson_records FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM (public.lesson_info li
     JOIN public.course_teachers ct ON ((ct.course_id = li.course_id)))
  WHERE ((li.id = lesson_records.lesson_info_id) AND (ct.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))));


--
-- Name: lesson_info Teachers can view lesson info; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view lesson info" ON public.lesson_info FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.course_teachers ct
  WHERE ((ct.course_id = lesson_info.course_id) AND (ct.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))));


--
-- Name: lesson_records Teachers can view lesson records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view lesson records" ON public.lesson_records FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (public.lesson_info li
     JOIN public.course_teachers ct ON ((ct.course_id = li.course_id)))
  WHERE ((li.id = lesson_records.lesson_info_id) AND (ct.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))));


--
-- Name: test_attempts Teachers update test attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers update test attempts" ON public.test_attempts FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));


--
-- Name: test_question_attempts Teachers update test question attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers update test question attempts" ON public.test_question_attempts FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));


--
-- Name: courses Teachers view assigned courses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers view assigned courses" ON public.courses FOR SELECT USING (((teacher_id = auth.uid()) OR (auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text)))));


--
-- Name: course_enrollments Teachers view course enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers view course enrollments" ON public.course_enrollments FOR SELECT USING (((course_id IN ( SELECT courses.id
   FROM public.courses
  WHERE (courses.teacher_id = auth.uid()))) OR (auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text)))));


--
-- Name: user_progress Teachers view student progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers view student progress" ON public.user_progress FOR SELECT USING (((user_id IN ( SELECT ce.student_id
   FROM (public.course_enrollments ce
     JOIN public.courses c ON ((c.id = ce.course_id)))
  WHERE ((c.teacher_id = auth.uid()) AND (ce.is_active = true)))) OR (auth.uid() = user_id) OR (auth.uid() IN ( SELECT users.id
   FROM public.users
  WHERE (users.role = 'admin'::text)))));


--
-- Name: test_attempts Teachers view test attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers view test attempts" ON public.test_attempts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));


--
-- Name: test_question_attempts Teachers view test question attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers view test question attempts" ON public.test_question_attempts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));


--
-- Name: avatar_uploads Users can delete own pending uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own pending uploads" ON public.avatar_uploads FOR DELETE USING (((auth.uid() = user_id) AND (status = 'pending'::text)));


--
-- Name: pvp_matchmaking Users can delete their own matchmaking rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own matchmaking rows" ON public.pvp_matchmaking FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: user_equipment Users can insert own equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own equipment" ON public.user_equipment FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_missions Users can insert own missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own missions" ON public.user_missions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: reports Users can insert own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own reports" ON public.reports FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: unit_reward_claims Users can insert own reward claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own reward claims" ON public.unit_reward_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: session_progress Users can insert own session progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own session progress" ON public.session_progress FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: video_submissions Users can insert own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own submissions" ON public.video_submissions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: session_reward_claims Users can insert their own session reward claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own session reward claims" ON public.session_reward_claims FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: report_messages Users can insert to own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert to own reports" ON public.report_messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND (sender_role = 'user'::text) AND (EXISTS ( SELECT 1
   FROM public.reports
  WHERE ((reports.id = report_messages.report_id) AND (reports.user_id = auth.uid()))))));


--
-- Name: notification_reads Users can manage own notification reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own notification reads" ON public.notification_reads USING ((user_id = auth.uid()));


--
-- Name: pet_question_bank Users can read active questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read active questions" ON public.pet_question_bank FOR SELECT USING ((is_active = true));


--
-- Name: pet_word_bank Users can read active words; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read active words" ON public.pet_word_bank FOR SELECT USING ((is_active = true));


--
-- Name: wild_area_logs Users can read all wild area logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read all wild area logs" ON public.wild_area_logs FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: user_chests Users can read own chests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own chests" ON public.user_chests FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_inventory Users can read own inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own inventory" ON public.user_inventory FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: notifications Users can read own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT USING (((user_id = auth.uid()) OR (user_id IS NULL)));


--
-- Name: user_purchases Users can read own purchases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own purchases" ON public.user_purchases FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: giftcode_redemptions Users can read own redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own redemptions" ON public.giftcode_redemptions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: report_messages Users can read own report messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own report messages" ON public.report_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.reports
  WHERE ((reports.id = report_messages.report_id) AND (reports.user_id = auth.uid())))));


--
-- Name: reports Users can read own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own reports" ON public.reports FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: pvp_matchmaking Users can update matchmaking rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update matchmaking rows" ON public.pvp_matchmaking FOR UPDATE TO authenticated USING (true);


--
-- Name: user_equipment Users can update own equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own equipment" ON public.user_equipment FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_missions Users can update own missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own missions" ON public.user_missions FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: reports Users can update own reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own reports" ON public.reports FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: session_progress Users can update own session progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own session progress" ON public.session_progress FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: avatar_uploads Users can upload avatars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can upload avatars" ON public.avatar_uploads FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: weekly_xp_tracking Users can view all weekly XP tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all weekly XP tracking" ON public.weekly_xp_tracking FOR SELECT TO authenticated USING (true);


--
-- Name: avatar_uploads Users can view own avatar uploads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own avatar uploads" ON public.avatar_uploads FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_missions Users can view own missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own missions" ON public.user_missions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: unit_reward_claims Users can view own reward claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own reward claims" ON public.unit_reward_claims FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: session_progress Users can view own session progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own session progress" ON public.session_progress FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: video_submissions Users can view own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own submissions" ON public.video_submissions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: session_reward_claims Users can view their own session reward claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own session reward claims" ON public.session_reward_claims FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_achievements Users manage own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own achievements" ON public.user_achievements USING ((auth.uid() = user_id));


--
-- Name: user_progress Users manage own progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own progress" ON public.user_progress USING ((auth.uid() = user_id));


--
-- Name: question_attempts Users manage own question attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own question attempts" ON public.question_attempts USING ((auth.uid() = user_id));


--
-- Name: test_attempts Users manage own test attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own test attempts" ON public.test_attempts USING ((user_id = auth.uid()));


--
-- Name: test_question_attempts Users manage own test question attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own test question attempts" ON public.test_question_attempts USING ((EXISTS ( SELECT 1
   FROM public.test_attempts
  WHERE ((test_attempts.id = test_question_attempts.test_attempt_id) AND (test_attempts.user_id = auth.uid())))));


--
-- Name: user_chests Users read own chests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own chests" ON public.user_chests FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_crafts Users read own crafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own crafts" ON public.user_crafts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_inventory Users read own inventory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own inventory" ON public.user_inventory FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: avatar_uploads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avatar_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: avatars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;

--
-- Name: chests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chests ENABLE ROW LEVEL SECURITY;

--
-- Name: class_war_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_war_members ENABLE ROW LEVEL SECURITY;

--
-- Name: class_war_members class_war_members_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_war_members_delete ON public.class_war_members FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));


--
-- Name: class_war_members class_war_members_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_war_members_insert ON public.class_war_members FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));


--
-- Name: class_war_members class_war_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_war_members_select ON public.class_war_members FOR SELECT USING (true);


--
-- Name: class_war_members class_war_members_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_war_members_update ON public.class_war_members FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));


--
-- Name: class_wars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_wars ENABLE ROW LEVEL SECURITY;

--
-- Name: class_wars class_wars_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_wars_delete ON public.class_wars FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));


--
-- Name: class_wars class_wars_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_wars_insert ON public.class_wars FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));


--
-- Name: class_wars class_wars_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_wars_select ON public.class_wars FOR SELECT USING (true);


--
-- Name: class_wars class_wars_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_wars_update ON public.class_wars FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'teacher'::text]))))));


--
-- Name: collectible_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.collectible_items ENABLE ROW LEVEL SECURITY;

--
-- Name: drop_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drop_config ENABLE ROW LEVEL SECURITY;

--
-- Name: giftcode_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.giftcode_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: giftcodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.giftcodes ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_info; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_info ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_records ENABLE ROW LEVEL SECURITY;

--
-- Name: live_battle_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.live_battle_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: live_battle_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.live_battle_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: missions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: pet_question_bank; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pet_question_bank ENABLE ROW LEVEL SECURITY;

--
-- Name: pet_word_bank; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pet_word_bank ENABLE ROW LEVEL SECURITY;

--
-- Name: recipes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

--
-- Name: report_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: session_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: session_reward_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_reward_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: course_enrollments teacher_read_enrollments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_read_enrollments ON public.course_enrollments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.courses c
  WHERE ((c.id = course_enrollments.course_id) AND (c.teacher_id = auth.uid())))));


--
-- Name: exercises teacher_read_exercises; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_read_exercises ON public.exercises FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.sessions s
     JOIN public.units u ON ((u.id = s.unit_id)))
     JOIN public.courses c ON ((c.id = u.course_id)))
  WHERE ((s.id = exercises.session_id) AND (c.teacher_id = auth.uid())))));


--
-- Name: sessions teacher_read_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_read_sessions ON public.sessions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.units u
     JOIN public.courses c ON ((c.id = u.course_id)))
  WHERE ((u.id = sessions.unit_id) AND (c.teacher_id = auth.uid())))));


--
-- Name: units teacher_read_units; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_read_units ON public.units FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.courses c
  WHERE ((c.id = units.course_id) AND (c.teacher_id = auth.uid())))));


--
-- Name: user_progress teacher_read_user_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_read_user_progress ON public.user_progress FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (((public.exercises e
     JOIN public.sessions s ON ((s.id = e.session_id)))
     JOIN public.units u ON ((u.id = s.unit_id)))
     JOIN public.courses c ON ((c.id = u.course_id)))
  WHERE ((e.id = user_progress.exercise_id) AND (c.teacher_id = auth.uid())))));


--
-- Name: test_question_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_question_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: unit_reward_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unit_reward_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: user_chests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_chests ENABLE ROW LEVEL SECURITY;

--
-- Name: user_crafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_crafts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: user_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: user_missions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_missions ENABLE ROW LEVEL SECURITY;

--
-- Name: video_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_xp_tracking; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weekly_xp_tracking ENABLE ROW LEVEL SECURITY;

--
-- Name: wild_area_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wild_area_logs ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict RlfkNPyFY2yxh5bJOHud1cYE1Ph3SL7IVkfuKGIDwIukL4IYnvIYTLUYgqMSKum

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
