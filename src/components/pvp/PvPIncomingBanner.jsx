import { useState, useEffect } from "react";
import { X, MessageCircle } from "lucide-react";
import { supabase } from "../../supabase/client";
import { useAuth } from "../../hooks/useAuth";
import PvPChallengeModal from "./PvPChallengeModal";
import { assetUrl } from "../../hooks/useBranding";
import { fetchPvpSchedule, checkPvpAvailability } from "../../utils/pvpSchedule";

const TAUNT_GIF_BASE = assetUrl("/gif/taunt");

const PVP_TAUNTS = {
  messages: [
    "Better luck next time! 😏",
    "Too easy! 💪",
    "GG EZ 😎",
    "Get rekt! 💀",
    "Not even close! 🔥",
    "Practice more! 📚",
    "Is that all you got? 🥱",
    "Bow to the champ! 👑",
  ],
  emojis: ["😎", "💪", "🏆", "😂", "🔥", "👑", "💀", "🥱", "😤", "🤡", "👋"],
  gifs: [
    { value: `${TAUNT_GIF_BASE}/1.gif`, label: "Deal with it" },
    { value: `${TAUNT_GIF_BASE}/2.gif`, label: "Victory dance" },
    { value: `${TAUNT_GIF_BASE}/3.gif`, label: "Bye bye" },
    { value: `${TAUNT_GIF_BASE}/4.gif`, label: "Too easy" },
    { value: `${TAUNT_GIF_BASE}/5.gif`, label: "Loser" },
    { value: `${TAUNT_GIF_BASE}/6.gif`, label: "Cry" },
    { value: `${TAUNT_GIF_BASE}/7.gif`, label: "Deal with it" },
    { value: `${TAUNT_GIF_BASE}/8.gif`, label: "Victory dance" },
    { value: `${TAUNT_GIF_BASE}/9.gif`, label: "Bye bye" },
    { value: `${TAUNT_GIF_BASE}/10.gif`, label: "Too easy" },
    { value: `${TAUNT_GIF_BASE}/11.gif`, label: "Loser" },
    { value: `${TAUNT_GIF_BASE}/12.gif`, label: "Cry" },
  ],
};

