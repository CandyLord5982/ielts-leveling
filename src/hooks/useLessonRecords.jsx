import { useState } from 'react';
import { supabase } from '../supabase/client';
import { useAuth } from './useAuth';

export const useLessonRecords = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRecords = async (lessonInfoId) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('lesson_records')
        .select('*')
        .eq('lesson_info_id', lessonInfoId);

      if (fetchError) throw fetchError;
      return data || [];
    } catch (err) {
      console.error('Error fetching lesson records:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const saveRecords = async (lessonInfoId, records) => {
    try {
      setLoading(true);
      setError(null);

      const recordsWithMeta = records.map(({ id, ...rest }) => ({
        ...rest,
        lesson_info_id: lessonInfoId,
        recorded_by: user.id,
        updated_at: new Date().toISOString()
      }));

      const { error: upsertError } = await supabase
        .from('lesson_records')
        .upsert(recordsWithMeta, {
          onConflict: 'lesson_info_id,student_id'
        });

      if (upsertError) throw upsertError;
      return true;
    } catch (err) {
      console.error('Error saving lesson records:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const inferFromActivity = async (courseId, date) => {
    try {
      setLoading(true);
      setError(null);

      const startOfDay = `${date}T00:00:00`;
      const endOfDay = `${date}T23:59:59`;

      const { data, error: activityError } = await supabase
        .from('user_progress')
        .select('user_id, exercise_id, completed_at, time_spent')
        .eq('course_id', courseId)
        .gte('completed_at', startOfDay)
        .lte('completed_at', endOfDay)
        .not('completed_at', 'is', null);

      if (activityError) throw activityError;

      const userActivity = {};
      (data || []).forEach(record => {
        if (!userActivity[record.user_id]) {
          userActivity[record.user_id] = { exerciseCount: 0, totalTime: 0 };
        }
        userActivity[record.user_id].exerciseCount++;
        userActivity[record.user_id].totalTime += record.time_spent || 0;
      });

      return Object.entries(userActivity).map(([userId, activity]) => {
        let participationLevel = 'low';
        if (activity.exerciseCount >= 3 && activity.totalTime >= 1800) {
          participationLevel = 'high';
        } else if (activity.exerciseCount >= 1 && activity.totalTime >= 600) {
          participationLevel = 'medium';
        }

        return {
          user_id: userId,
          participation_level: participationLevel,
          attendance_status: 'present'
        };
      });
    } catch (err) {
      console.error('Error inferring from activity:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  return {
    fetchRecords,
    saveRecords,
    inferFromActivity,
    loading,
    error
  };
};
