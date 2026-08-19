-- ====================================
-- WILD AREA ENCOUNTER LOGS
-- Run this in Supabase SQL Editor
-- ====================================

-- 1. Create wild_area_logs table
CREATE TABLE IF NOT EXISTS public.wild_area_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  pet_id uuid REFERENCES public.pets(id) ON DELETE SET NULL,
  pet_name text,
  pet_rarity text,
  ball_item_id uuid REFERENCES public.collectible_items(id) ON DELETE SET NULL,
  ball_name text,
  action text NOT NULL CHECK (action IN ('encounter', 'catch_success', 'catch_fail')),
  is_duplicate boolean DEFAULT false,
  refund_xp integer DEFAULT 0,
  catch_rate integer,
  created_at timestamptz DEFAULT now()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_wild_area_logs_user_id ON public.wild_area_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_wild_area_logs_created_at ON public.wild_area_logs(created_at DESC);

-- RLS
ALTER TABLE public.wild_area_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read all wild area logs" ON public.wild_area_logs;
CREATE POLICY "Admins can read all wild area logs"
  ON public.wild_area_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Users can read own wild area logs" ON public.wild_area_logs;
CREATE POLICY "Users can read own wild area logs"
  ON public.wild_area_logs FOR SELECT
  USING (user_id = auth.uid());

-- Service role / RPC can insert
DROP POLICY IF EXISTS "Service can insert wild area logs" ON public.wild_area_logs;
CREATE POLICY "Service can insert wild area logs"
  ON public.wild_area_logs FOR INSERT
  WITH CHECK (true);


-- ====================================
-- 2. Update roll_wild_area_encounter to log encounters
-- ====================================
DROP FUNCTION IF EXISTS roll_wild_area_encounter(uuid);
CREATE OR REPLACE FUNCTION roll_wild_area_encounter(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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


-- ====================================
-- 3. Update attempt_catch_pet to log catch results
-- ====================================
DROP FUNCTION IF EXISTS attempt_catch_pet(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION attempt_catch_pet(p_user_id uuid, p_pet_id uuid, p_ball_item_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ball_record record;
  pet_record record;
  user_ball_qty integer;
  catch_config jsonb;
  ball_bonus float;
  pet_difficulty float;
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

  -- Get catch rate config
  SELECT config_value INTO catch_config
  FROM drop_config WHERE config_key = 'catch_rates';

  IF catch_config IS NULL THEN
    ball_bonus := 0.30;
    pet_difficulty := 0.50;
  ELSE
    ball_bonus := COALESCE((catch_config->'ball_bonus'->>ball_record.rarity)::float, 0.30);
    pet_difficulty := COALESCE((catch_config->'pet_difficulty'->>pet_record.rarity)::float, 0.50);
  END IF;

  final_rate := LEAST(1.0, ball_bonus + pet_difficulty);

  -- Roll for catch
  roll := random();
  caught := roll <= final_rate;

  IF NOT caught THEN
    -- Log catch failure
    INSERT INTO wild_area_logs (user_id, pet_id, pet_name, pet_rarity, ball_item_id, ball_name, action, catch_rate)
    VALUES (p_user_id, p_pet_id, pet_record.name, pet_record.rarity, p_ball_item_id, ball_record.name, 'catch_fail', round(final_rate * 100)::integer);

    RETURN json_build_object(
      'success', true,
      'caught', false,
      'catch_rate', round(final_rate * 100),
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
      WHEN 'common' THEN 5
      WHEN 'uncommon' THEN 10
      WHEN 'rare' THEN 20
      WHEN 'epic' THEN 50
      WHEN 'legendary' THEN 100
      ELSE 5
    END;
    UPDATE users SET xp = xp + refund_amount WHERE id = p_user_id;

    -- Log duplicate catch
    INSERT INTO wild_area_logs (user_id, pet_id, pet_name, pet_rarity, ball_item_id, ball_name, action, is_duplicate, refund_xp, catch_rate)
    VALUES (p_user_id, p_pet_id, pet_record.name, pet_record.rarity, p_ball_item_id, ball_record.name, 'catch_success', true, refund_amount, round(final_rate * 100)::integer);

    RETURN json_build_object(
      'success', true,
      'caught', true,
      'duplicate', true,
      'refund_xp', refund_amount,
      'pet', json_build_object('id', pet_record.id, 'name', pet_record.name,
        'image_url', pet_record.image_url, 'rarity', pet_record.rarity),
      'catch_rate', round(final_rate * 100)
    );
  END IF;

  -- Create user_pet
  INSERT INTO user_pets (user_id, pet_id)
  VALUES (p_user_id, p_pet_id)
  RETURNING id INTO new_user_pet_id;

  -- Log successful catch
  INSERT INTO wild_area_logs (user_id, pet_id, pet_name, pet_rarity, ball_item_id, ball_name, action, catch_rate)
  VALUES (p_user_id, p_pet_id, pet_record.name, pet_record.rarity, p_ball_item_id, ball_record.name, 'catch_success', round(final_rate * 100)::integer);

  RETURN json_build_object(
    'success', true,
    'caught', true,
    'duplicate', false,
    'user_pet_id', new_user_pet_id,
    'pet', json_build_object('id', pet_record.id, 'name', pet_record.name,
      'image_url', pet_record.image_url, 'rarity', pet_record.rarity,
      'description', pet_record.description),
    'catch_rate', round(final_rate * 100)
  );
END;
$$;
