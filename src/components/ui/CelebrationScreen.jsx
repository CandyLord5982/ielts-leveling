import { useState, useEffect } from "react";
import { CheckCircle, XCircle, RotateCcw, Trophy, Loader2 } from "lucide-react";
import Button3D from "../ui/Button3D";
import { supabase } from "../../supabase/client";
import { useAuth } from "../../hooks/useAuth";
import { useProgress } from "../../hooks/useProgress";
import { usePet } from "../../hooks/usePet";
import AvatarWithFrame from "./AvatarWithFrame";

import { assetUrl } from '../../hooks/useBranding';
const formatTime = (seconds) => {
  if (!seconds || seconds <= 0) return "--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
};

const CelebrationScreen = ({
  score,
  correctAnswers,
  totalQuestions,
  passThreshold = 80,
  xpAwarded = 0,
  passGif,
  isRetryMode = false,
  wrongQuestionsCount = 0,
  onRetryWrongQuestions,
  onBackToList,
  backButtonText = "Quay lại danh sách bài tập",
  exerciseId,
}) => {
  const { user } = useAuth();
  const { getEquippedItemsXPBonus } = useProgress();
  const { getActiveBonuses } = usePet();
  const passed = score >= passThreshold;
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [bonusInfo, setBonusInfo] = useState({ petBonus: 0, itemBonus: 0, itemDetails: [] });

  useEffect(() => {
    if (exerciseId && !isRetryMode) {
      fetchExerciseLeaderboard();
    }
  }, [exerciseId, isRetryMode]);

  useEffect(() => {
    if (xpAwarded > 0 && passed) {
      const fetchBonuses = async () => {
        const petBonuses = getActiveBonuses();
        const petBonus = petBonuses.reduce((s, b) => s + (b.value || 0), 0);
        const itemResult = await getEquippedItemsXPBonus();
        setBonusInfo({ petBonus, itemBonus: itemResult.total, itemDetails: itemResult.items });
      };
      fetchBonuses();
    }
  }, [xpAwarded, passed]);

  const fetchExerciseLeaderboard = async () => {
    try {
      setLeaderboardLoading(true);
      const { data, error } = await supabase
        .from("user_progress")
        .select(`
          user_id,
          score,
          max_score,
          time_spent,
          users (
            id,
            full_name,
            email,
            avatar_url,
            user_equipment(active_title, active_frame_ratio, hide_frame)
          )
        `)
        .eq("exercise_id", exerciseId)
        .eq("status", "completed")
        .order("score", { ascending: false })
        .order("time_spent", { ascending: true })
        .limit(5);

      if (error) throw error;

      const formatted = (data || [])
        .filter((d) => d.users)
        .map((d, i) => {
          const { user_equipment, ...userRest } = d.users;
          const u = { ...userRest, ...user_equipment };
          return {
            rank: i + 1,
            userId: d.user_id,
            name: (() => {
              const full = u.full_name || u.email?.split("@")[0] || "User";
              const parts = full.trim().split(/\s+/);
              return parts.length > 2 ? parts.slice(-2).join(" ") : full;
            })(),
            avatar: u.avatar_url,
            frame: u.hide_frame ? null : u.active_title,
            frameRatio: u.active_frame_ratio,
            score: d.max_score ? Math.round((d.score / d.max_score) * 100) : d.score,
            time: d.time_spent,
          };
        });

      setLeaderboard(formatted);
    } catch (err) {
      console.error("Error fetching exercise leaderboard:", err);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  // Get star count based on score: 90-100 = 3 stars, 80-90 = 2 stars, passed = 1 star
  const getStarCount = () => {
    if (!passed) return 0;
    if (score >= 90) return 3;
    if (score >= 80) return 2;
    return 1;
  };

  const starCount = getStarCount();

  // Retry mode completion screen
  if (isRetryMode) {
    const allCorrect = correctAnswers === totalQuestions;
    return (
      <div className="bg-white rounded-lg shadow-md p-4 md:p-8 text-center border border-gray-200">
        <div className="mb-4">
          <div
            className={`w-16 h-16 md:w-20 md:h-20 mx-auto mb-3 ${allCorrect ? "bg-green-100" : "bg-orange-100"} rounded-full flex items-center justify-center`}
          >
            {allCorrect ? (
              <CheckCircle className="w-8 h-8 md:w-10 md:h-10 text-green-500" />
            ) : (
              <XCircle className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
            )}
          </div>
          <h2
            className={`text-lg md:text-2xl font-bold mb-2 ${allCorrect ? "text-green-800" : "text-orange-800"}`}
          >
            {allCorrect ? "Đã hoàn thành ôn lại!" : "Cần cải thiện thêm!"}
          </h2>
          <p className="text-sm md:text-base text-gray-600 mb-2">
            Bạn đã trả lời đúng {correctAnswers}/{totalQuestions} câu ôn lại (
            {score}%)
          </p>
          {!allCorrect && (
            <p className="text-sm md:text-base text-orange-600 font-semibold mb-3">
              Hãy tiếp tục luyện tập để cải thiện!
            </p>
          )}
        </div>

        <div className="space-y-4">
          <Button3D
            onClick={onBackToList}
            color="blue"
            size="md"
            fullWidth={false}
            className="flex items-center justify-center"
          >
            {backButtonText}
          </Button3D>
        </div>
      </div>
    );
  }

  // Normal mode completion screen
  return (
    <div className="relative mt-16 w-[95%] max-w-[400px] mx-auto">
      {/* Stars above ribbon */}
      {starCount > 0 && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-30">
          <img
            src={assetUrl(`/image/${starCount}_star.png`)}
            alt={`${starCount} star`}
            className="h-16 md:h-20 drop-shadow-lg"
          />
        </div>
      )}

      {/* Orange ribbon banner */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 w-[105%]">
        <div className="bg-gradient-to-b from-orange-400 to-orange-500 rounded-lg py-3 px-6 shadow-lg border-b-4 border-orange-600 text-center">
          <p className="text-orange-200 text-xs font-semibold tracking-wider uppercase">
            {passed ? "Exercise" : "Try Again"}
          </p>
          <p className="text-white text-2xl font-extrabold tracking-wide drop-shadow-md" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.2)' }}>
            {passed ? "COMPLETE!" : "INCOMPLETE"}
          </p>
        </div>
      
      </div>

      {/* Main card */}
      <div className="bg-gradient-to-b from-orange-50 to-orange-100 rounded-3xl shadow-xl pt-20 pb-8 px-8 md:pt-16 md:pb-6 md:px-6 border-4 border-orange-200 text-center">

        {/* Score section */}
        <div className="mb-4">
          <p className="text-orange-300 mt-4 text-2xl font-extrabold tracking-wider uppercase mb-2">Score</p>
          <div className="inline-block bg-white rounded-full py-3 px-12 shadow-inner border-2 border-orange-100">
            <p className="text-4xl font-extrabold text-orange-800">{score}%</p>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center justify-center gap-2 my-4">
          <div className="h-0.5 w-8 bg-orange-200 rounded"></div>
          <div className="w-2 h-2 bg-orange-200 rounded-full"></div>
          <div className="h-0.5 w-8 bg-orange-200 rounded"></div>
        </div>

        {/* XP Reward section - only show when passed */}
        {xpAwarded > 0 && passed && (() => {
          const totalBonusPercent = bonusInfo.petBonus + bonusInfo.itemBonus;
          const baseXP = totalBonusPercent > 0 ? Math.round(xpAwarded / (1 + totalBonusPercent / 100)) : xpAwarded;
          const bonusXP = xpAwarded - baseXP;
          return (
            <div className="mb-4">
              <p className="text-orange-300 text-sm md:text-2xl font-extrabold tracking-wider uppercase mb-2">Reward</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-3xl md:text-5xl font-extrabold text-orange-800">{xpAwarded}</span>
                <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-8 h-8 md:w-12 md:h-12" />
              </div>
              {bonusXP > 0 && (
                <div className="mt-2 bg-white/60 rounded-xl py-2 px-4 inline-block">
                  <p className="text-xs text-gray-500 mb-1">{baseXP} base + {bonusXP} bonus</p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    {bonusInfo.petBonus > 0 && (
                      <span className="text-xs font-bold text-purple-600">Pet +{bonusInfo.petBonus}%</span>
                    )}
                    {bonusInfo.itemDetails.map((item, i) => (
                      <span key={i} className="text-xs font-bold text-blue-600">{item.name} +{item.bonus}%</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Exercise Leaderboard */}
        {leaderboard.length >= 2 && (
          <div className="mb-4">
            {/* Divider */}
            <div className="flex items-center justify-center gap-2 my-4">
              <div className="h-0.5 w-8 bg-orange-200 rounded"></div>
              <div className="w-2 h-2 bg-orange-200 rounded-full"></div>
              <div className="h-0.5 w-8 bg-orange-200 rounded"></div>
            </div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-orange-400" />
              <p className="text-orange-300 text-sm md:text-lg font-extrabold tracking-wider uppercase">Leaderboard</p>
              <Trophy className="w-4 h-4 text-orange-400" />
            </div>
            <div className="bg-white rounded-xl border-2 border-orange-100 overflow-hidden">
              {leaderboard.map((entry) => (
                <div
                  key={entry.userId}
                  className={`flex items-center gap-2 px-3 py-2 text-left ${
                    user && entry.userId === user.id
                      ? "bg-orange-100 border-l-4 border-orange-400"
                      : "border-l-4 border-transparent"
                  } ${entry.rank < leaderboard.length ? "border-b border-orange-50" : ""}`}
                >
                  <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${
                    entry.rank === 1 ? "text-yellow-500" : entry.rank === 2 ? "text-gray-400" : entry.rank === 3 ? "text-orange-400" : "text-gray-500"
                  }`}>
                    #{entry.rank}
                  </span>
                  <div className="flex-shrink-0">
                    <AvatarWithFrame
                      avatarUrl={entry.avatar}
                      frameUrl={entry.frame}
                      frameRatio={entry.frameRatio}
                      size={24}
                      fallback={entry.name.charAt(0).toUpperCase()}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-800 truncate flex-1 min-w-0">
                    {entry.name}
                  </span>
                  <span className="text-xs font-bold text-orange-600 flex-shrink-0">{entry.score}%</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0 w-10 text-right">{formatTime(entry.time)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {leaderboardLoading && (
          <div className="flex justify-center my-3">
            <Loader2 className="w-5 h-5 text-orange-300 animate-spin" />
          </div>
        )}

        {/* Celebration GIF - hidden when leaderboard is shown to save space */}
        {passed && passGif && leaderboard.length < 2 && (
          <div className="my-4">
            <img
              src={passGif}
              alt="Celebration"
              className="mx-auto rounded-xl shadow-lg"
              style={{ maxWidth: "200px", width: "100%", height: "auto" }}
            />
          </div>
        )}

        {/* Failed message */}
        {!passed && (
          <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-200">
            <p className="text-sm text-red-600 font-medium">
              Cần đạt ít nhất {passThreshold}% để hoàn thành
            </p>
          </div>
        )}

        {/* Retry wrong questions button */}
        {wrongQuestionsCount > 0 && onRetryWrongQuestions && (
          <button
            onClick={onRetryWrongQuestions}
            className="mb-3 py-3 px-16 bg-gradient-to-b from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 text-white rounded-full font-bold shadow-lg border-b-4 border-orange-600 active:border-b-0 active:mt-1 transition-all inline-flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            Ôn lại {wrongQuestionsCount} câu sai
          </button>
        )}

        {/* OK Button - Teal style like the image */}
        <button
          onClick={onBackToList}
          className="py-4 px-16 bg-gradient-to-b from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600 text-white rounded-full font-extrabold text-xl shadow-lg border-b-4 border-cyan-600 active:border-b-0 active:mt-1 transition-all"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default CelebrationScreen;
