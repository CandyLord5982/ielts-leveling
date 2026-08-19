import { CheckCircle, Clock, XCircle, Users } from 'lucide-react';

const statusOptions = [
  { value: 'present', label: 'Present', color: 'bg-green-500 text-white', inactive: 'bg-white text-green-700 border border-green-300 hover:bg-green-100' },
  { value: 'late', label: 'Late', color: 'bg-yellow-500 text-white', inactive: 'bg-white text-yellow-700 border border-yellow-300 hover:bg-yellow-100' },
  { value: 'absent', label: 'Absent', color: 'bg-red-500 text-white', inactive: 'bg-white text-red-700 border border-red-300 hover:bg-red-100' },
];

const RollCallView = ({ students, records, onChange, onMarkAllPresent, onMarkAllLate, onMarkAllAbsent, loading }) => {
  const getStats = () => {
    const recs = Object.values(records);
    return {
      total: students.length,
      present: recs.filter(r => r.attendance_status === 'present').length,
      absent: recs.filter(r => r.attendance_status === 'absent').length,
      late: recs.filter(r => r.attendance_status === 'late').length,
    };
  };

  const stats = getStats();

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onMarkAllPresent}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white text-green-700 rounded-lg hover:bg-green-100 border border-green-200 transition-colors disabled:opacity-50 text-sm font-medium"
        >
          <CheckCircle className="w-4 h-4" />
          Mark All Present
        </button>
        <button
          onClick={onMarkAllLate}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white text-yellow-700 rounded-lg hover:bg-yellow-100 border border-yellow-200 transition-colors disabled:opacity-50 text-sm font-medium"
        >
          <Clock className="w-4 h-4" />
          Mark All Late
        </button>
        <button
          onClick={onMarkAllAbsent}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white text-red-700 rounded-lg hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50 text-sm font-medium"
        >
          <XCircle className="w-4 h-4" />
          Mark All Absent
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-xs text-gray-600">Total</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-2xl font-bold text-green-600">{stats.present}</div>
          <div className="text-xs text-gray-600">Present</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-2xl font-bold text-yellow-600">{stats.late}</div>
          <div className="text-xs text-gray-600">Late</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-2xl font-bold text-red-600">{stats.absent}</div>
          <div className="text-xs text-gray-600">Absent</div>
        </div>
      </div>

      {/* Student List */}
      <div className="bg-white rounded-lg shadow-sm border">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Enrolled</h3>
          </div>
        ) : (
          <div>
            {students.map(student => {
              const record = records[student.id] || {};
              const status = record.attendance_status || 'present';

              return (
                <div key={student.id} className="flex items-center justify-between p-3 md:p-4 border-b hover:bg-gray-50 gap-2">
                  <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      {student.avatar_url ? (
                        <img src={student.avatar_url} alt={student.full_name} className="w-8 h-8 md:w-10 md:h-10 rounded-full" />
                      ) : (
                        <span className="text-blue-600 font-semibold text-sm md:text-base">
                          {student.full_name?.charAt(0).toUpperCase() || 'S'}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate text-sm md:text-base">{student.full_name}</p>
                      {student.email && (
                        <p className="text-xs text-gray-400 truncate">{student.email.split('@')[0]}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {statusOptions.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => onChange(student.id, { attendance_status: opt.value })}
                        className={`px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                          status === opt.value ? opt.color : opt.inactive
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RollCallView;
