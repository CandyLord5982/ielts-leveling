import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase/client";
import { useCohorts } from "../../hooks/useCohorts";
import { Plus, X, Users, Trash2, Edit } from "lucide-react";

const CohortsManagement = () => {
  const { cohorts, fetchCohorts, fetchCohortMembers, loading } = useCohorts();
  const [selectedCohortId, setSelectedCohortId] = useState("");
  const [members, setMembers] = useState([]);
  const [cohortCounts, setCohortCounts] = useState({});
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingCohort, setEditingCohort] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState(null);

  const show = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    fetchCohorts();
    fetchAllCohortCounts();
  }, [fetchCohorts]);

  useEffect(() => {
    const run = async () => {
      if (!selectedCohortId) {
        setMembers([]);
        return;
      }
      const data = await fetchCohortMembers(selectedCohortId);
      setMembers(data);
    };
    run();
  }, [selectedCohortId, fetchCohortMembers]);

  const fetchAllCohortCounts = async () => {
    try {
      const { data, error } = await supabase
        .from("cohort_members")
        .select("cohort_id, student_id")
        .eq("is_active", true);
      if (error) throw error;
      const map = {};
      (data || []).forEach((row) => {
        map[row.cohort_id] = (map[row.cohort_id] || 0) + 1;
      });
      setCohortCounts(map);
    } catch (e) {
      // ignore silently
    }
  };

  useEffect(() => {
    const loadStudents = async () => {
      try {
        setStudentsLoading(true);
        const { data, error } = await supabase
          .from("users")
          .select("id, full_name, email, xp")
          .eq("role", "user")
          .order("full_name");
        if (error) throw error;
        setStudents(data || []);
      } catch (e) {
        // silently ignore here; page still works
      } finally {
        setStudentsLoading(false);
      }
    };
    loadStudents();
  }, []);

  const selectedCohort = useMemo(
    () => cohorts.find((c) => c.id === selectedCohortId),
    [cohorts, selectedCohortId],
  );

  const startCreate = () => {
    setForm({ name: "", description: "" });
    setCreating(true);
  };

  const startEdit = (cohort) => {
    setEditingCohort(cohort);
    setForm({ name: cohort.name || "", description: cohort.description || "" });
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      show("Name is required", "error");
      return;
    }
    try {
      setBusy(true);
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("cohorts").insert({
        name: form.name.trim(),
        description: form.description || null,
        created_by: user?.id,
        is_active: true,
      });
      if (error) throw error;
      show("Cohort created");
      setCreating(false);
      await fetchCohorts();
    } catch (e) {
      show(e.message || "Error creating cohort", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingCohort) return;
    if (!form.name.trim()) {
      show("Name is required", "error");
      return;
    }
    try {
      setBusy(true);
      const { error } = await supabase
        .from("cohorts")
        .update({
          name: form.name.trim(),
          description: form.description || null,
        })
        .eq("id", editingCohort.id);
      if (error) throw error;
      show("Cohort updated");
      setEditingCohort(null);
      await fetchCohorts();
    } catch (e) {
      show(e.message || "Error updating cohort", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (cohortId) => {
    if (!confirm("Delete this cohort? This will remove its members as well."))
      return;
    try {
      setBusy(true);
      const { error } = await supabase
        .from("cohorts")
        .delete()
        .eq("id", cohortId);
      if (error) throw error;
      show("Cohort deleted");
      if (selectedCohortId === cohortId) setSelectedCohortId("");
      await fetchCohorts();
      setMembers([]);
    } catch (e) {
      show(e.message || "Error deleting cohort", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleAddMemberById = async (studentId) => {
    if (!selectedCohortId) {
      show("Select a cohort first", "error");
      return;
    }
    try {
      setBusy(true);

      // Add student to cohort
      const { error } = await supabase
        .from("cohort_members")
        .upsert(
          {
            cohort_id: selectedCohortId,
            student_id: studentId,
            is_active: true,
          },
          { onConflict: "cohort_id,student_id" },
        );
      if (error) throw error;

      // Auto-enroll in courses that this cohort is enrolled in
      const { data: cohortCourses, error: coursesError } = await supabase
        .from("course_enrollments")
        .select("course_id")
        .eq("cohort_id", selectedCohortId)
        .eq("is_active", true);

      if (!coursesError && cohortCourses && cohortCourses.length > 0) {
        // Get unique course IDs
        const courseIds = [...new Set(cohortCourses.map(c => c.course_id))];
        const user = (await supabase.auth.getUser()).data.user;

        // Enroll the new student in each course
        const enrollments = courseIds.map(courseId => ({
          course_id: courseId,
          student_id: studentId,
          assigned_by: user?.id,
          is_active: true,
          cohort_id: selectedCohortId
        }));

        const { error: enrollError } = await supabase
          .from("course_enrollments")
          .upsert(enrollments, { onConflict: "course_id,student_id" });

        if (enrollError) {
          console.error("Error auto-enrolling in courses:", enrollError);
        } else if (courseIds.length > 0) {
          show(`Member added and enrolled in ${courseIds.length} course(s)`);
          const data = await fetchCohortMembers(selectedCohortId);
          setMembers(data);
          await fetchAllCohortCounts();
          return;
        }
      }

      show("Member added");
      const data = await fetchCohortMembers(selectedCohortId);
      setMembers(data);
      await fetchAllCohortCounts();
    } catch (e) {
      show(e.message || "Error adding member", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (studentId) => {
    if (!confirm("Remove this member from cohort?")) return;
    try {
      setBusy(true);
      const { error } = await supabase
        .from("cohort_members")
        .delete()
        .eq("cohort_id", selectedCohortId)
        .eq("student_id", studentId);
      if (error) throw error;
      show("Member removed");
      const data = await fetchCohortMembers(selectedCohortId);
      setMembers(data);
      await fetchAllCohortCounts();
    } catch (e) {
      show(e.message || "Error removing member", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={startCreate}
            className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Cohort
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cohort List */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-4 h-4" /> All Cohorts
            </h3>
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y">
            {(cohorts || []).length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No cohorts</div>
            ) : (
              cohorts.map((c) => (
                <div
                  key={c.id}
                  className={`p-3 flex items-center justify-between ${selectedCohortId === c.id ? "bg-blue-50" : ""}`}
                >
                  <button
                    onClick={() => setSelectedCohortId(c.id)}
                    className="text-left"
                  >
                    <div className="font-medium text-gray-900">
                      {c.name}
                      {typeof cohortCounts[c.id] === "number"
                        ? ` (${cohortCounts[c.id]})`
                        : ""}
                    </div>
                    {c.description && (
                      <div className="text-xs text-gray-600">
                        {c.description}
                      </div>
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(c)}
                      className="p-2 rounded hover:bg-gray-100"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-2 rounded hover:bg-red-50 text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Members and Student Picker */}
        <div className="bg-white rounded-lg shadow-sm border p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Members</h3>
            {selectedCohort && (
              <div className="text-sm text-gray-600">
                {selectedCohort?.name}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Available Students */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-700">
                  Available Students
                </div>
                {studentsLoading && (
                  <div className="text-xs text-gray-500">Loading...</div>
                )}
              </div>
              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students..."
                className="w-full mb-2 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />

              <div className="border rounded-lg max-h-[420px] overflow-y-auto overflow-x-hidden divide-y">
                {(() => {
                  const memberIds = new Set(members.map((m) => m.student_id));
                  const filtered = (students || [])
                    .filter((s) => !memberIds.has(s.id))
                    .filter((s) => {
                      const q = studentSearch.toLowerCase();
                      return (
                        s.full_name?.toLowerCase().includes(q) ||
                        s.email?.toLowerCase().includes(q)
                      );
                    });
                  if (filtered.length === 0)
                    return (
                      <div className="p-3 text-sm text-gray-500">
                        No students
                      </div>
                    );
                  return filtered.map((s) => (
                    <div
                      key={s.id}
                      className="p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {s.full_name || s.email}
                        </div>
                        
                        <div className="text-sm text-gray-600">
                          {s.email.split("@")[0]}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddMemberById(s.id)}
                        disabled={!selectedCohortId || busy}
                        className="px-2 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Current Members */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">
                Current Members
              </div>
              <div className="border rounded-lg  overflow-y-auto divide-y">
                {!members || members.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">No members</div>
                ) : (
                  members.map((m) => (
                    <div
                      key={m.student_id}
                      className="p-3 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {m.full_name || m.email}
                        </div>
                        <div className="text-sm text-gray-600">{m.email}</div>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(m.student_id)}
                        className="p-2 rounded hover:bg-red-50 text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {creating && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Create Cohort</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Grade 10 - 2025"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
              <button
                onClick={() => setCreating(false)}
                className="px-4 py-2 rounded-lg border"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingCohort && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Edit Cohort</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingCohort(null)}
                className="px-4 py-2 rounded-lg border"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div
          className={`fixed bottom-4 right-4 p-3 rounded-lg shadow ${notification.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}
        >
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default CohortsManagement;
