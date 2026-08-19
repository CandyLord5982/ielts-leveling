import React, { useState, useEffect } from 'react'
import { supabase } from '../../../supabase/client'
import { X, PlayCircle, Plus, User, Calendar } from 'lucide-react'

const AddSessionModal = ({ unitId, courseId, parentAssignedStudentId, onClose, onCreated }) => {
  const [title, setTitle] = useState('')
  const [isPersonal, setIsPersonal] = useState(!!parentAssignedStudentId)
  const [selectedStudentId, setSelectedStudentId] = useState(parentAssignedStudentId || '')
  const [students, setStudents] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [parentStudentName, setParentStudentName] = useState('')
  const [openDate, setOpenDate] = useState('')
  const [closeDate, setCloseDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isInheritedPersonal = !!parentAssignedStudentId

  useEffect(() => {
    if (isInheritedPersonal) {
      // Fetch the parent student's name
      fetchStudentName(parentAssignedStudentId)
    } else if (isPersonal && courseId) {
      fetchEnrolledStudents()
    }
  }, [isPersonal])

  const fetchStudentName = async (studentId) => {
    const { data } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', studentId)
      .single()
    if (data) setParentStudentName(data.full_name || 'Unknown')
  }

  const fetchEnrolledStudents = async () => {
    if (!courseId) return
    setLoadingStudents(true)
    try {
      const { data, error: fetchError } = await supabase
        .from('course_enrollments')
        .select('student_id, student:users!student_id(id, full_name, real_name)')
        .eq('course_id', courseId)
        .eq('is_active', true)

      if (fetchError) throw fetchError

      const studentList = (data || []).map(e => ({
        id: e.student?.id || e.student_id,
        name: e.student?.real_name || e.student?.full_name || 'Unknown'
      }))
      setStudents(studentList)
    } catch (err) {
      console.error('Error fetching students:', err)
    } finally {
      setLoadingStudents(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const assignedId = isInheritedPersonal ? parentAssignedStudentId : (isPersonal ? selectedStudentId : null)
    if (isPersonal && !isInheritedPersonal && !selectedStudentId) {
      setError('Please select a student')
      return
    }
    setLoading(true)
    setError('')

    try {
      const { data: existingSessions, error: countError } = await supabase
        .from('sessions')
        .select('session_number')
        .eq('unit_id', unitId)
        .order('session_number', { ascending: false })
        .limit(1)

      if (countError) throw countError

      const nextSessionNumber = existingSessions.length > 0 ? existingSessions[0].session_number + 1 : 1

      const { data, error } = await supabase
        .from('sessions')
        .insert({
          unit_id: unitId,
          title: title.trim(),
          session_number: nextSessionNumber,
          session_type: 'mixed',
          difficulty_level: 1,
          xp_reward: 50,
          unlock_requirement: null,
          is_active: true,
          estimated_duration: 15,
          assigned_student_id: assignedId,
          open_date: openDate ? new Date(openDate).toISOString() : null,
          close_date: closeDate ? new Date(closeDate).toISOString() : null
        })
        .select()
        .single()

      if (error) throw error

      onCreated(data)
    } catch (err) {
      console.error('Error creating session:', err)
      setError(err.message || 'Failed to create session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 ${isPersonal || isInheritedPersonal ? 'bg-purple-100' : 'bg-green-100'} rounded-lg flex items-center justify-center`}>
              {isPersonal || isInheritedPersonal ? (
                <User className="w-4 h-4 text-purple-600" />
              ) : (
                <PlayCircle className="w-4 h-4 text-green-600" />
              )}
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              {isPersonal || isInheritedPersonal ? 'New Personal Session' : 'New Session'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Inherited personal info */}
          {isInheritedPersonal && (
            <div className="flex items-center gap-2 p-2 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
              <User className="w-4 h-4 text-purple-600 flex-shrink-0" />
              <span>Personal session for <strong>{parentStudentName || '...'}</strong></span>
            </div>
          )}

          {/* Personal Toggle (only if parent unit is not personal) */}
          {!isInheritedPersonal && courseId && (
            <div className="flex items-center justify-between p-2 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-sm font-medium text-purple-900">Assign to student</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPersonal(!isPersonal)
                  if (isPersonal) setSelectedStudentId('')
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${isPersonal ? 'bg-purple-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${isPersonal ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          )}

          {/* Student Picker */}
          {isPersonal && !isInheritedPersonal && (
            <div>
              {loadingStudents ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-1">
                  <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  Loading...
                </div>
              ) : students.length === 0 ? (
                <p className="text-sm text-gray-500">No students enrolled</p>
              ) : (
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  required={isPersonal}
                >
                  <option value="">-- Choose a student --</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Session Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Family Vocabulary"
              required
              autoFocus
            />
          </div>

          {/* Open / Close Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                Open Date
              </label>
              <input
                type="datetime-local"
                value={openDate}
                onChange={(e) => setOpenDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                Close Date
              </label>
              <input
                type="datetime-local"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || (isPersonal && !isInheritedPersonal && !selectedStudentId)}
              className={`flex-1 px-4 py-2 text-white disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center space-x-2 ${
                isPersonal || isInheritedPersonal ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>{loading ? 'Creating...' : 'Create'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddSessionModal
