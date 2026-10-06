// src/components/admin/AdminDashboard.jsx
// Complete production admin dashboard using Supabase and external URLs for media

import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  Download,
  Users,
  BookOpen,
  BarChart3,
  FileText,
  Home,
  Trophy,
  ShoppingBag,
  Activity,
  Package,
  Cat,
  Gift,
  Bell,
  Palette,
  Menu,
  X,
  ImagePlus,
  Target,
  MessageSquarePlus,
  Swords,
  GitMerge
} from 'lucide-react';
import { supabase } from '../../supabase/client';
import { useAuth } from '../../hooks/useAuth';

// Import existing components
import AdminOverview from './AdminOverview';
import UserManagement from './UserManagement';
import ExerciseManagement from './ExerciseManagement';
import ExerciseBank from './ExerciseBank';
import CourseManagement from './CourseManagement';
import StudentEnrollmentManagement from './StudentEnrollmentManagement';

import CohortsManagement from './CohortsManagement';
import StudentLevelsManagement from './StudentLevelsManagement';
import AchievementManagement from './AchievementManagement';
import ShopManagement from './ShopManagement';
import InventoryManagement from './InventoryManagement';
import DailyChallengeManagement from './DailyChallengeManagement';
import PetManagement from './PetManagement';
import GiftcodeManagement from './GiftcodeManagement';
import NotificationManagement from './NotificationManagement';
import RecentActivities from './RecentActivities';
import LeaderboardSettings from './LeaderboardSettings';
import BrandingSettings from './BrandingSettings';
import AvatarApproval from './AvatarApproval';
import MissionManagement from './MissionManagement';
import ReportManagement from './ReportManagement';
import ClassWarManagement from './ClassWarManagement';
import TournamentManagement from './TournamentManagement';
import { useCohorts } from '../../hooks/useCohorts';
import { FEATURES } from '../../config/features';

