-- ============================================================
-- get_notifications RPC
-- One server-side call replacing the 3-4 separate queries the notification
-- poller fired every cycle (user notifs + broadcast + cohort_members +
-- cohort notifs + notification_reads). Those were collectively the single
-- biggest source of PostgREST egress (rows 3/4/5/9 in pg_stat_statements).
--
-- Returns the merged, deduped, read-status-resolved notification list,
-- mirroring the old client-side logic exactly:
--   * user-specific notifs use their own is_read column
--   * broadcast (user_id NULL, cohort_id NULL) + cohort-targeted notifs
--     resolve is_read from notification_reads
--   * mission_reward type filtered out (handled by celebration overlay)
--   * newest first, capped at 50
--
-- NOTE: users.id == auth uid == cohort_members.student_id, so a single
-- p_user_id parameter covers user notifs, cohort membership, and reads.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_notifications(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  type text,
  title text,
  message text,
  icon text,
  data jsonb,
  is_read boolean,
  cohort_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.get_notifications(uuid) TO anon, authenticated;
