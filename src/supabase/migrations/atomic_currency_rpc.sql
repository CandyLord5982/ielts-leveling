-- Atomic XP / gem mutations to prevent lost updates.
--
-- Previously the client read profile.xp / profile.gems into JS, added a delta,
-- and wrote back an ABSOLUTE value. When any server-side RPC (daily challenge,
-- missions, chests, item drops, class war, tournaments, giftcodes, etc.) awarded
-- currency concurrently — or the client profile was simply stale — the absolute
-- write clobbered the newer balance and students "lost" XP/gems.
--
-- These functions do the arithmetic in the database under a row lock, so
-- concurrent awards can never overwrite each other. Level is recomputed from the
-- new xp total using the app formula: floor(xp / 1000) + 1.

-- Add or subtract xp and/or gems atomically. Deltas may be negative.
-- Returns the updated row so the client can refresh without a second read.
CREATE OR REPLACE FUNCTION increment_user_currency(
  p_user_id uuid,
  p_xp integer DEFAULT 0,
  p_gems integer DEFAULT 0
)
RETURNS TABLE (xp integer, gems integer, level integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Atomically spend gems: deducts only if the current balance is sufficient.
-- The balance check and the deduction happen in one statement, so it cannot
-- over-spend or race with concurrent awards.
-- Returns success=false with the current balance when there aren't enough gems.
CREATE OR REPLACE FUNCTION spend_user_gems(
  p_user_id uuid,
  p_amount integer
)
RETURNS TABLE (success boolean, gems integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Atomically spend xp: same contract as spend_user_gems, and recomputes level.
CREATE OR REPLACE FUNCTION spend_user_xp(
  p_user_id uuid,
  p_amount integer
)
RETURNS TABLE (success boolean, xp integer, level integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION increment_user_currency(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION spend_user_gems(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION spend_user_xp(uuid, integer) TO authenticated;
