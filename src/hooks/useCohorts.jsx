import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase/client';

export function useCohorts() {
  const [cohorts, setCohorts] = useState([]);
  const [membersByCohort, setMembersByCohort] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCohorts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('cohorts')
        .select('id, name, description, is_active, created_by')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      setCohorts(data || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCohortMembers = useCallback(async (cohortId) => {
    if (!cohortId) return [];
    try {
      const { data, error } = await supabase
        .from('v_cohort_members_detailed')
        .select('student_id, full_name, email, xp, is_active')
        .eq('cohort_id', cohortId)
        .eq('is_active', true);
      if (error) throw error;
      setMembersByCohort((prev) => ({ ...prev, [cohortId]: data || [] }));
      return data || [];
    } catch (e) {
      setError(e);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  return {
    cohorts,
    membersByCohort,
    loading,
    error,
    fetchCohorts,
    fetchCohortMembers,
  };
}



