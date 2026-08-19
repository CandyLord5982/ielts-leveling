import { Routes, Route, Navigate } from 'react-router-dom'
import UnitList from './UnitList'
import ExerciseList from './ExerciseList'
import UnitSessionManager from './UnitSessionManager'
import FlashcardExercise from '../exercises/FlashcardExercise'
import MultipleChoiceExercise from '../exercises/MultipleChoiceExercise'
import FillBlankExercise from '../exercises/FillBlankExercise'
import DragDropExercise from '../exercises/DragDropExercise'
import AIFillBlankExercise from '../exercises/AIFillBlankExercise'
import DropdownExercise from '../exercises/DropdownExercise'
import PronunciationExercise from '../exercises/PronunciationExercise'
import ImageHotspotExercise from '../exercises/ImageHotspotExercise'
import PDFWorksheetExercise from '../exercises/PDFWorksheetExercise'
import SpeakingAssessmentExercise from '../exercises/SpeakingAssessmentExercise'
import VideoUploadExercise from '../exercises/VideoUploadExercise'
import TestRunner from '../test/TestRunner'

const StudyModule = () => {
  return (
    <Routes>
      {/* Main study hierarchy */}
      <Route index element={<Navigate to="/" replace />} />
      {/* Course-based routes */}
      <Route path="course/:courseId" element={<UnitList />} />
      <Route path="course/:courseId/unit/:unitId" element={<UnitSessionManager />} />
      <Route path="course/:courseId/unit/:unitId/session/:sessionId" element={<ExerciseList />} />

      {/* Test runner */}
      <Route path="test-runner" element={<TestRunner />} />

      {/* Legacy level routes for compatibility */}
      <Route path="level/:levelId" element={<UnitList />} />
      <Route path="level/:levelId/unit/:unitId" element={<UnitSessionManager />} />
      <Route path="level/:levelId/unit/:unitId/session/:sessionId" element={<ExerciseList />} />

      {/* Exercise routes */}
      <Route path="flashcard" element={<FlashcardExercise />} />
      <Route path="fill-blank" element={<FillBlankExercise />} />
      <Route path="multiple-choice" element={<MultipleChoiceExercise />} />
      <Route path="drag-drop" element={<DragDropExercise />} />
      <Route path="ai-fill-blank" element={<AIFillBlankExercise />} />
      <Route path="dropdown" element={<DropdownExercise />} />
      <Route path="pronunciation" element={<PronunciationExercise />} />
      <Route path="image-hotspot" element={<ImageHotspotExercise />} />
      <Route path="pdf-worksheet" element={<PDFWorksheetExercise />} />
      <Route path="speaking-assessment" element={<SpeakingAssessmentExercise />} />
      <Route path="video-upload" element={<VideoUploadExercise />} />
    </Routes>
  )
}

export default StudyModule
