import React from 'react'
import { BrowserRouter as Router, Routes, Route, Outlet } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ProgressProvider } from './hooks/useProgress'
import { InventoryProvider } from './hooks/useInventory'
import { StudentLevelsProvider } from './hooks/useStudentLevels'
import { PetProvider } from './hooks/usePet'
import { BrandingProvider } from './hooks/useBranding'
import Layout from './components/Layout'
import Dashboard from './components/dashboard/Dashboard'
import LoginPage from './components/auth/LoginPage'
import RegisterPage from './components/auth/RegisterPage'
import NiceTryPage from './components/auth/NiceTryPage'
import StudyModule from './components/study/StudyModule'
import Leaderboard from './components/leaderboard/Leaderboard'
import Progress from './components/progress/Progress'
import Profile from './components/profile/Profile'
import Shop from './components/shop/Shop'
import Inventory from './components/inventory/Inventory'
import PetInventory from './components/pet/PetInventory'
import AdminDashboard from './components/admin/AdminDashboard'
import TeacherDashboard from './components/teacher/TeacherDashboard'
import TeacherExerciseBank from './components/teacher/TeacherExerciseBank'
import CourseReport from './components/teacher/CourseReport'
import TeacherClassReports from './components/teacher/rollcall/TeacherClassReports'
import TeacherCourseOverview from './components/teacher/TeacherCourseOverview'
import StudentLessonHistory from './components/teacher/reports/StudentLessonHistory'
import ProtectedRoute from './components/auth/ProtectedRoute'
import { TeacherCourseProvider } from './hooks/useTeacherCourseContext'
import { MissionsProvider } from './hooks/useMissions'
import { REGISTER_PATH } from './config/registration'
import MissionBoard from './components/missions/MissionBoard'
import LiveBattlePage from './components/livebattle/LiveBattlePage'
import UnitReportPage from './components/teacher/reports/UnitReportPage'
import WeaknessAnalysis from './components/teacher/WeaknessAnalysis'
import ReviewQueue from './components/review/ReviewQueue'
import { FEATURES } from './config/features'

function App() {
  return (
    <BrandingProvider>
    <AuthProvider>
      <ProgressProvider>
        <MissionsProvider>
        <InventoryProvider>
        <PetProvider>
        <StudentLevelsProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* /register is a decoy; the real form lives at REGISTER_PATH */}
              <Route path="/register" element={<NiceTryPage />} />
              <Route path={REGISTER_PATH} element={<RegisterPage />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Dashboard />} />
                <Route path="study/*" element={<StudyModule />} />
                <Route path="leaderboard" element={<Leaderboard />} />
                <Route path="progress" element={<Progress />} />
                <Route path="review" element={<ReviewQueue />} />
                <Route path="profile" element={<Profile />} />
                {FEATURES.shop && <Route path="shop" element={<Shop />} />}
                {FEATURES.inventory && <Route path="inventory" element={<Inventory />} />}
                {FEATURES.pets && <Route path="pets" element={<PetInventory />} />}
                {FEATURES.missions && <Route path="missions" element={<MissionBoard />} />}
                <Route path="profile/:userId" element={<Profile />} />
                <Route path="admin/*" element={
                  <ProtectedRoute requireAdmin>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                <Route element={<ProtectedRoute requireStaff><Outlet /></ProtectedRoute>}>
                  <Route path="teacher" element={<TeacherDashboard />} />
                  <Route path="teacher/overview" element={<TeacherCourseOverview />} />
                  <Route path="teacher/student-history/:courseId/:studentId" element={<StudentLessonHistory />} />
                  <Route path="teacher/exercise-bank" element={<TeacherExerciseBank />} />
                  <Route path="teacher/live-battle/:courseId" element={<LiveBattlePage />} />
                  <Route path="teacher/course-report/:courseId" element={<CourseReport />} />
                  <Route path="teacher/unit-report/:courseId" element={<UnitReportPage />} />
                  <Route path="teacher/weakness-analysis" element={<WeaknessAnalysis />} />
                  <Route path="teacher/class-reports" element={
                    <TeacherCourseProvider>
                      <TeacherClassReports />
                    </TeacherCourseProvider>
                  } />
                </Route>
              </Route>
            </Routes>
          </Router>
        </StudentLevelsProvider>
        </PetProvider>
        </InventoryProvider>
        </MissionsProvider>
      </ProgressProvider>
    </AuthProvider>
    </BrandingProvider>
  )
}

export default App
