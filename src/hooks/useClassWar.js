import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase/client';
import { useAuth } from './useAuth';
import { getSettings } from '../utils/siteSettings';

const useClassWar = (courseId) => {
  const { user } = useAuth();
  const [war, setWar] = useState(null);
  const [teamA, setTeamA] = useState([]);
  const [teamB, setTeamB] = useState([]);
  const [teamAXP, setTeamAXP] = useState(0);
  const [teamBXP, setTeamBXP] = useState(0);
  const [userTeam, setUserTeam] = useState(null);
  const [rewards, setRewards] = useState({ winner: null, loser: null });
  const [loading, setLoading] = useState(true);

  const fetchClassWar = useCallback(async () => {
    if (!courseId || !user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch active war for this course
      const { data: warData, error: warError } = await supabase
        .from('class_wars')
        .select('*')
        .eq('course_id', courseId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (warError) throw warError;
      if (!warData) {
        setWar(null);
        setTeamA([]);
        setTeamB([]);
        setTeamAXP(0);
        setTeamBXP(0);
        setUserTeam(null);
        setLoading(false);
        return;
      }

      setWar(warData);

      // Fetch all members with user info
      const { data: members, error: membersError } = await supabase
        .from('class_war_members')
        .select('user_id, team, users:user_id(id, full_name, real_name, avatar_url)')
        .eq('war_id', warData.id);

      if (membersError) throw membersError;

      const membersA = (members || []).filter(m => m.team === 'A');
      const membersB = (members || []).filter(m => m.team === 'B');
      const allMemberIds = (members || []).map(m => m.user_id);

      // Find which team the current user is on
      const currentMember = (members || []).find(m => m.user_id === user.id);
      setUserTeam(currentMember?.team || null);

      // Get exercise IDs for this course: units -> sessions -> exercise_assignments
      const { data: courseUnits } = await supabase
        .from('units')
        .select('id')
        .eq('course_id', courseId);
      const unitIds = (courseUnits || []).map(u => u.id);

      const xpByUser = {};

      if (unitIds.length > 0 && allMemberIds.length > 0) {
        const { data: courseSessions } = await supabase
          .from('sessions')
          .select('id')
          .in('unit_id', unitIds);
        const sessionIds = (courseSessions || []).map(s => s.id);

        if (sessionIds.length > 0) {
          const { data: courseExercises } = await supabase
            .from('exercise_assignments')
            .select('exercise_id')
            .in('session_id', sessionIds);
          const exerciseIds = [...new Set((courseExercises || []).map(e => e.exercise_id))];

          if (exerciseIds.length > 0) {
            // Fetch completed progress with pagination (matches leaderboard logic)
            let progressData = [];
            const PAGE_SIZE = 1000;
            let page = 0;
            while (true) {
              let progressQuery = supabase
                .from('user_progress')
                .select('user_id, exercise_id, score, max_score')
                .eq('status', 'completed')
                .in('user_id', allMemberIds)
                .in('exercise_id', exerciseIds)
                .gte('completed_at', warData.started_at);

              if (warData.ended_at) {
                progressQuery = progressQuery.lte('completed_at', warData.ended_at);
              }

              const { data: batch, error: progressError } = await progressQuery
                .order('completed_at', { ascending: true })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
              if (progressError) throw progressError;
              progressData = progressData.concat(batch);
              if (batch.length < PAGE_SIZE) break;
              page++;
            }

            // Fetch xp_reward for each exercise
            const { data: exercisesData } = await supabase
              .from('exercises')
              .select('id, xp_reward')
              .in('id', exerciseIds);
            const exerciseXpMap = {};
            (exercisesData || []).forEach(e => { exerciseXpMap[e.id] = e.xp_reward || 10; });

            // Calculate XP with bonus tiers (matches leaderboard logic)
            (progressData || []).forEach(p => {
              const baseXp = exerciseXpMap[p.exercise_id] || 10;
              const scorePercent = p.max_score > 0 ? (p.score / p.max_score) * 100 : 0;
              let xp = baseXp;
              if (scorePercent >= 95) xp = Math.round(baseXp * 1.5);
              else if (scorePercent >= 90) xp = Math.round(baseXp * 1.3);
              xpByUser[p.user_id] = (xpByUser[p.user_id] || 0) + xp;
            });
          }

          // Add chest XP from session_reward_claims (matches leaderboard logic)
          if (sessionIds.length > 0) {
            let chestQuery = supabase
              .from('session_reward_claims')
              .select('user_id, xp_awarded, claimed_at')
              .in('user_id', allMemberIds)
              .in('session_id', sessionIds)
              .gt('xp_awarded', 0)
              .gte('claimed_at', warData.started_at);

            if (warData.ended_at) {
              chestQuery = chestQuery.lte('claimed_at', warData.ended_at);
            }

            const { data: chestData } = await chestQuery;
            (chestData || []).forEach(claim => {
              xpByUser[claim.user_id] = (xpByUser[claim.user_id] || 0) + claim.xp_awarded;
            });
          }
        }
      }

      // Add XP from live battles
      if (allMemberIds.length > 0) {
        let battleQuery = supabase
          .from('live_battle_sessions')
          .select('id, finished_at')
          .eq('course_id', courseId)
          .eq('status', 'finished')
          .gte('finished_at', warData.started_at);

        if (warData.ended_at) {
          battleQuery = battleQuery.lte('finished_at', warData.ended_at);
        }

        const { data: battles } = await battleQuery;
        const battleIds = (battles || []).map(b => b.id);

        if (battleIds.length > 0) {
          const { data: battleParts } = await supabase
            .from('live_battle_participants')
            .select('user_id, xp_awarded')
            .in('session_id', battleIds)
            .in('user_id', allMemberIds)
            .gt('xp_awarded', 0);

          (battleParts || []).forEach(p => {
            xpByUser[p.user_id] = (xpByUser[p.user_id] || 0) + p.xp_awarded;
          });
        }
      }

      // Build team arrays with XP
      const buildTeam = (teamMembers) =>
        teamMembers
          .map(m => ({
            id: m.user_id,
            name: m.users?.full_name || 'Unknown',
            real_name: m.users?.real_name || null,
            avatar_url: m.users?.avatar_url || null,
            xp: xpByUser[m.user_id] || 0,
          }))
          .sort((a, b) => b.xp - a.xp);

      const teamAData = buildTeam(membersA);
      const teamBData = buildTeam(membersB);

      // Add supporters to smaller team (each mirrors lowest XP player)
      if (teamAData.length !== teamBData.length && teamAData.length > 0 && teamBData.length > 0) {
        const smallerTeam = teamAData.length < teamBData.length ? teamAData : teamBData;
        const largerTeam = teamAData.length > teamBData.length ? teamAData : teamBData;
        const diff = largerTeam.length - smallerTeam.length;
        const lowest = smallerTeam[smallerTeam.length - 1]; // already sorted desc
        for (let i = 0; i < diff; i++) {
          smallerTeam.push({
            id: `supporter-${i}`,
            name: `Supporter ${diff > 1 ? i + 1 : ''} (${lowest.name})`,
            avatar_url: null,
            xp: lowest.xp,
            isSupporter: true,
          });
        }
      }

      setTeamA(teamAData);
      setTeamB(teamBData);
      setTeamAXP(teamAData.reduce((sum, m) => sum + m.xp, 0));
      setTeamBXP(teamBData.reduce((sum, m) => sum + m.xp, 0));

      // Fetch reward settings (shared cache)
      const rewardMap = await getSettings(['class_war_winner_rewards', 'class_war_loser_rewards']);
      const emptyR = { xp: 0, gems: 0, items: [] };
      let winR = emptyR, losR = emptyR;
      try { if (rewardMap.class_war_winner_rewards) winR = { ...emptyR, ...JSON.parse(rewardMap.class_war_winner_rewards) }; } catch {}
      try { if (rewardMap.class_war_loser_rewards) losR = { ...emptyR, ...JSON.parse(rewardMap.class_war_loser_rewards) }; } catch {}
      // Enrich items with image_url from collectible_items
      const allItems = [...(winR.items || []), ...(losR.items || [])];
      const missingIds = allItems.filter(i => !i.image_url && i.item_id).map(i => i.item_id);
      if (missingIds.length > 0) {
        const { data: itemData } = await supabase
          .from('collectible_items')
          .select('id, image_url')
          .in('id', missingIds);
        const imgMap = Object.fromEntries((itemData || []).map(i => [i.id, i.image_url]));
        [winR, losR].forEach(r => {
          (r.items || []).forEach(i => { if (!i.image_url && imgMap[i.item_id]) i.image_url = imgMap[i.item_id]; });
        });
      }
      setRewards({ winner: winR, loser: losR });
    } catch (err) {
      console.error('Error fetching class war:', err);
    } finally {
      setLoading(false);
    }
  }, [courseId, user]);

  useEffect(() => {
    fetchClassWar();
  }, [fetchClassWar]);

  return { war, teamA, teamB, teamAXP, teamBXP, userTeam, rewards, loading, refresh: fetchClassWar };
};

export default useClassWar;
