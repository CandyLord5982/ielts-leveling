import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';
import { Save, RefreshCw, Play, Pause, Trophy, Settings, X, Gift, Compass } from 'lucide-react';

import { assetUrl } from '../../hooks/useBranding';
import { invalidateSiteSettings } from '../../utils/siteSettings';
const ALL_TABS = [
  { key: 'week', label: 'Tuần này (Weekly XP)' },
  { key: 'month', label: 'Tháng này (Monthly XP)' },
  { key: 'training', label: 'Competition' },
];

const GAME_TYPES = [
  { key: 'scramble', label: 'Word Scramble', icon: '🔤' },
  { key: 'whackmole', label: 'Whack-a-Mole', icon: '🔨' },
  { key: 'catch', label: 'Hungry Pet', icon: '🎯' },
  { key: 'flappy', label: 'Flappy Pet', icon: '🐦' },
  { key: 'astroblast', label: 'Astro Blast', icon: '🚀' },
  { key: 'matchgame', label: 'Match Up', icon: '🧩' },
  { key: 'wordtype', label: 'Word Type', icon: '⌨️' },
  { key: 'bombparty', label: 'Bomb Defuse', icon: '💣' },
  { key: 'sayitright', label: 'Say It Right', icon: '🎤' },
  { key: 'quizrush', label: 'Quiz Rush', icon: '❓' },
  { key: 'bossbattle', label: 'Boss Battle', icon: '⚔️' },
  { key: 'angrypet', label: 'Angry Pet', icon: '🏹' },
  { key: 'fishing', label: 'Fishing Frenzy', icon: '🎣' },
];

const TRAINING_GAMES = [
  { key: 'scramble', label: 'Word Scramble', icon: '🔤' },
  { key: 'whackmole', label: 'Whack-a-Mole', icon: '🔨' },
  { key: 'flappy', label: 'Flappy Pet', icon: '🐦' },
  { key: 'astroblast', label: 'Astro Blast', icon: '🚀' },
  { key: 'matchgame', label: 'Match Up', icon: '🧩' },
  { key: 'wordtype', label: 'Word Type', icon: '⌨️' },
  { key: 'bombparty', label: 'Bomb Defuse', icon: '💣' },
  { key: 'sayitright', label: 'Say It Right', icon: '🎤' },
  { key: 'quizrush', label: 'Quiz Rush', icon: '❓' },
  { key: 'bossbattle', label: 'Boss Battle', icon: '⚔️' },
  { key: 'angrypet', label: 'Angry Pet', icon: '🏹' },
  { key: 'fishing', label: 'Fishing Frenzy', icon: '🎣' },
];

const LeaderboardSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  // Settings state
  const [visibleTabs, setVisibleTabs] = useState(['week', 'month', 'training']);
  const [defaultTab, setDefaultTab] = useState('training');
  const [competitionActive, setCompetitionActive] = useState(true);
  const [competitionType, setCompetitionType] = useState('game'); // 'game' or 'items'
  const [competitionGameType, setCompetitionGameType] = useState('scramble');
  const [competitionItemId, setCompetitionItemId] = useState('');
  const [rewardThreshold, setRewardThreshold] = useState(0); // minimum score to qualify for XP reward
  const [rewardXP, setRewardXP] = useState(5); // XP given to all qualifiers
  // Top 1/2/3 + grouped 4-6, 7-10 rewards
  const DEFAULT_TOP_REWARDS = [
    { rank: 1, gems: 1, xp: 0, shop_items: [] },
    { rank: 2, gems: 0, xp: 0, shop_items: [] },
    { rank: 3, gems: 0, xp: 0, shop_items: [] },
    { rank: '4-6', gems: 0, xp: 100, shop_items: [] },
    { rank: '7-10', gems: 0, xp: 50, shop_items: [] },
  ];
  const [topRewards, setTopRewards] = useState(DEFAULT_TOP_REWARDS);
  const [maxAttempts, setMaxAttempts] = useState(0); // 0 = unlimited
  const [competitionEndDate, setCompetitionEndDate] = useState(''); // ISO date string e.g. '2026-03-10'
  const [enabledTrainingGames, setEnabledTrainingGames] = useState(['scramble', 'whackmole', 'astroblast']);

  // PvP Schedule
  const [pvpEnabled, setPvpEnabled] = useState(true);
  const [pvpStartTime, setPvpStartTime] = useState('');
  const [pvpEndTime, setPvpEndTime] = useState('');
  const [quickmatchGameType, setQuickmatchGameType] = useState('wordtype');

  // Chest Settings
  const [chestEnabled, setChestEnabled] = useState(true);
  const [chestStartTime, setChestStartTime] = useState('');
  const [chestEndTime, setChestEndTime] = useState('');
  const [chestDailyLimit, setChestDailyLimit] = useState(3);

  // Maze Adventure Settings
  const [mazeEnabled, setMazeEnabled] = useState(true);
  const [mazeStartTime, setMazeStartTime] = useState('');
  const [mazeEndTime, setMazeEndTime] = useState('');
  const [mazeDailyLimit, setMazeDailyLimit] = useState(5);

  // Collectible items for "most items" competition
  const [collectibleItems, setCollectibleItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);


  useEffect(() => {
    fetchSettings();
    fetchCollectibleItems();
  }, []);

  const fetchCollectibleItems = async () => {
    try {
      setItemsLoading(true);
      const { data } = await supabase
        .from('collectible_items')
        .select('id, name, image_url, item_type, set_name, rarity')
        .eq('is_active', true)
        .order('set_name')
        .order('name');
      setCollectibleItems(data || []);
    } catch (err) {
      console.error('Error fetching collectible items:', err);
    } finally {
      setItemsLoading(false);
    }
  };


  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('site_settings')
        .select('setting_key, setting_value')
        .in('setting_key', [
          'leaderboard_visible_tabs',
          'leaderboard_default_tab',
          'leaderboard_competition_active',
          'leaderboard_competition_type',
          'leaderboard_competition_game_type',
          'leaderboard_competition_item_id',
          'leaderboard_competition_rewards',
          'leaderboard_competition_reward_gems',
          'leaderboard_competition_reward_threshold',
          'leaderboard_competition_reward_xp',
          'leaderboard_competition_max_attempts',
          'leaderboard_competition_end_date',
          'pet_training_enabled_games',
          'pvp_enabled',
          'pvp_start_time',
          'pvp_end_time',
          'quickmatch_game_type',
          'chest_enabled',
          'chest_start_time',
          'chest_end_time',
          'chest_daily_limit',
          'maze_enabled',
          'maze_start_time',
          'maze_end_time',
          'maze_daily_limit',
        ]);

      if (error) throw error;

      data?.forEach((row) => {
        switch (row.setting_key) {
          case 'leaderboard_visible_tabs':
            try { setVisibleTabs(JSON.parse(row.setting_value)); } catch {}
            break;
          case 'leaderboard_default_tab':
            setDefaultTab(row.setting_value);
            break;
          case 'leaderboard_competition_active':
            setCompetitionActive(row.setting_value === 'true');
            break;
          case 'leaderboard_competition_type':
            setCompetitionType(row.setting_value);
            break;
          case 'leaderboard_competition_game_type':
            setCompetitionGameType(row.setting_value);
            break;
          case 'leaderboard_competition_item_id':
            setCompetitionItemId(row.setting_value);
            break;
          case 'leaderboard_competition_rewards':
            try {
              const saved = JSON.parse(row.setting_value);
              // Merge with defaults: keep saved entries, add any missing rank groups
              const savedRanks = new Set(saved.map(r => String(r.rank)));
              const merged = [...saved, ...DEFAULT_TOP_REWARDS.filter(d => !savedRanks.has(String(d.rank)))];
              setTopRewards(merged);
            } catch { /* ignore malformed JSON */ }
            break;
          case 'leaderboard_competition_reward_gems':
            // Legacy: migrate old single gem reward to top rewards if no new format exists
            break;
          case 'leaderboard_competition_reward_threshold':
            setRewardThreshold(parseInt(row.setting_value) || 0);
            break;
          case 'leaderboard_competition_reward_xp':
            setRewardXP(parseInt(row.setting_value) || 5);
            break;
          case 'leaderboard_competition_max_attempts':
            setMaxAttempts(parseInt(row.setting_value) || 0);
            break;
          case 'leaderboard_competition_end_date':
            setCompetitionEndDate(row.setting_value || '');
            break;
          case 'pet_training_enabled_games':
            try { setEnabledTrainingGames(JSON.parse(row.setting_value)); } catch {}
            break;
          case 'pvp_enabled':
            setPvpEnabled(row.setting_value !== 'false');
            break;
          case 'pvp_start_time':
            setPvpStartTime(row.setting_value || '');
            break;
          case 'pvp_end_time':
            setPvpEndTime(row.setting_value || '');
            break;
          case 'quickmatch_game_type':
            setQuickmatchGameType(row.setting_value || 'wordtype');
            break;
          case 'chest_enabled':
            setChestEnabled(row.setting_value !== 'false');
            break;
          case 'chest_start_time':
            setChestStartTime(row.setting_value || '');
            break;
          case 'chest_end_time':
            setChestEndTime(row.setting_value || '');
            break;
          case 'chest_daily_limit':
            setChestDailyLimit(parseInt(row.setting_value) || 3);
            break;
          case 'maze_enabled':
            setMazeEnabled(row.setting_value !== 'false');
            break;
          case 'maze_start_time':
            setMazeStartTime(row.setting_value || '');
            break;
          case 'maze_end_time':
            setMazeEndTime(row.setting_value || '');
            break;
          case 'maze_daily_limit':
            setMazeDailyLimit(parseInt(row.setting_value) || 5);
            break;
        }
      });
    } catch (err) {
      console.error('Error fetching leaderboard settings:', err);
      showNotification('Error loading settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleSave = async () => {
    if (visibleTabs.length === 0) {
      showNotification('At least one tab must be visible', 'error');
      return;
    }

    if (competitionType === 'items' && !competitionItemId) {
      showNotification('Please select a collectible item for the competition', 'error');
      return;
    }

    const effectiveDefault = visibleTabs.includes(defaultTab) ? defaultTab : visibleTabs[0];

    try {
      setSaving(true);

      const settings = [
        { setting_key: 'leaderboard_visible_tabs', setting_value: JSON.stringify(visibleTabs), description: 'Visible leaderboard tabs' },
        { setting_key: 'leaderboard_default_tab', setting_value: effectiveDefault, description: 'Default leaderboard tab' },
        { setting_key: 'leaderboard_competition_active', setting_value: String(competitionActive), description: 'Whether competition is active' },
        { setting_key: 'leaderboard_competition_type', setting_value: competitionType, description: 'Competition type: game or items' },
        { setting_key: 'leaderboard_competition_game_type', setting_value: competitionGameType, description: 'Which game type for competition' },
        { setting_key: 'leaderboard_competition_item_id', setting_value: competitionItemId, description: 'Item ID for collection competition' },
        { setting_key: 'leaderboard_competition_rewards', setting_value: JSON.stringify(topRewards), description: 'Top 1/2/3 rewards config' },
        { setting_key: 'leaderboard_competition_reward_threshold', setting_value: String(rewardThreshold), description: 'Minimum score to qualify for XP reward' },
        { setting_key: 'leaderboard_competition_reward_xp', setting_value: String(rewardXP), description: 'XP reward for all qualifiers' },
        { setting_key: 'leaderboard_competition_max_attempts', setting_value: String(maxAttempts), description: 'Max attempts per week (0 = unlimited)' },
        { setting_key: 'leaderboard_competition_end_date', setting_value: competitionEndDate, description: 'Competition end date (ISO)' },
        { setting_key: 'pet_training_enabled_games', setting_value: JSON.stringify(enabledTrainingGames), description: 'Which training games are available to students' },
        { setting_key: 'pvp_enabled', setting_value: String(pvpEnabled), description: 'Whether PvP battles are enabled' },
        { setting_key: 'pvp_start_time', setting_value: pvpStartTime, description: 'PvP allowed start time (HH:MM)' },
        { setting_key: 'pvp_end_time', setting_value: pvpEndTime, description: 'PvP allowed end time (HH:MM)' },
        { setting_key: 'quickmatch_game_type', setting_value: quickmatchGameType, description: 'Which game type for quick match' },
        { setting_key: 'chest_enabled', setting_value: String(chestEnabled), description: 'Whether game chests are enabled' },
        { setting_key: 'chest_start_time', setting_value: chestStartTime, description: 'Chest allowed start time (HH:MM)' },
        { setting_key: 'chest_end_time', setting_value: chestEndTime, description: 'Chest allowed end time (HH:MM)' },
        { setting_key: 'chest_daily_limit', setting_value: String(chestDailyLimit), description: 'Max chests per student per day' },
        { setting_key: 'maze_enabled', setting_value: String(mazeEnabled), description: 'Whether maze adventure is enabled' },
        { setting_key: 'maze_start_time', setting_value: mazeStartTime, description: 'Maze allowed start time (HH:MM)' },
        { setting_key: 'maze_end_time', setting_value: mazeEndTime, description: 'Maze allowed end time (HH:MM)' },
        { setting_key: 'maze_daily_limit', setting_value: String(mazeDailyLimit), description: 'Max maze adventures per student per day' },
      ];

      for (const s of settings) {
        const { error } = await supabase
          .from('site_settings')
          .upsert(s, { onConflict: 'setting_key' });
        if (error) throw error;
      }

      invalidateSiteSettings(); // students pick up new config on next read
      setDefaultTab(effectiveDefault);
      showNotification('Settings saved successfully!');
    } catch (err) {
      console.error('Error saving settings:', err);
      showNotification('Error saving settings: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const [ending, setEnding] = useState(false);

  const handleEndCompetition = async () => {
    if (!window.confirm('End competition and award top players? This will distribute rewards and pause the competition.')) return;

    try {
      setEnding(true);

      if (competitionType === 'game') {
        // Find top scorers across all training_scores for this game type
        const { data: scores } = await supabase
          .from('training_scores')
          .select('user_id, score')
          .eq('game_type', competitionGameType)
          .order('score', { ascending: false })
          .limit(100);

        if (!scores || scores.length === 0) {
          showNotification('No players found — nobody played this competition.', 'error');
          return;
        }

        // Get best score per user
        const bestScores = {};
        scores.forEach(s => {
          if (!bestScores[s.user_id] || s.score > bestScores[s.user_id]) {
            bestScores[s.user_id] = s.score;
          }
        });

        const sorted = Object.entries(bestScores).sort((a, b) => b[1] - a[1]);

        // Award XP to all qualifiers who passed the threshold
        const qualifiers = sorted.filter(([, score]) => rewardThreshold > 0 ? score >= rewardThreshold : false);
        if (rewardXP > 0 && qualifiers.length > 0) {
          for (const [userId] of qualifiers) {
            await supabase.rpc('increment_user_currency', { p_user_id: userId, p_xp: rewardXP, p_gems: 0 });
          }
        }

        // Expand grouped rewards (e.g. '4-6' → ranks 4,5,6) into per-rank list
        const expandedRewards = [];
        for (const reward of topRewards) {
          if (typeof reward.rank === 'string' && reward.rank.includes('-')) {
            const [start, end] = reward.rank.split('-').map(Number);
            for (let r = start; r <= end; r++) {
              expandedRewards.push({ ...reward, rank: r });
            }
          } else {
            expandedRewards.push({ ...reward, rank: Number(reward.rank) });
          }
        }

        // Award top rewards
        const awardedNames = [];
        const awardedUserIds = [];

        for (let i = 0; i < Math.min(sorted.length, expandedRewards.length); i++) {
          const reward = expandedRewards[i];
          const [userId, userScore] = sorted[i];
          const hasReward = reward.gems > 0 || reward.xp > 0 || reward.shop_items.length > 0;
          if (!hasReward) continue;

          awardedUserIds.push(userId);

          // Award gems and XP (rank-specific, separate from qualifier XP)
          if (reward.gems > 0 || reward.xp > 0) {
            await supabase.rpc('increment_user_currency', { p_user_id: userId, p_xp: reward.xp || 0, p_gems: reward.gems || 0 });
          }

          // Award inventory items
          if (reward.shop_items.length > 0) {
            await supabase.rpc('award_competition_items', {
              p_user_id: userId,
              p_item_ids: reward.shop_items,
            });
          }

          // Build reward message
          const rankNum = i + 1;
          const rankLabel = `Hạng ${rankNum}`;
          const rankTitle = rankNum === 1 ? 'Vô địch Competition!' : rankNum === 2 ? 'Hạng Nhì Competition!' : rankNum === 3 ? 'Hạng Ba Competition!' : `Top ${rankNum} Competition!`;
          const parts = [];
          if (reward.gems > 0) parts.push(`+${reward.gems} gems`);
          const totalXpAwarded = (reward.xp || 0) + (rewardThreshold > 0 && userScore >= rewardThreshold ? rewardXP : 0);
          if (totalXpAwarded > 0) parts.push(`+${totalXpAwarded} XP`);
          if (reward.shop_items.length > 0) {
            const itemNames = reward.shop_items
              .map(id => collectibleItems.find(s => s.id === id)?.name || 'item')
              .join(', ');
            parts.push(itemNames);
          }

          // Notify winner
          await supabase.from('notifications').insert([{
            user_id: userId,
            type: 'competition_winner',
            title: rankTitle,
            message: `Chúc mừng! Bạn đạt ${rankLabel} với ${userScore} điểm. ${parts.join(', ')}`,
            icon: rankNum <= 3 ? 'Trophy' : 'Medal',
            data: { competition: 'game', game_type: competitionGameType, score: userScore, rank: rankNum, ...reward },
          }]);

          const { data: userData } = await supabase.from('users').select('full_name').eq('id', userId).single();
          awardedNames.push(`${rankLabel}: ${userData?.full_name || 'Unknown'}`);
        }

        // Notify qualifiers who got XP (excluding awarded users who already got notified)
        const topUserIds = awardedUserIds;
        if (rewardXP > 0 && qualifiers.length > 0) {
          const qualifierNotifs = qualifiers
            .filter(([userId]) => !topUserIds.includes(userId))
            .map(([userId, score]) => ({
              user_id: userId,
              type: 'competition_winner',
              title: 'Phần thưởng Competition!',
              message: `Bạn đạt ${score} điểm và nhận ${rewardXP} XP!`,
              icon: 'Medal',
              data: { competition: 'game', game_type: competitionGameType, score, xp: rewardXP },
            }));
          if (qualifierNotifs.length > 0) {
            await supabase.from('notifications').insert(qualifierNotifs);
          }
        }

        // Clear training scores for this game type
        await supabase.from('training_scores').delete().eq('game_type', competitionGameType);

        // Pause competition
        setCompetitionActive(false);
        await supabase.from('site_settings').upsert({
          setting_key: 'leaderboard_competition_active',
          setting_value: 'false',
          description: 'Whether competition is active',
        }, { onConflict: 'setting_key' });

        const qualifierMsg = qualifiers.length > 0 ? ` ${qualifiers.length} qualifier${qualifiers.length > 1 ? 's' : ''} earned ${rewardXP} XP.` : '';
        showNotification(`Competition ended! ${awardedNames.join(' | ')}${qualifierMsg}`);
      } else {
        // Item competition — just pause, no score cleanup needed
        setCompetitionActive(false);
        await supabase.from('site_settings').upsert({
          setting_key: 'leaderboard_competition_active',
          setting_value: 'false',
          description: 'Whether competition is active',
        }, { onConflict: 'setting_key' });

        showNotification('Item competition ended.');
      }
    } catch (err) {
      console.error('Error ending competition:', err);
      showNotification('Error ending competition: ' + err.message, 'error');
    } finally {
      invalidateSiteSettings(); // competition_active changed — refresh students' cache
      setEnding(false);
    }
  };

  const toggleTab = (tabKey) => {
    setVisibleTabs((prev) =>
      prev.includes(tabKey)
        ? prev.filter((t) => t !== tabKey)
        : [...prev, tabKey]
    );
  };

  const selectedItem = collectibleItems.find(i => i.id === competitionItemId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className=" mx-auto space-y-3 pt-4">
      {/* Notification */}
      {notification && (
        <div className={`px-3 py-2 rounded-lg text-sm font-medium ${
          notification.type === 'error'
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Tab Visibility */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
          Tab Visibility
        </h3>
        <div className="flex gap-2">
          {ALL_TABS.map((tab) => {
            const isVisible = visibleTabs.includes(tab.key);
            return (
              <label
                key={tab.key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all flex-1 ${
                  isVisible
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={() => toggleTab(tab.key)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className={`text-sm font-medium ${isVisible ? 'text-gray-900' : 'text-gray-500'}`}>
                  {tab.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Default Tab */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
          Default Tab
        </h3>
        <select
          value={visibleTabs.includes(defaultTab) ? defaultTab : visibleTabs[0] || ''}
          onChange={(e) => setDefaultTab(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {ALL_TABS.filter((t) => visibleTabs.includes(t.key)).map((tab) => (
            <option key={tab.key} value={tab.key}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      {/* Pet Training Games */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
          Pet Training Games
        </h3>
        <div className="flex flex-wrap gap-2">
          {TRAINING_GAMES.map((game) => {
            const isEnabled = enabledTrainingGames.includes(game.key);
            return (
              <label
                key={game.key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                  isEnabled
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => {
                    setEnabledTrainingGames(prev =>
                      prev.includes(game.key)
                        ? prev.filter(k => k !== game.key)
                        : [...prev, game.key]
                    );
                  }}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-base">{game.icon}</span>
                <span className={`text-sm font-medium ${isEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                  {game.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Activity Schedule (PvP + Training) */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
          Activity Schedule
        </h3>

        {/* Activity Toggle */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-900">PvP & Training Status</p>
            <p className="text-sm text-gray-500">
              {pvpEnabled ? 'PvP & training enabled.' : 'PvP & training disabled.'}
            </p>
          </div>
          <button
            onClick={() => setPvpEnabled(!pvpEnabled)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              pvpEnabled
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {pvpEnabled ? (
              <>
                <Play className="w-4 h-4" fill="currentColor" />
                Enabled
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Disabled
              </>
            )}
          </button>
        </div>

        {/* Time Window */}
        {pvpEnabled && (
          <div className="border-t border-gray-100 pt-2">
            <p className="text-sm font-medium text-gray-900 mb-1.5">Allowed Hours (optional)</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <label className="text-sm text-gray-500">From</label>
                <input
                  type="time"
                  value={pvpStartTime}
                  onChange={(e) => setPvpStartTime(e.target.value)}
                  className="p-1.5 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-sm text-gray-500">To</label>
                <input
                  type="time"
                  value={pvpEndTime}
                  onChange={(e) => setPvpEndTime(e.target.value)}
                  className="p-1.5 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {(pvpStartTime || pvpEndTime) && (
                <button
                  onClick={() => { setPvpStartTime(''); setPvpEndTime(''); }}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-1">
              {pvpStartTime && pvpEndTime
                ? `PvP & training allowed ${pvpStartTime}–${pvpEndTime}.`
                : (pvpStartTime || pvpEndTime)
                  ? 'Set both times for schedule to work.'
                  : 'No restriction — 24/7.'}
            </p>
          </div>
        )}

        {/* Quick Match Game Type */}
        {pvpEnabled && (
          <div className="border-t border-gray-100 pt-2 mt-2">
            <p className="text-sm font-medium text-gray-900 mb-1.5">Quick Match Game</p>
            <select
              value={quickmatchGameType}
              onChange={(e) => setQuickmatchGameType(e.target.value)}
              className="p-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
            >
              <option value="wordtype">Word Type</option>
              <option value="scramble">Word Scramble</option>
              <option value="matchgame">Match Up</option>
            </select>
            <p className="text-sm text-gray-400 mt-1">Which game students play in Quick Match.</p>
          </div>
        )}
      </div>

      {/* Game Chest Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
          Game Chests
        </h3>

        {/* Chest Toggle */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Chest Status</p>
            <p className="text-sm text-gray-500">
              {chestEnabled ? 'Chests appear in games.' : 'Chests disabled.'}
            </p>
          </div>
          <button
            onClick={() => setChestEnabled(!chestEnabled)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              chestEnabled
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {chestEnabled ? (
              <>
                <Gift className="w-4 h-4" />
                Enabled
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Disabled
              </>
            )}
          </button>
        </div>

        {chestEnabled && (
          <div className="space-y-3 border-t border-gray-100 pt-2">
            {/* Time Window */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1.5">Allowed Hours (optional)</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm text-gray-500">From</label>
                  <input
                    type="time"
                    value={chestStartTime}
                    onChange={(e) => setChestStartTime(e.target.value)}
                    className="p-1.5 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-sm text-gray-500">To</label>
                  <input
                    type="time"
                    value={chestEndTime}
                    onChange={(e) => setChestEndTime(e.target.value)}
                    className="p-1.5 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
                {(chestStartTime || chestEndTime) && (
                  <button
                    onClick={() => { setChestStartTime(''); setChestEndTime(''); }}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                {chestStartTime && chestEndTime
                  ? `Chests appear ${chestStartTime}–${chestEndTime} only.`
                  : (chestStartTime || chestEndTime)
                    ? 'Set both times for schedule to work.'
                    : 'No restriction — chests appear 24/7.'}
              </p>
            </div>

            {/* Daily Limit */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1.5">Daily Limit per Student</p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={chestDailyLimit}
                  onChange={(e) => setChestDailyLimit(parseInt(e.target.value) || 1)}
                  className="w-20 p-1.5 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
                <span className="text-sm text-gray-500">chests per day</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Maze Adventure Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
          Maze Adventure
        </h3>

        {/* Maze Toggle */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Wild Area Status</p>
            <p className="text-sm text-gray-500">
              {mazeEnabled ? 'Students can enter the Wild Area.' : 'Wild Area disabled.'}
            </p>
          </div>
          <button
            onClick={() => setMazeEnabled(!mazeEnabled)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              mazeEnabled
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {mazeEnabled ? (
              <>
                <Compass className="w-4 h-4" />
                Enabled
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Disabled
              </>
            )}
          </button>
        </div>

        {mazeEnabled && (
          <div className="space-y-3 border-t border-gray-100 pt-2">
            {/* Time Window */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1.5">Allowed Hours (optional)</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm text-gray-500">From</label>
                  <input
                    type="time"
                    value={mazeStartTime}
                    onChange={(e) => setMazeStartTime(e.target.value)}
                    className="p-1.5 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-sm text-gray-500">To</label>
                  <input
                    type="time"
                    value={mazeEndTime}
                    onChange={(e) => setMazeEndTime(e.target.value)}
                    className="p-1.5 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                {(mazeStartTime || mazeEndTime) && (
                  <button
                    onClick={() => { setMazeStartTime(''); setMazeEndTime(''); }}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                {mazeStartTime && mazeEndTime
                  ? `Wild Area open ${mazeStartTime}–${mazeEndTime} only.`
                  : (mazeStartTime || mazeEndTime)
                    ? 'Set both times for schedule to work.'
                    : 'No restriction — Wild Area open 24/7.'}
              </p>
            </div>

            {/* Daily Limit */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1.5">Daily Limit per Student</p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={mazeDailyLimit}
                  onChange={(e) => setMazeDailyLimit(parseInt(e.target.value) || 1)}
                  className="w-20 p-1.5 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <span className="text-sm text-gray-500">adventures per day</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Competition Control */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
          Competition Settings
        </h3>

        {/* Active toggle */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Status</p>
            <p className="text-sm text-gray-500">
              {competitionActive ? 'Running — scores tracked.' : 'Paused — scores not tracked.'}
            </p>
          </div>
          <button
            onClick={() => setCompetitionActive(!competitionActive)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              competitionActive
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {competitionActive ? (
              <>
                <Play className="w-4 h-4" fill="currentColor" />
                Active
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Paused
              </>
            )}
          </button>
        </div>

        {/* Competition Type */}
        <div className="border-t border-gray-100 pt-2 mb-3">
          <p className="text-sm font-medium text-gray-900 mb-2">Competition Type</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setCompetitionType('game')}
              className={`p-2 rounded-lg border-2 text-left transition-all ${
                competitionType === 'game'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🎮</span>
                <span className="text-sm font-semibold text-gray-900">Mini Game</span>
              </div>
            </button>
            <button
              onClick={() => setCompetitionType('items')}
              className={`p-2 rounded-lg border-2 text-left transition-all ${
                competitionType === 'items'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">📦</span>
                <span className="text-sm font-semibold text-gray-900">Item Collection</span>
              </div>
            </button>
          </div>
        </div>

        {/* Game Type Selection */}
        {competitionType === 'game' && (
          <div className="border-t border-gray-100 pt-2 mb-3">
            <p className="text-sm font-medium text-gray-900 mb-2">Choose Game</p>
            <div className="grid grid-cols-3 gap-1.5">
              {GAME_TYPES.map((game) => (
                <button
                  key={game.key}
                  onClick={() => setCompetitionGameType(game.key)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border-2 transition-all ${
                    competitionGameType === game.key
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-base">{game.icon}</span>
                  <span className={`text-sm font-medium ${
                    competitionGameType === game.key ? 'text-purple-700' : 'text-gray-700'
                  }`}>
                    {game.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Item Selection */}
        {competitionType === 'items' && (
          <div className="border-t border-gray-100 pt-2 mb-3">
            <p className="text-sm font-medium text-gray-900 mb-2">Choose Item</p>
            {itemsLoading ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            ) : collectibleItems.length === 0 ? (
              <p className="text-sm text-gray-500">No items found. Create items in Inventory first.</p>
            ) : (
              <>
                <select
                  value={competitionItemId}
                  onChange={(e) => setCompetitionItemId(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Select an item --</option>
                  {collectibleItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.set_name || item.item_type}) - {item.rarity}
                    </option>
                  ))}
                </select>
                {selectedItem && (
                  <div className="mt-2 flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    {selectedItem.image_url && (
                      <img src={selectedItem.image_url} alt={selectedItem.name} className="w-8 h-8 object-contain rounded" />
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-900">{selectedItem.name}</div>
                      <div className="text-sm text-gray-500">
                        {selectedItem.set_name && `${selectedItem.set_name} · `}
                        {selectedItem.rarity}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Attempt Limit & End Date - inline */}
        <div className="border-t border-gray-100 pt-2 grid grid-cols-2 gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">Attempts/Week</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="50"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 p-1.5 border border-gray-300 rounded-lg text-center text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-sm text-gray-500">
                {maxAttempts === 0 ? '(unlimited)' : `per student`}
              </span>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">End Date</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={competitionEndDate}
                onChange={(e) => setCompetitionEndDate(e.target.value)}
                className="p-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {competitionEndDate && (
                <button
                  onClick={() => setCompetitionEndDate('')}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Top Rewards Config */}
        <div className="border-t border-gray-100 pt-2 mt-3">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="w-4 h-4 text-yellow-500" />
            <p className="text-sm font-medium text-gray-900">Top Player Rewards</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {topRewards.map((reward, idx) => {
              const rankIcons = { 1: '🥇', 2: '🥈', 3: '🥉' };
              const rankLabel = typeof reward.rank === 'string' ? `#${reward.rank}` : (rankIcons[reward.rank] || `#${reward.rank}`);
              return (
                <div key={reward.rank} className="flex-1 min-w-[140px] p-2 border border-gray-200 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">{rankLabel}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={reward.gems}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          setTopRewards(prev => prev.map((r, i) => i === idx ? { ...r, gems: val } : r));
                        }}
                        className="w-14 p-1 border border-gray-300 rounded text-center text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <img src={assetUrl('/image/study/gem.png')} alt="Gem" className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="1000"
                        value={reward.xp}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          setTopRewards(prev => prev.map((r, i) => i === idx ? { ...r, xp: val } : r));
                        }}
                        className="w-14 p-1 border border-gray-300 rounded text-center text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-sm text-gray-500">XP</span>
                    </div>
                  </div>
                  {/* Shop Items */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {reward.shop_items.map((itemId) => {
                      const item = collectibleItems.find(s => s.id === itemId);
                      return (
                        <div key={itemId} className="flex items-center gap-1 bg-white border border-gray-200 rounded px-1.5 py-0.5 text-sm">
                          {item?.image_url && <img src={assetUrl(item.image_url)} alt="" className="w-4 h-4 rounded" />}
                          <span className="text-gray-700 truncate max-w-[70px]">{item?.name || '?'}</span>
                          <button
                            onClick={() => setTopRewards(prev => prev.map((r, i) => i === idx ? { ...r, shop_items: r.shop_items.filter(id => id !== itemId) } : r))}
                            className="text-red-400 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                    <select
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setTopRewards(prev => prev.map((r, i) => i === idx ? { ...r, shop_items: [...r.shop_items, e.target.value] } : r));
                      }}
                      className="p-1 border border-gray-300 rounded text-sm text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full mt-1"
                    >
                      <option value="">+ item</option>
                      {collectibleItems
                        .filter(s => !reward.shop_items.includes(s.id))
                        .map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.rarity} {s.item_type})</option>
                        ))
                      }
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Threshold Reward Config */}
        <div className="border-t border-gray-100 pt-2 mt-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Trophy className="w-4 h-4 text-blue-500" />
            <p className="text-sm font-medium text-gray-900">Qualifier Reward</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="10000"
                value={rewardThreshold}
                onChange={(e) => setRewardThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 p-1.5 border border-gray-300 rounded-lg text-center text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-sm text-gray-600">min score (0=off)</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="1000"
                value={rewardXP}
                onChange={(e) => setRewardXP(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 p-1.5 border border-gray-300 rounded-lg text-center text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-sm text-gray-600">XP reward</span>
            </div>
          </div>
        </div>
      </div>

      {/* Save + End Competition */}
      <div className="flex items-center justify-between">
        {competitionActive ? (
          <button
            onClick={handleEndCompetition}
            disabled={ending}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 disabled:opacity-50 transition-all"
          >
            {ending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
            {ending ? 'Ending...' : 'End & Award'}
          </button>
        ) : <div />}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-all"
        >
          {saving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default LeaderboardSettings;
