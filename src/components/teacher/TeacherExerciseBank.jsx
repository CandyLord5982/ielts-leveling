import React from 'react';
import ExerciseBank from '../admin/ExerciseBank';

/**
 * Teacher Exercise Bank - Read-only view for teachers
 * Wraps the admin ExerciseBank component with teacher-specific context
 */
const TeacherExerciseBank = () => {
  return (
    <div className="h-screen flex flex-col">
      <ExerciseBank allowedTypes={null} />
    </div>
  );
};

export default TeacherExerciseBank;
