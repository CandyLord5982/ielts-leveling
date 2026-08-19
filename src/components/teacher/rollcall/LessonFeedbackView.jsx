import React from 'react';

const LessonFeedbackView = ({ lessonInfo, onChange }) => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Lesson Feedback
          </label>
          <p className="text-sm text-gray-500 mb-3">
            Notes about how the lesson went, what worked well, what to improve, etc.
          </p>
          <textarea
            placeholder="Write your feedback about this lesson..."
            value={lessonInfo.feedback || ''}
            onChange={(e) => onChange({ feedback: e.target.value })}
            rows={10}
            className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
          />
        </div>
      </div>
    </div>
  );
};

export default LessonFeedbackView;
