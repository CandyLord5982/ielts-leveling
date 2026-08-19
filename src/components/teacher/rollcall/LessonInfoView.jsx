const TESTS = ['Unit Test', 'Pre Test', 'Midterm Test', 'Final Test'];
const units = (n) => Array.from({ length: n + 1 }, (_, i) => `U${i}`).concat(TESTS);

const LEVEL_UNITS = {
  'F-0': units(10),
  'F-1': units(15),
  'F-2': units(15),
  'F-3': units(15),
  'Imp-0': units(8),
  'Imp-1': units(8),
  'Time-0': units(6),
  'Time-1': units(12),
  'Time-2': units(12),
};

const LEVELS = Object.keys(LEVEL_UNITS);

const TAGS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7','L8', 'Present', 'Project' , 'Prepare Presentation'];

const SKILLS = ['Mixed', 'Speaking', 'Listening', 'Writing', 'Reading', 'Phonic', 'Grammar', 'Vocab'];

const LESSON_TYPES = ['Theo chương trình', 'Bài tự chọn'];

const LessonInfoView = ({ lessonInfo, onChange, selectedDate, onDateChange }) => {
  const lessonType = lessonInfo.lesson_type || '';
  const level = lessonInfo.lesson_mode || '';
  const unit = lessonInfo.lesson_name || '';
  const tags = lessonInfo.lesson_tags ? lessonInfo.lesson_tags.split(',').filter(Boolean) : [];
  const skills = lessonInfo.skill ? lessonInfo.skill.split(',').filter(Boolean) : [];

  const toggleTag = (tag) => {
    const updated = tags.includes(tag)
      ? tags.filter(t => t !== tag)
      : [...tags, tag];
    onChange({ lesson_tags: updated.join(',') });
  };

  const toggleSkill = (s) => {
    const updated = skills.includes(s)
      ? skills.filter(x => x !== s)
      : [...skills, s];
    onChange({ skill: updated.join(',') });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="space-y-5">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ngày học
            </label>
            <input
              type="date"
              value={selectedDate || ''}
              onChange={(e) => onDateChange?.(e.target.value)}
              min={(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split('T')[0]; })()}
              max={new Date().toISOString().split('T')[0]}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Lesson Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Loại bài
            </label>
            <div className="flex flex-wrap gap-2">
              {LESSON_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ lesson_type: t, lesson_mode: '', lesson_name: '' })}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    lessonType === t
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {lessonType === 'Theo chương trình' && (
            <>
              {/* Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Level
                </label>
                <div className="flex flex-wrap gap-2">
                  {LEVELS.map(l => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => {
                        const updates = { lesson_mode: l };
                        if (unit && !LEVEL_UNITS[l]?.includes(unit)) updates.lesson_name = '';
                        onChange(updates);
                      }}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        level === l
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Unit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Unit
                </label>
                <div className="flex flex-wrap gap-2">
                  {(LEVEL_UNITS[level] || []).map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => onChange({ lesson_name: u })}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        unit === u
                          ? 'bg-green-50 border-green-500 text-green-700'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {lessonType === 'Bài tự chọn' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tên bài
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => onChange({ lesson_name: e.target.value })}
                placeholder="Nhập tên bài..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {/* Tag (multi-select) - only for Theo chương trình */}
          {lessonType !== 'Bài tự chọn' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tag <span className="text-xs text-gray-400 font-normal">(select multiple)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {TAGS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                      tags.includes(tag)
                        ? 'bg-purple-50 border-purple-500 text-purple-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Skill (multi-select) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Skill <span className="text-xs text-gray-400 font-normal">(select multiple)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {SKILLS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSkill(s)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    skills.includes(s)
                      ? 'bg-teal-50 border-teal-500 text-teal-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LessonInfoView;