const AdminDashboard = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [stats, setStats] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);
  const [pendingAvatarsCount, setPendingAvatarsCount] = useState(0);

  // Get current tab from URL
  const getCurrentTab = () => {
    const path = location.pathname.split('/admin/')[1] || '';
    return path.split('/')[0] || 'overview';
  };

  const [activeTab, setActiveTab] = useState(getCurrentTab());

  // Navigation handler
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSidebarOpen(false);
    if (tabId === 'overview') {
      navigate('/admin');
    } else {
      navigate(`/admin/${tabId}`);
    }
  };

  // Update active tab when URL changes
  useEffect(() => {
    setActiveTab(getCurrentTab());
  }, [location]);

  useEffect(() => {
    if (isAdmin()) {
      loadStats();
      fetchPendingReportsCount();
      fetchPendingAvatarsCount();
    }
  }, [isAdmin]);

  const fetchPendingAvatarsCount = async () => {
    try {
      const { count, error } = await supabase
        .from('avatar_uploads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (!error) setPendingAvatarsCount(count || 0)
    } catch { }
  }

  const fetchPendingReportsCount = async () => {
    try {
      const { count, error } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (!error) setPendingReportsCount(count || 0)
    } catch { }
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadStats = async () => {
    try {
      setLoading(true);

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [coursesResult, unitsResult, sessionsResult, exercisesResult, activeExercisesResult, usersResult, recentUsersResult] = await Promise.all([
        supabase.from('courses').select('*', { count: 'exact', head: true }),
        supabase.from('units').select('*', { count: 'exact', head: true }),
        supabase.from('sessions').select('*', { count: 'exact', head: true }),
        supabase.from('exercises').select('*', { count: 'exact', head: true }),
        supabase.from('exercises').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString())
      ]);

      const stats = {
        totalCourses: coursesResult.count || 0,
        totalUnits: unitsResult.count || 0,
        totalSessions: sessionsResult.count || 0,
        totalExercises: exercisesResult.count || 0,
        activeExercises: activeExercisesResult.count || 0,
        totalUsers: usersResult.count || 0,
        recentUsers: recentUsersResult.count || 0
      };

      setStats(stats);
    } catch (error) {
      console.error('Error loading stats:', error);
      showNotification('Error loading statistics', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showNotification(`Copied: ${text}`, 'success');
  };

  const handleExportContent = async () => {
    try {
      setLoading(true);

      const [coursesData, unitsData, sessionsData, exercisesData] = await Promise.all([
        supabase.from('courses').select('*'),
        supabase.from('units').select('*'),
        supabase.from('sessions').select('*'),
        supabase.from('exercises').select('*')
      ]);

      const exportData = {
        courses: coursesData.data || [],
        units: unitsData.data || [],
        sessions: sessionsData.data || [],
        exercises: exercisesData.data || [],
        exportedAt: new Date().toISOString(),
        version: '1.0'
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ielts-leveling-content-${new Date().toISOString().split('T')[0]}.json`;
      link.click();

      showNotification('Content exported successfully!');
    } catch (error) {
      showNotification('Error exporting content: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Show access denied if not admin
  if (!isAdmin()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">🚫</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Access Denied</h2>
            <p className="text-gray-600">Admin privileges required to access this page.</p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'bank', label: 'Exercise Bank', icon: FileText },
    { id: 'courses', label: 'Courses', icon: BookOpen },
    { id: 'cohorts', label: 'Cohorts', icon: Users },
    { id: 'enrollments', label: 'Enrollments', icon: Users },
    { id: 'levels', label: 'Student Levels', icon: BarChart3 },
    { id: 'achievements', label: 'Achievements', icon: Trophy },
    { id: 'daily-challenges', label: 'Daily Challenges', icon: Trophy },
    FEATURES.missions && { id: 'missions', label: 'Missions', icon: Target },
    FEATURES.shop && { id: 'shop', label: 'Shop', icon: ShoppingBag },
    FEATURES.inventory && { id: 'inventory', label: 'Inventory', icon: Package },
    FEATURES.pets && { id: 'pets', label: 'Pet Management', icon: Cat },
    { id: 'giftcodes', label: 'Gift Codes', icon: Gift },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'reports', label: 'Reports', icon: MessageSquarePlus },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'activities', label: 'Activities', icon: Activity },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    FEATURES.classwar && { id: 'class-war', label: 'Class War', icon: Swords },
    FEATURES.tournaments && { id: 'tournaments', label: 'Tournaments', icon: GitMerge },
    { id: 'avatar-approval', label: 'Avatar Approval', icon: ImagePlus },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'branding', label: 'Branding', icon: Palette }
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <div className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white shadow-lg border-r flex flex-col transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Sidebar Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-xs text-gray-600">Manage your IELTS Leveling platform</p>
          </div>
          <button className="lg:hidden text-gray-500" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sidebar */}
        <div className="flex-1 overflow-y-auto">
          <nav className="px-4 py-6 space-y-2">
            {tabs.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                >
                  <IconComponent className="w-4 h-4" />
                  {tab.label}
                  {tab.id === 'reports' && pendingReportsCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {pendingReportsCount}
                    </span>
                  )}
                  {tab.id === 'avatar-approval' && pendingAvatarsCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {pendingAvatarsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t">
          <button
            onClick={handleExportContent}
            disabled={loading}
            className="w-full bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs text-green-600 font-medium">Admin Access</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="px-4 lg:px-6 py-4">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden text-gray-500 hover:text-gray-700"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-6 h-6" />
              </button>
              <div>
                <h2 className="text-lg lg:text-xl font-semibold text-gray-900">
                  {tabs.find(tab => tab.id === activeTab)?.label || 'Dashboard'}
                </h2>
                <p className="text-sm text-gray-600 hidden sm:block">
                  {activeTab === 'overview' && 'Platform overview and statistics'}
                  {activeTab === 'courses' && 'Manage learning courses and assign teachers'}
                  {activeTab === 'cohorts' && 'Manage student cohorts'}
                  {activeTab === 'enrollments' && 'Assign students to courses'}
                  {activeTab === 'levels' && 'Manage student XP levels and badges'}
                  {activeTab === 'achievements' && 'Manage achievements and badges'}
                  {activeTab === 'missions' && 'Manage daily, weekly, and special missions'}
                  {activeTab === 'shop' && 'Manage shop items and pricing'}
                  {activeTab === 'inventory' && 'Manage collectible items, chests, and recipes'}
                  {activeTab === 'giftcodes' && 'Create and manage gift codes'}
                  {activeTab === 'notifications' && 'Send announcements to users'}
                  {activeTab === 'reports' && 'View and respond to user reports'}
                  {activeTab === 'users' && 'User management and profiles'}
                  {activeTab === 'activities' && 'Recent student exercise attempts'}
                  {activeTab === 'analytics' && 'Platform analytics and insights'}
                  {activeTab === 'avatar-approval' && 'Review and approve user-uploaded avatars'}
                  {activeTab === 'branding' && 'Customize site branding and asset URLs'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-auto">
          <div className="px-4 lg:px-6 pb-6 pt-6">
            {/* Quick Stats */}
            {stats && activeTab === 'overview' && (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
                <div className="bg-white rounded-lg shadow-sm p-4 border">
                  <div className="text-2xl font-bold text-blue-600">{stats.totalCourses}</div>
                  <div className="text-sm text-gray-600">Courses</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border">
                  <div className="text-2xl font-bold text-green-600">{stats.totalUnits}</div>
                  <div className="text-sm text-gray-600">Units</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border">
                  <div className="text-2xl font-bold text-purple-600">{stats.totalSessions}</div>
                  <div className="text-sm text-gray-600">Sessions</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border">
                  <div className="text-2xl font-bold text-orange-600">{stats.totalExercises}</div>
                  <div className="text-sm text-gray-600">Exercises</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border">
                  <div className="text-2xl font-bold text-indigo-600">{stats.totalUsers}</div>
                  <div className="text-sm text-gray-600">Users</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border">
                  <div className="text-2xl font-bold text-pink-600">{stats.recentUsers}</div>
                  <div className="text-sm text-gray-600">New (7d)</div>
                </div>
              </div>
            )}

            {/* Tab Content - Using React Router */}
            <Routes>
              <Route index element={<AdminOverview />} />

              <Route path="bank" element={<ExerciseBank isAdmin />} />
              <Route path="courses" element={<CourseManagement />} />
              <Route path="cohorts" element={<CohortsManagement />} />
              <Route path="enrollments" element={<StudentEnrollmentManagement />} />
              {/* Student Levels Management */}
              <Route path="levels" element={<StudentLevelsManagement />} />
              <Route path="achievements" element={<AchievementManagement />} />
              <Route path="daily-challenges" element={<DailyChallengeManagement />} />
              {FEATURES.missions && <Route path="missions" element={<MissionManagement />} />}
              {FEATURES.shop && <Route path="shop" element={<ShopManagement />} />}
              {FEATURES.inventory && <Route path="inventory" element={<InventoryManagement />} />}
              {FEATURES.pets && <Route path="pets" element={<PetManagement />} />}
              <Route path="giftcodes" element={<GiftcodeManagement />} />
              <Route path="notifications" element={<NotificationManagement />} />
              <Route path="reports" element={<ReportManagement />} />
              {/* Redirect legacy exercises path to bank */}
              <Route path="exercises" element={<ExerciseBank isAdmin />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="activities" element={<RecentActivities />} />
              <Route path="leaderboard" element={<LeaderboardSettings />} />
              {FEATURES.classwar && <Route path="class-war" element={<ClassWarManagement />} />}
              {FEATURES.tournaments && <Route path="tournaments" element={<TournamentManagement />} />}
              <Route path="avatar-approval" element={<AvatarApproval />} />
              <Route path="analytics" element={<AnalyticsView stats={stats} />} />
              <Route path="branding" element={<BrandingSettings />} />
            </Routes>
          </div>
        </div>
      </div>

      {/* Notification Display */}
      {notification && (
        <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${notification.type === 'error'
            ? 'bg-red-500 text-white'
            : 'bg-green-500 text-white'
          }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'error' ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <CheckCircle className="w-5 h-5" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span>Loading...</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Analytics View Component
const AnalyticsView = ({ stats }) => {
  const [detailedStats, setDetailedStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDetailedStats();
  }, []);

  const loadDetailedStats = async () => {
    try {
      setLoading(true);

      // Get exercise type distribution
      const { data: exercises } = await supabase
        .from('exercises')
        .select('exercise_type');

      // Get user progress data
      const { data: userProgress } = await supabase
        .from('user_progress')
        .select('status, score, attempts');

      // Process exercise types
      const exerciseTypes = {};
      exercises?.forEach(ex => {
        exerciseTypes[ex.exercise_type] = (exerciseTypes[ex.exercise_type] || 0) + 1;
      });

      // Process completion rates
      const completionStats = {
        completed: userProgress?.filter(p => p.status === 'completed').length || 0,
        in_progress: userProgress?.filter(p => p.status === 'in_progress').length || 0,
        not_started: userProgress?.filter(p => p.status === 'not_started').length || 0
      };

      // Average scores
      const completedProgress = userProgress?.filter(p => p.score !== null) || [];
      const avgScore = completedProgress.length > 0
        ? Math.round(completedProgress.reduce((sum, p) => sum + p.score, 0) / completedProgress.length)
        : 0;

      setDetailedStats({
        exerciseTypes,
        completionStats,
        avgScore,
        totalAttempts: userProgress?.reduce((sum, p) => sum + (p.attempts || 0), 0) || 0
      });

    } catch (error) {
      console.error('Error loading detailed stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Content Overview */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Content Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Total Content</p>
            <p className="text-2xl font-bold text-blue-600">
              {(stats?.totalCourses || 0) + (stats?.totalUnits || 0) + (stats?.totalSessions || 0)}
            </p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Active Exercises</p>
            <p className="text-2xl font-bold text-green-600">{stats?.activeExercises || 0}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Avg Score</p>
            <p className="text-2xl font-bold text-purple-600">{detailedStats?.avgScore || 0}%</p>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Total Attempts</p>
            <p className="text-2xl font-bold text-orange-600">{detailedStats?.totalAttempts || 0}</p>
          </div>
        </div>
      </div>

      {/* Exercise Types Distribution */}
      {detailedStats?.exerciseTypes && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Exercise Types</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(detailedStats.exerciseTypes).map(([type, count]) => (
              <div key={type} className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600 capitalize">{type.replace('_', ' ')}</div>
                <div className="text-xl font-bold text-gray-800">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completion Statistics */}
      {detailedStats?.completionStats && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Progress Distribution</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">{detailedStats.completionStats.completed}</div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-yellow-600">{detailedStats.completionStats.in_progress}</div>
              <div className="text-sm text-gray-600">In Progress</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-gray-600">{detailedStats.completionStats.not_started}</div>
              <div className="text-sm text-gray-600">Not Started</div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-4 text-left hover:bg-blue-100 transition-colors">
            <div className="font-medium text-blue-800">Create New Content</div>
            <div className="text-sm text-blue-600">Add courses, units, or exercises</div>
          </button>
          <button className="bg-green-50 border-2 border-dashed border-green-300 rounded-lg p-4 text-left hover:bg-green-100 transition-colors">
            <div className="font-medium text-green-800">Bulk Operations</div>
            <div className="text-sm text-green-600">Import/export content</div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;