-- Harden attempt_catch_pet (based on the live production definition, not older repo copies).
--
-- Fixes:
--  1. Caller check: callers may only catch for themselves. Previously anyone logged in could pass
--     another user's id, spending that user's balls and catching pets onto their account.
--  2. Encounter check: the pet must have been met in the Wild Area (an 'encounter' row in
--     wild_area_logs, written by roll_wild_area_encounter) within the last 3 hours, and that
--     encounter must not be used up (caught already, or both throws spent). Previously any active
--     pet id could be "caught" directly, e.g. a legendary, without playing.
--     roll_wild_area_encounter is the only encounter source in production (roll_pet_encounter does
--     not exist there and nothing fires the 'pet-encounter' event), so normal play is unaffected.
--  3. Only logged-in users can execute it (it was executable by PUBLIC, including anon).
--
-- Everything else (catch_rates matrix, duplicate refunds, logging, return shape) is unchanged.
-- The client allows 2 throws per encounter (WildEncounterModal attemptsLeft); keep MAX_THROWS in sync.

BEGIN;

CREATE OR REPLACE FUNCTION public.attempt_catch_pet(p_user_id uuid, p_pet_id uuid, p_ball_item_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  last_encounter_at timestamptz;
  throws_used integer;
  caught_since boolean;
BEGIN
  -- 1. Callers may only catch for themselves
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'forbidden');
  END IF;

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

  -- 2. The pet must come from a recent, unfinished Wild Area encounter (checked before the ball is spent)
  SELECT max(created_at) INTO last_encounter_at
  FROM wild_area_logs
  WHERE user_id = p_user_id AND pet_id = p_pet_id AND action = 'encounter'
    AND created_at > now() - interval '3 hours';

  IF last_encounter_at IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'no_encounter');
  END IF;

  SELECT count(*), coalesce(bool_or(action = 'catch_success'), false)
  INTO throws_used, caught_since
  FROM wild_area_logs
  WHERE user_id = p_user_id AND pet_id = p_pet_id
    AND action IN ('catch_fail', 'catch_success')
    AND created_at >= last_encounter_at;

  IF caught_since OR throws_used >= 2 THEN  -- MAX_THROWS = 2
    RETURN json_build_object('success', false, 'error', 'encounter_over');
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
$function$;

-- 3. Logged-in users only (it was executable by PUBLIC, including anon)
REVOKE ALL ON FUNCTION public.attempt_catch_pet(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attempt_catch_pet(uuid, uuid, uuid) TO authenticated, service_role;

COMMIT;