const TauntPicker = ({ challengeId, onSent }) => {
  const [tab, setTab] = useState("emojis");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const sendTaunt = async (type, value) => {
    setSending(true);
    try {
      const taunt = JSON.stringify({ type, value });
      await supabase
        .from("pvp_challenges")
        .update({ winner_taunt: taunt })
        .eq("id", challengeId);
      setSent(true);
      onSent?.(taunt);
    } catch (e) {
      console.error("Failed to send taunt:", e);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center py-2">
        <span className="text-sm font-bold text-green-500 animate-bounce inline-block">
          Taunt sent! 😈
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-gray-500 mb-2 text-center">
        Send a taunt! 😈
      </p>
      <div className="flex gap-1 mb-2 justify-center">
        {[
          { key: "emojis", icon: "😎", label: "Emoji" },
          { key: "messages", icon: "💬", label: "Message" },
          { key: "gifs", icon: "🎬", label: "Sticker" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              tab === t.key
                ? "bg-red-500 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="max-h-32 overflow-y-auto">
        {tab === "emojis" && (
          <div className="grid grid-cols-6 gap-1">
            {PVP_TAUNTS.emojis.map((emoji, i) => (
              <button
                key={i}
                onClick={() => sendTaunt("emoji", emoji)}
                disabled={sending}
                className="text-2xl p-1 rounded-lg hover:bg-yellow-50 active:scale-90 transition disabled:opacity-50"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {tab === "messages" && (
          <div className="space-y-1">
            {PVP_TAUNTS.messages.map((msg, i) => (
              <button
                key={i}
                onClick={() => sendTaunt("message", msg)}
                disabled={sending}
                className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition disabled:opacity-50"
              >
                {msg}
              </button>
            ))}
          </div>
        )}
        {tab === "gifs" && (
          <div className="grid grid-cols-3 gap-1">
            {PVP_TAUNTS.gifs.map((gif, i) => (
              <button
                key={i}
                onClick={() => sendTaunt("gif", gif.value)}
                disabled={sending}
                className="flex flex-col items-center p-2 rounded-lg hover:bg-purple-50 transition disabled:opacity-50"
              >
                {gif.value.startsWith("http") ? (
                  <img
                    src={gif.value}
                    alt={gif.label}
                    className="w-12 h-12 object-cover rounded"
                  />
                ) : (
                  <span className="text-2xl">{gif.value}</span>
                )}
                <span className="text-[10px] text-gray-400 mt-0.5">
                  {gif.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const TauntDisplay = ({ tauntJson }) => {
  if (!tauntJson) return null;
  try {
    const taunt =
      typeof tauntJson === "string" ? JSON.parse(tauntJson) : tauntJson;
    if (taunt.type === "emoji") {
      return (
        <span className="text-2xl animate-bounce inline-block ml-auto">
          {taunt.value}
        </span>
      );
    }
    if (taunt.type === "gif") {
      return (
        <span className="ml-auto flex-shrink-0">
          {taunt.value.startsWith("http") ? (
            <img
              src={taunt.value}
              alt="taunt"
              className="w-10 h-10 rounded-lg object-cover"
            />
          ) : (
            <span className="text-xl animate-bounce inline-block">
              {taunt.value}
            </span>
          )}
        </span>
      );
    }
    return (
      <span className="ml-auto text-[10px] text-red-500 font-medium flex-shrink-0">
        &ldquo;{taunt.value}&rdquo;
      </span>
    );
  } catch {
    return null;
  }
};

const PvPIncomingBanner = () => {
  const { user, profile } = useAuth();
  const [challenges, setChallenges] = useState([]);
  const [acceptedChallenge, setAcceptedChallenge] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("pvp_dismissed_challenges") || "[]",
      );
      return new Set(saved);
    } catch {
      return new Set();
    }
  });
  const [results, setResults] = useState([]);
  const [dismissedResults, setDismissedResults] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("pvp_dismissed_results") || "[]",
      );
      return new Set(saved);
    } catch {
      return new Set();
    }
  });
  const [openTauntId, setOpenTauntId] = useState(null);
  const [pvpAvailable, setPvpAvailable] = useState(true);

  useEffect(() => {
    const checkSchedule = async () => {
      const schedule = await fetchPvpSchedule();
      setPvpAvailable(checkPvpAvailability(schedule).available);
    };
    checkSchedule();
    const scheduleInterval = setInterval(checkSchedule, 60000);
    return () => clearInterval(scheduleInterval);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const fetchChallenges = async () => {
      const { data, error } = await supabase
        .from("pvp_challenges")
        .select(
          `
          id,
          challenger_id,
          game_type,
          challenger_score,
          status,
          created_at,
          realtime_mode,
          word_seed,
          challenger:users!pvp_challenges_challenger_id_fkey(id, full_name, avatar_url)
        `,
        )
        .eq("opponent_id", user.id)
        .eq("status", "pending")
        .gte(
          "created_at",
          new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        )
        .order("created_at", { ascending: false })
        .limit(2);

      if (!error && data) {
        setChallenges(data.filter((c) => !dismissed.has(c.id)));
      }
    };

    const fetchResults = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Auto-forfeit stale in_progress challenges (older than 2 minutes)
      const staleThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: stale } = await supabase
        .from("pvp_challenges")
        .select("id, challenger_id")
        .eq("status", "in_progress")
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .lt("created_at", staleThreshold);

      if (stale?.length) {
        for (const s of stale) {
          // Fetch challenger score to determine fair winner
          const { data: challenge } = await supabase
            .from("pvp_challenges")
            .select("challenger_score")
            .eq("id", s.id)
            .single();
          const cScore = challenge?.challenger_score ?? 0;
          await supabase
            .from("pvp_challenges")
            .update({
              opponent_score: 0,
              status: "completed",
              winner_id: cScore > 0 ? s.challenger_id : null,
            })
            .eq("id", s.id);
        }
      }

      const { data, error } = await supabase
        .from("pvp_challenges")
        .select(
          `
          id,
          challenger_id,
          opponent_id,
          game_type,
          challenger_score,
          opponent_score,
          winner_id,
          winner_taunt,
          status,
          created_at,
          challenger:users!pvp_challenges_challenger_id_fkey(id, full_name, avatar_url),
          opponent:users!pvp_challenges_opponent_id_fkey(id, full_name, avatar_url)
        `,
        )
        .eq("status", "completed")
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2);

      if (!error && data) {
        setResults(data.filter((r) => !dismissedResults.has(r.id)));
      }
    };

    fetchChallenges();
    fetchResults();
    const interval = setInterval(() => {
      fetchChallenges();
      fetchResults();
    }, 30000);

    const channel = supabase
      .channel("pvp-challenges")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pvp_challenges",
          filter: `opponent_id=eq.${user.id}`,
        },
        () => {
          fetchChallenges();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pvp_challenges",
          filter: `challenger_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new?.winner_taunt) {
            // Un-dismiss so challenger sees the taunt
            setDismissedResults((prev) => {
              if (!prev.has(payload.new.id)) return prev;
              const next = new Set(prev);
              next.delete(payload.new.id);
              localStorage.setItem(
                "pvp_dismissed_results",
                JSON.stringify([...next]),
              );
              return next;
            });
            fetchResults();
          } else if (
            payload.new?.status === "completed" &&
            payload.new?.winner_id === user.id
          ) {
            // Challenger won — show immediately so they can send a taunt
            fetchResults();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pvp_challenges",
          filter: `opponent_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new?.winner_taunt) {
            // Un-dismiss so opponent sees the taunt
            setDismissedResults((prev) => {
              if (!prev.has(payload.new.id)) return prev;
              const next = new Set(prev);
              next.delete(payload.new.id);
              localStorage.setItem(
                "pvp_dismissed_results",
                JSON.stringify([...next]),
              );
              return next;
            });
            fetchResults();
          }
        },
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user?.id, dismissed, dismissedResults]);

  const handleAccept = (challenge) => {
    setAcceptedChallenge(challenge);
  };

  const handleDismiss = (challengeId) => {
    setDismissed((prev) => {
      const next = new Set([...prev, challengeId]);
      localStorage.setItem(
        "pvp_dismissed_challenges",
        JSON.stringify([...next]),
      );
      return next;
    });
  };

  const handleDismissResult = (resultId) => {
    setDismissedResults((prev) => {
      const next = new Set([...prev, resultId]);
      localStorage.setItem("pvp_dismissed_results", JSON.stringify([...next]));
      return next;
    });
  };

  const handleBattleClose = async () => {
    if (acceptedChallenge) {
      setDismissed((prev) => new Set([...prev, acceptedChallenge.id]));
      handleDismissResult(acceptedChallenge.id);
    }
    setAcceptedChallenge(null);
  };

  const visibleChallenges = challenges.filter((c) => !dismissed.has(c.id));
  const visibleResults = results.filter(
    (r) => !dismissedResults.has(r.id) && r.id !== acceptedChallenge?.id,
  );

  if (
    profile?.is_banned ||
    (visibleChallenges.length === 0 &&
    visibleResults.length === 0 &&
    !acceptedChallenge)
  )
    return null;

  return (
    <>
      <div className="fixed bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 lg:left-auto lg:right-4 lg:translate-x-0 z-50 space-y-2 w-full max-w-sm px-4 lg:px-0">
        {/* Results for completed challenges */}
        {visibleResults.map((result) => {
          const isChallenger = result.challenger_id === user.id;
          const won = result.winner_id === user.id;
          const draw = !result.winner_id;
          const otherPlayer = isChallenger
            ? result.opponent
            : result.challenger;
          const otherName = otherPlayer?.full_name || "Opponent";
          const myScore = isChallenger
            ? result.challenger_score
            : result.opponent_score;
          const theirScore = isChallenger
            ? result.opponent_score
            : result.challenger_score;
          const showTauntPicker =
            won && !result.winner_taunt && openTauntId === result.id;
          const lost = !won && !draw;

          return (
            <div
              key={result.id}
              className={`bg-white rounded-xl shadow-lg border-2 px-3 py-2 animate-bounce-in ${won ? "border-green-200" : draw ? "border-yellow-200" : "border-gray-200"}`}
            >
              <div className="flex items-center gap-2">
                <div className="relative flex-shrink-0">
                  {otherPlayer?.avatar_url ? (
                    <img
                      src={otherPlayer.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-orange-400 flex items-center justify-center text-white text-sm font-bold">
                      {otherName[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  <img
                    src={assetUrl("/icon/dashboard/pvp.png")}
                    alt="PvP"
                    className="absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-full p-0.5"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-xs font-bold ${won ? "text-green-600" : draw ? "text-yellow-600" : "text-red-600"}`}
                  >
                    {won ? "You won!" : draw ? "It's a draw!" : "You lost!"} vs{" "}
                    {otherName}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {result.game_type} -{" "}
                    <span className="font-bold text-blue-500">{myScore}</span>{" "}
                    vs{" "}
                    <span className="font-bold text-red-500">{theirScore}</span>
                    {won && (
                      <span className="ml-1 text-green-500 font-bold">
                        +10 XP
                      </span>
                    )}
                  </div>
                </div>
                {/* Taunt display inline on the right */}
                {lost && result.winner_taunt && (
                  <TauntDisplay tauntJson={result.winner_taunt} />
                )}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {won && !result.winner_taunt && (
                    <button
                      onClick={() =>
                        setOpenTauntId(
                          openTauntId === result.id ? null : result.id,
                        )
                      }
                      className="p-1 rounded-lg bg-orange-100 text-orange-500 hover:bg-orange-200 transition"
                      title="Send taunt"
                    >
                      <MessageCircle size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDismissResult(result.id)}
                    className="p-1 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 transition"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              {/* Show taunt picker when user won */}
              {showTauntPicker && (
                <TauntPicker
                  challengeId={result.id}
                  onSent={() => {
                    setOpenTauntId(null);
                    handleDismissResult(result.id);
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Incoming challenges */}
        {visibleChallenges.map((challenge) => (
          <div
            key={challenge.id}
            className="bg-white rounded-xl shadow-lg border-2 border-red-200 p-3 animate-bounce-in"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                {challenge.challenger?.avatar_url ? (
                  <img
                    src={challenge.challenger.avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-400 to-orange-400 flex items-center justify-center text-white font-bold">
                    {challenge.challenger?.full_name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <img
                  src={assetUrl("/icon/dashboard/pvp.png")}
                  alt="PvP"
                  className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-white rounded-full p-0.5"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-800">
                  {challenge.challenger?.full_name || "Someone"} challenged you!
                </div>
                <div className="text-xs text-gray-500">
                  {challenge.realtime_mode && <span className="inline-block bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded mr-1">LIVE</span>}
                  {challenge.game_type}{challenge.realtime_mode ? ' - Join now!' : <> - Score to beat:{" "}<span className="font-bold text-red-500">???</span></>}
                </div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => pvpAvailable && handleAccept(challenge)}
                  disabled={!pvpAvailable}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${pvpAvailable ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                  title={!pvpAvailable ? 'PvP is not available right now' : 'Accept challenge'}
                >
                  {pvpAvailable ? 'Fight!' : 'Closed'}
                </button>
                <button
                  onClick={() => handleDismiss(challenge.id)}
                  className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 transition"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {acceptedChallenge && (
        <PvPResponseModal
          challenge={acceptedChallenge}
          onClose={handleBattleClose}
        />
      )}
    </>
  );
};

// Separate component for responding to a challenge
import { usePet as usePetHook } from "../../hooks/usePet";
import PetWhackMole from "../pet/games/PetWhackMole";
import PetWordScramble from "../pet/games/PetWordScramble";
import PetAstroBlast from "../pet/games/PetAstroBlast";
import PetMatchGame from "../pet/games/PetMatchGame";
import PetFlappyGame from "../pet/games/PetFlappyGame";
import PetWordType from "../pet/games/PetWordType";
import PetBombParty from "../pet/games/PetBombParty";
import PetSayItRight from "../pet/games/PetSayItRight";
import PetQuizRush from "../pet/games/PetQuizRush";
import PetAngryPet from "../pet/games/PetAngryPet";
import PetFishingGame from "../pet/games/PetFishingGame";
import PvPRealtimeWordType from "./PvPRealtimeWordType";
import PvPRealtimeWordScramble from "./PvPRealtimeWordScramble";
import PvPRealtimeMatchGame from "./PvPRealtimeMatchGame";
import { createPortal } from "react-dom";
import { Trophy } from "lucide-react";

const PvPResponseModal = ({ challenge, onClose }) => {
  const { user, profile } = useAuth();
  const { activePet, playWithPet } = usePetHook();
  const [step, setStep] = useState("ready"); // ready | playing | result
  const [myScore, setMyScore] = useState(null);
  const [wordBank, setWordBank] = useState([]);
  const [questionBank, setQuestionBank] = useState([]);
  const [saving, setSaving] = useState(false);
  const [wordBankLoading, setWordBankLoading] = useState(true);

  const [opponentScore, setOpponentScore] = useState(challenge.challenger_score);
  const [challengerPetUrl, setChallengerPetUrl] = useState(null);
  const opponentName = challenge.challenger?.full_name || "Opponent";
  const gameType = challenge.game_type;

  useEffect(() => {
    const fetchChallengerPet = async () => {
      const { data } = await supabase.rpc('get_active_pet', { p_user_id: challenge.challenger_id });
      if (data?.pet?.image_url) setChallengerPetUrl(data.pet.image_url);
    };
    fetchChallengerPet();
  }, [challenge.challenger_id]);

  useEffect(() => {
    const fetchWords = async () => {
      setWordBankLoading(true);
      const { data } = await supabase
        .from("pet_word_bank")
        .select("word, hint, image_url")
        .eq("is_active", true)
        .lte("min_level", profile?.current_level || 1);
      if (data && data.length >= 10) setWordBank(data);

      const { data: questions } = await supabase
        .from("pet_question_bank")
        .select("question, choices, answer_index, image_url")
        .eq("is_active", true)
        .lte("min_level", profile?.current_level || 1);
      if (questions && questions.length >= 5) setQuestionBank(questions);

      setWordBankLoading(false);
    };
    fetchWords();
  }, []);

  const handleGameEnd = async (score) => {
    setMyScore(score);
    setStep("result");
    setSaving(true);

    try {
      // Fetch fresh challenger score in case it was 0 when we started
      const { data: fresh } = await supabase
        .from("pvp_challenges")
        .select("challenger_score")
        .eq("id", challenge.id)
        .single();
      const freshScore = fresh?.challenger_score ?? opponentScore;
      setOpponentScore(freshScore);

      const won = score > freshScore;
      const draw = score === freshScore;
      try {
        const url = won
          ? assetUrl('/sound/victory.mp3')
          : !draw
            ? assetUrl('/sound/craft_fail.mp3')
            : null;
        if (url) { const s = new Audio(url); s.volume = 0.5; s.play().catch(() => {}); }
      } catch {}

      await supabase
        .from("pvp_challenges")
        .update({
          opponent_score: score,
          status: "completed",
          winner_id: draw ? null : won ? user.id : challenge.challenger_id,
        })
        .eq("id", challenge.id);

      const winnerId = draw ? null : won ? user.id : challenge.challenger_id;
      if (winnerId) {
        await supabase.rpc("increment_user_currency", { p_user_id: winnerId, p_xp: 10, p_gems: 0 });
        // Update mission progress for PvP win
        supabase
          .rpc("update_mission_progress", {
            p_user_id: winnerId,
            p_goal_type: "win_pvp",
            p_increment: 1,
          })
          .then(
            () => {},
            () => {},
          );
      }
      if (activePet?.id) {
        playWithPet(activePet.id).catch(() => {});
      }
    } catch (err) {
      console.error("Error updating PvP result:", err);
    } finally {
      setSaving(false);
    }
  };

  const petImage = activePet?.image_url || assetUrl("/image/pet/default.png");
  const petName = activePet?.nickname || activePet?.name || "Your Pet";
  const won = myScore > opponentScore;
  const draw = myScore === opponentScore;

  const renderGame = () => {
    const commonProps = {
      petImageUrl: petImage,
      petName,
      onClose: () => onClose(),
      hideClose: true,
      pvpOpponentPetUrl: challengerPetUrl,
    };
    switch (gameType) {
      case "whackmole":
        return (
          <PetWhackMole
            {...commonProps}
            onGameEnd={handleGameEnd}
            wordBank={wordBank}
          />
        );
      case "scramble":
        if (challenge.realtime_mode && challenge.word_seed) {
          return (
            <PvPRealtimeWordScramble
              challengeId={challenge.id}
              wordSeed={challenge.word_seed}
              wordBank={wordBank}
              opponent={challenge.challenger}
              isChallenger={false}
              onClose={onClose}
              petImageUrl={petImage}
              petName={petName}
              pvpOpponentPetUrl={challengerPetUrl}
            />
          );
        }
        return (
          <PetWordScramble
            {...commonProps}
            onGameEnd={handleGameEnd}
            wordBank={wordBank}
          />
        );
      case "astroblast":
        return (
          <PetAstroBlast
            {...commonProps}
            onGameEnd={handleGameEnd}
            wordBank={wordBank}
            shipSkinUrl={profile?.active_spaceship_url}
            shipLaserColor={profile?.active_spaceship_laser}
            asteroidSkinUrls={[
              assetUrl('/pet-game/astro/alien1.png'),
              assetUrl('/pet-game/astro/alien2.png'),
              assetUrl('/pet-game/astro/alien3.png'),
              assetUrl('/pet-game/astro/alien4.png'),
              assetUrl('/pet-game/astro/alien5.png'),
              assetUrl('/pet-game/astro/alien6.png'),
            ]}
          />
        );
      case "matchgame":
        if (challenge.realtime_mode && challenge.word_seed) {
          return (
            <PvPRealtimeMatchGame
              challengeId={challenge.id}
              wordSeed={challenge.word_seed}
              wordBank={wordBank}
              opponent={challenge.challenger}
              isChallenger={false}
              onClose={onClose}
              petImageUrl={petImage}
              petName={petName}
              pvpOpponentPetUrl={challengerPetUrl}
            />
          );
        }
        return (
          <PetMatchGame
            {...commonProps}
            onGameEnd={handleGameEnd}
            wordBank={wordBank}
          />
        );
      case "flappy":
        return (
          <PetFlappyGame
            {...commonProps}
            onGameEnd={handleGameEnd}
            wordBank={wordBank}
            isPvP
          />
        );
      case "wordtype":
        if (challenge.realtime_mode && challenge.word_seed) {
          return (
            <PvPRealtimeWordType
              challengeId={challenge.id}
              wordSeed={challenge.word_seed}
              wordBank={wordBank}
              opponent={challenge.challenger}
              isChallenger={false}
              onClose={onClose}
              onComplete={(s) => { setMyScore(s); setStep('result') }}
              petImageUrl={petImage}
              petName={petName}
              pvpOpponentPetUrl={challengerPetUrl}
            />
          );
        }
        return (
          <PetWordType
            {...commonProps}
            onGameEnd={handleGameEnd}
            wordBank={wordBank}
          />
        );
      case "bombparty":
        return (
          <PetBombParty
            {...commonProps}
            onGameEnd={handleGameEnd}
            wordBank={wordBank}
          />
        );
      case "sayitright":
        return (
          <PetSayItRight
            {...commonProps}
            onGameEnd={handleGameEnd}
            wordBank={wordBank}
          />
        );
      case "quizrush":
        return (
          <PetQuizRush
            {...commonProps}
            onGameEnd={handleGameEnd}
            questionBank={questionBank}
          />
        );
      case "angrypet":
        return (
          <PetAngryPet
            {...commonProps}
            onGameEnd={handleGameEnd}
            questionBank={questionBank}
          />
        );
      case "fishing":
        return (
          <PetFishingGame
            {...commonProps}
            onGameEnd={handleGameEnd}
            wordBank={wordBank}
            boatSkinUrl={profile?.active_boat_url}
          />
        );
      default:
        return null;
    }
  };

  if (step === "playing") return renderGame();

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 p-4 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded-full bg-white/20 hover:bg-white/30 transition"
          >
            <X size={18} />
          </button>
          <div className="flex items-center justify-center gap-3">
            <img
              src={assetUrl("/icon/dashboard/pvp.png")}
              alt="PvP"
              className="w-6 h-6"
            />
            <h2 className="text-xl font-bold">PvP Battle</h2>
          </div>
        </div>

        {step === "ready" && (
          <div className="p-6 text-center">
            {/* VS Display */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="flex flex-col items-center">
                {challenge.challenger?.avatar_url ? (
                  <img
                    src={challenge.challenger.avatar_url}
                    alt=""
                    className="w-14 h-14 rounded-full object-cover border-2 border-red-400"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-lg font-bold">
                    {opponentName[0]?.toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium text-gray-600 mt-1">
                  {opponentName.split(" ").pop()}
                </span>
                <span className="text-lg font-black text-red-500">
                  ???
                </span>
              </div>

              <div className="text-2xl font-black text-red-500">VS</div>

              <div className="flex flex-col items-center">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="w-14 h-14 rounded-full object-cover border-2 border-blue-400"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg font-bold">
                    {profile?.full_name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <span className="text-xs font-medium text-gray-600 mt-1">
                  You
                </span>
                <span className="text-lg font-black text-blue-500">?</span>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-2">
              <span className="font-bold">{opponentName}</span> challenged you in{" "}
              <span className="font-bold capitalize">{gameType}</span>
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Play your best!
            </p>

            <button
              disabled={wordBankLoading}
              onClick={async () => {
                // Check if challenge is still valid (not already forfeited or expired)
                const { data: fresh } = await supabase
                  .from("pvp_challenges")
                  .select("id, status, created_at")
                  .eq("id", challenge.id)
                  .single();
                if (!fresh || fresh.status !== "pending") {
                  alert("This challenge is no longer available.");
                  onClose();
                  return;
                }
                const ageMs = Date.now() - new Date(fresh.created_at).getTime();
                if (ageMs > 48 * 60 * 60 * 1000) {
                  alert("This challenge has expired.");
                  onClose();
                  return;
                }
                await supabase
                  .from("pvp_challenges")
                  .update({ status: "in_progress" })
                  .eq("id", challenge.id);
                setStep("playing");
              }}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold text-lg hover:from-red-600 hover:to-orange-600 transition active:scale-[0.98] disabled:opacity-50"
            >
              {wordBankLoading ? "Loading..." : "Accept Challenge!"}
            </button>
          </div>
        )}

        {step === "result" && (
          <div className="p-6 text-center">
            <div className="mb-4">
              {draw ? (
                <div className="text-5xl mb-2">🤝</div>
              ) : won ? (
                <Trophy size={48} className="mx-auto text-yellow-500 mb-2" />
              ) : (
                <div className="text-5xl mb-2">😢</div>
              )}
              <h3 className="text-2xl font-bold text-gray-800">
                {draw ? "It's a Draw!" : won ? "You Won!" : "You Lost!"}
              </h3>
              {won && (
                <p className="text-sm font-bold text-green-500 mt-1">+10 XP</p>
              )}
            </div>

            {/* Score comparison with avatars */}
            <div className="flex items-center justify-center gap-6 mb-4">
              <div className="text-center">
                {challenge.challenger?.avatar_url ? (
                  <img
                    src={challenge.challenger.avatar_url}
                    alt=""
                    className={`w-12 h-12 rounded-full object-cover mx-auto mb-1 ${won ? "opacity-50 grayscale" : "ring-2 ring-red-400"}`}
                  />
                ) : (
                  <div
                    className={`w-12 h-12 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white font-bold mx-auto mb-1 ${won ? "opacity-50 grayscale" : "ring-2 ring-red-400"}`}
                  >
                    {opponentName[0]?.toUpperCase()}
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  {opponentName.split(" ").pop()}
                </div>
                <div
                  className={`text-3xl font-black ${won ? "text-gray-400" : "text-red-500"}`}
                >
                  {opponentScore}
                </div>
              </div>
              <div className="text-lg font-bold text-gray-300">vs</div>
              <div className="text-center">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className={`w-12 h-12 rounded-full object-cover mx-auto mb-1 ${!won && !draw ? "opacity-50 grayscale" : "ring-2 ring-green-400"}`}
                  />
                ) : (
                  <div
                    className={`w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold mx-auto mb-1 ${!won && !draw ? "opacity-50 grayscale" : "ring-2 ring-green-400"}`}
                  >
                    {profile?.full_name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <div className="text-xs text-gray-500">You</div>
                <div
                  className={`text-3xl font-black ${won ? "text-green-500" : draw ? "text-yellow-500" : "text-gray-400"}`}
                >
                  {myScore}
                </div>
              </div>
            </div>

            {/* Taunt picker when won */}
            {won && !saving && <TauntPicker challengeId={challenge.id} onSent={() => onClose()} />}

            <button
              onClick={onClose}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold hover:from-red-600 hover:to-orange-600 transition disabled:opacity-50 mt-3"
            >
              {saving ? "Saving..." : "Done"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default PvPIncomingBanner;
