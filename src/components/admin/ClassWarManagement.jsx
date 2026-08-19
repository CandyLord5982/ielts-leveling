import { useState, useEffect } from 'react';
import { supabase } from '../../supabase/client';
import { Swords, Save, Gift, Trophy } from 'lucide-react';
import { invalidateSiteSettings } from '../../utils/siteSettings';

const emptyReward = () => ({ xp: 0, gems: 0, items: [] });

const ClassWarManagement = () => {
  const [winnerReward, setWinnerReward] = useState(emptyReward());
  const [loserReward, setLoserReward] = useState(emptyReward());
  const [availableItems, setAvailableItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [pastWars, setPastWars] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch reward settings
      const { data: settings } = await supabase
        .from('site_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['class_war_winner_rewards', 'class_war_loser_rewards']);

      (settings || []).forEach(s => {
        try {
          const val = JSON.parse(s.setting_value);
          if (s.setting_key === 'class_war_winner_rewards') setWinnerReward({ ...emptyReward(), ...val });
          if (s.setting_key === 'class_war_loser_rewards') setLoserReward({ ...emptyReward(), ...val });
        } catch {}
      });

      // Fetch collectible items
      const { data: items } = await supabase
        .from('collectible_items')
        .select('id, name, image_url, rarity')
        .eq('is_active', true)
        .order('name');
      setAvailableItems(items || []);

      // Fetch recent wars across all courses
      const { data: wars } = await supabase
        .from('class_wars')
        .select('*, courses:course_id(title)')
        .order('created_at', { ascending: false })
        .limit(20);
      setPastWars(wars || []);

      setLoading(false);
    };
    fetchData();
  }, []);

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const upserts = [
        { setting_key: 'class_war_winner_rewards', setting_value: JSON.stringify(winnerReward), description: 'Class War winner rewards (XP, gems, items)' },
        { setting_key: 'class_war_loser_rewards', setting_value: JSON.stringify(loserReward), description: 'Class War loser rewards (XP, gems, items)' },
      ];

      for (const row of upserts) {
        const { data: existing } = await supabase
          .from('site_settings')
          .select('id')
          .eq('setting_key', row.setting_key)
          .maybeSingle();

        if (existing) {
          await supabase.from('site_settings').update({ setting_value: row.setting_value, updated_at: new Date().toISOString() }).eq('id', existing.id);
        } else {
          await supabase.from('site_settings').insert(row);
        }
      }

      invalidateSiteSettings();
      showNotification('Reward settings saved!');
    } catch (err) {
      console.error('Error saving settings:', err);
      showNotification('Failed to save: ' + (err.message || err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const RewardEditor = ({ label, reward, setReward, color }) => {
    const [selItemId, setSelItemId] = useState('');
    const [selItemQty, setSelItemQty] = useState(1);

    const addItem = () => {
      if (!selItemId) return;
      const item = availableItems.find(i => i.id === selItemId);
      if (!item || reward.items.some(r => r.item_id === selItemId)) return;
      setReward({ ...reward, items: [...reward.items, { item_id: item.id, item_name: item.name, image_url: item.image_url, quantity: selItemQty }] });
      setSelItemId('');
      setSelItemQty(1);
    };

    const removeItem = (itemId) => {
      setReward({ ...reward, items: reward.items.filter(r => r.item_id !== itemId) });
    };

    return (
      <div className={`border ${color.border} rounded-xl overflow-hidden`}>
        <div className={`${color.bg} px-4 py-2 text-white font-semibold text-sm flex items-center gap-2`}>
          <Gift className="w-4 h-4" />
          {label}
        </div>
        <div className="p-4 space-y-3 bg-white">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">XP per member</label>
              <input type="number" min="0" value={reward.xp}
                onChange={e => setReward({ ...reward, xp: parseInt(e.target.value) || 0 })}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Gems per member</label>
              <input type="number" min="0" value={reward.gems}
                onChange={e => setReward({ ...reward, gems: parseInt(e.target.value) || 0 })}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Items per member</label>
            <div className="flex items-center gap-2 mb-2">
              <select value={selItemId} onChange={e => setSelItemId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1">
                <option value="">-- Select item --</option>
                {availableItems.map(item => (
                  <option key={item.id} value={item.id}>{item.name} ({item.rarity})</option>
                ))}
              </select>
              <input type="number" min="1" value={selItemQty}
                onChange={e => setSelItemQty(parseInt(e.target.value) || 1)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-16" />
              <button onClick={addItem} disabled={!selItemId}
                className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50">
                Add
              </button>
            </div>
            {reward.items.length > 0 && (
              <div className="space-y-1">
                {reward.items.map(item => (
                  <div key={item.item_id} className="flex items-center justify-between px-3 py-1.5 bg-yellow-50 rounded-lg text-sm">
                    <span>{item.item_name} x{item.quantity}</span>
                    <button onClick={() => removeItem(item.item_id)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white text-sm ${
          notification.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {notification.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Swords className="w-6 h-6 text-orange-500" />
          <h2 className="text-xl font-bold text-gray-900">Class War Settings</h2>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <p className="text-sm text-gray-500">
        Configure rewards for all Class Wars. Teachers create and end wars from their course page. Rewards are distributed automatically when a war ends.
      </p>

      {/* Reward settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RewardEditor
          label="Winner Rewards"
          reward={winnerReward}
          setReward={setWinnerReward}
          color={{ bg: 'bg-gradient-to-r from-yellow-500 to-amber-500', border: 'border-yellow-300' }}
        />
        <RewardEditor
          label="Loser Rewards (Consolation)"
          reward={loserReward}
          setReward={setLoserReward}
          color={{ bg: 'bg-gradient-to-r from-gray-500 to-gray-400', border: 'border-gray-300' }}
        />
      </div>

      {/* All wars history */}
      {pastWars.length > 0 && (
        <div className="bg-white border rounded-xl p-6">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-yellow-500" /> War History
          </h3>
          <div className="space-y-2">
            {pastWars.map(war => (
              <div key={war.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium text-sm text-gray-900">{war.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{war.courses?.title}</span>
                  <span className="text-xs text-gray-400 ml-2">{war.team_a_name} vs {war.team_b_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${war.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {war.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {war.ended_at ? new Date(war.ended_at).toLocaleDateString() : new Date(war.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassWarManagement;
