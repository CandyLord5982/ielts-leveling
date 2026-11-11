-- Wild Area zones: the player picks a zone before searching; each zone scales the
-- base rarity weights (drop_config.pet_encounter.rarity_weights) by a multiplier.
-- Keep the multipliers in sync with src/utils/wildZones.js (display copy).
--
-- Adds an optional p_zone parameter (defaults to NULL = no zone, base weights),
-- so clients that still call roll_wild_area_encounter(p_user_id) keep working.
-- Apply this BEFORE deploying the frontend that sends p_zone.
--
-- Also fixes: if the rolled rarity has no active pets, fall back to any rarity
-- that does, instead of returning "no pet" after the ticket was already spent.

BEGIN;

-- Drop the one-arg version so the new defaulted signature isn't ambiguous
DROP FUNCTION IF EXISTS public.roll_wild_area_encounter(uuid);

CREATE OR REPLACE FUNCTION public.roll_wild_area_encounter(p_user_id uuid, p_zone text DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  config_val jsonb;
  cooldown_minutes integer;
  last_encounter timestamptz;
  user_role text;
  ticket_item_id uuid;
  ticket_qty integer;
  rarity_weights jsonb;
  zone_mult jsonb;
  total_weight numeric;
  rarity_roll numeric;
  selected_rarity text;
  cumulative_weight numeric;
  rarity_key text;
  rarity_value numeric;
  selected_pet record;
  v_daily_limit integer;
  v_today_count integer;
  v_today_start timestamptz;
BEGIN
  -- Callers may only roll for themselves (previously any caller could spend
  -- another user's tickets by passing their id)
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN json_build_object('encountered', false, 'error', 'forbidden');
  END IF;

  SELECT config_value INTO config_val
  FROM drop_config WHERE config_key = 'pet_encounter';

  IF config_val IS NULL OR NOT COALESCE((config_val->>'wild_area_enabled')::boolean, false) THEN
    RETURN json_build_object('encountered', false, 'error', 'Wild area disabled');
  END IF;

  -- Zone multipliers (unknown / NULL zone = no modifier)
  zone_mult := CASE p_zone
    WHEN 'forest'  THEN '{"common":1.4,"uncommon":1,"rare":0.6,"epic":0.5,"legendary":0.5}'::jsonb
    WHEN 'swamp'   THEN '{"common":0.8,"uncommon":1.6,"rare":1,"epic":1,"legendary":1}'::jsonb
    WHEN 'caves'   THEN '{"common":0.6,"uncommon":1,"rare":2,"epic":1.2,"legendary":1}'::jsonb
    WHEN 'frozen'  THEN '{"common":0.4,"uncommon":0.8,"rare":1.6,"epic":2.5,"legendary":1.5}'::jsonb
    WHEN 'volcano' THEN '{"common":0.3,"uncommon":0.6,"rare":1.4,"epic":4,"legendary":2}'::jsonb
    WHEN 'ruins'   THEN '{"common":0.2,"uncommon":0.4,"rare":1.2,"epic":3,"legendary":5}'::jsonb
    ELSE '{}'::jsonb
  END;

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

  -- Roll rarity: base weight × zone multiplier
  rarity_weights := config_val->'rarity_weights';

  total_weight := 0;
  FOR rarity_key, rarity_value IN SELECT key, value::numeric FROM jsonb_each_text(rarity_weights)
  LOOP
    total_weight := total_weight + rarity_value * COALESCE((zone_mult->>rarity_key)::numeric, 1);
  END LOOP;

  rarity_roll := random() * total_weight;
  cumulative_weight := 0;
  selected_rarity := 'common';

  FOR rarity_key, rarity_value IN SELECT key, value::numeric FROM jsonb_each_text(rarity_weights)
  LOOP
    cumulative_weight := cumulative_weight + rarity_value * COALESCE((zone_mult->>rarity_key)::numeric, 1);
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

  -- No pets of that rarity at all: fall back to any active pet so the ticket isn't wasted
  IF selected_pet IS NULL THEN
    SELECT * INTO selected_pet
    FROM pets
    WHERE is_active = true
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
    'zone', p_zone,
    'pet', jsonb_build_object(
      'id', selected_pet.id,
      'name', selected_pet.name,
      'image_url', selected_pet.image_url,
      'rarity', selected_pet.rarity,
      'description', selected_pet.description
    )
  );
END;
$function$;

-- Logged-in users only (the old function was also executable by anon)
REVOKE ALL ON FUNCTION public.roll_wild_area_encounter(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roll_wild_area_encounter(uuid, text) TO authenticated, service_role;

COMMIT;
