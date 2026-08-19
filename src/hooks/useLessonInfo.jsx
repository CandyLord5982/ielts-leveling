import { useState } from 'react';
import { supabase } from '../supabase/client';
import { useAuth } from './useAuth';

export const useLessonInfo = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLessonInfo = async (courseId, date) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('lesson_info')
        .select('*')
        .eq('course_id', courseId)
        .eq('session_date', date)
        .maybeSingle();

      if (fetchError) throw fetchError;
      return data || null;
    } catch (err) {
      console.error('Error fetching lesson info:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Returns the saved record (with id) so lesson_records can reference it
  const saveLessonInfo = async (info, { isDraft = false } = {}) => {
    try {
      setLoading(true);
      setError(null);

      const { id, ...rest } = info;
      const record = {
        ...rest,
        is_draft: isDraft,
        recorded_by: user.id,
        updated_at: new Date().toISOString()
      };

      const { data, error: upsertError } = await supabase
        .from('lesson_info')
        .upsert(record, {
          onConflict: 'course_id,session_date'
        })
        .select()
        .single();

      if (upsertError) throw upsertError;
      return data;
    } catch (err) {
      console.error('Error saving lesson info:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    fetchLessonInfo,
    saveLessonInfo,
    loading,
    error
  };
};
