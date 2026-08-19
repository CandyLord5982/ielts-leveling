import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { saveRecentExercise } from "../../utils/recentExercise";
import { useAuth } from "../../hooks/useAuth";
import { useProgress } from "../../hooks/useProgress";
import { supabase } from "../../supabase/client";
import Button from "../ui/Button";
import LoadingSpinner from "../ui/LoadingSpinner";
import CelebrationScreen from "../ui/CelebrationScreen";
import { useFeedback } from "../../hooks/useFeedback";
import {
  Volume2,
  ChevronLeft,
  ChevronRight,
  Mic,
  Video,
  Image,
  Info,
  X,
  Play,
} from "lucide-react";
import { assessPronunciation } from "../../utils/azurePronunciationService";
import { usePermissions } from '../../hooks/usePermissions'
import TeacherExerciseNav from '../ui/TeacherExerciseNav'

import { assetUrl } from '../../hooks/useBranding';
// Theme-based side decoration images for PC
const themeSideImages = {
  blue: {
    left: assetUrl('/image/theme_question/ice_left.png'),
    right: assetUrl('/image/theme_question/ice_right.png'),
  },
  green: {
    left: assetUrl('/image/theme_question/forest_left.png'),
    right: assetUrl('/image/theme_question/forest_right.png')
  },
  purple: {
    left: assetUrl('/image/theme_question/pirate.png'),
    right: assetUrl('/image/theme_question/pirate.png')
  },
  orange: {
    left: assetUrl('/image/theme_question/ninja_left.png'),
    right: assetUrl('/image/theme_question/ninja_right.png')
  },
  red: {
    left: assetUrl('/image/theme_question/dino_left.png'),
    right: assetUrl('/image/theme_question/dino_right.png')
  },
  yellow: {
    left: assetUrl('/image/theme_question/desert_left.png'),
    right: assetUrl('/image/theme_question/desert_right.png')
  }
}

const getThemeSideImages = (theme) => {
  return themeSideImages[theme] || themeSideImages.blue
}

// Helper to detect YouTube URLs and extract video ID
const getYouTubeVideoId = (raw) => {
  if (!raw) return null;
  // youtube.com/watch?v=ID
  const m1 = raw.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m1?.[1]) return m1[1];
  // youtu.be/ID
  const m2 = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m2?.[1]) return m2[1];
  // youtube.com/embed/ID
  const m3 = raw.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (m3?.[1]) return m3[1];
  // youtube.com/shorts/ID
  const m4 = raw.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (m4?.[1]) return m4[1];
  return null;
};

const isYouTubeShort = (raw) => {
  if (!raw) return false;
  return /youtube\.com\/shorts\//.test(raw);
};

// Returns the aspect class for a video URL in video mode
const getVideoAspectClass = (url) => {
  if (getTikTokVideoId(url) || isYouTubeShort(url)) return "aspect-[9/16] md:aspect-square";
  if (getYouTubeVideoId(url)) return "aspect-video md:aspect-square";
  return "aspect-square";
};

const YouTubeEmbed = ({ videoId }) => {
  if (!videoId) return null;
  return (
    <div className="w-full h-full relative bg-black">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0`}
        className="w-full h-full"
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        title="YouTube Player"
        style={{ border: 'none' }}
      />
    </div>
  );
};

// Helper to detect TikTok URLs and extract video ID
const getTikTokVideoId = (raw) => {
  if (!raw) return null;
  const m1 = raw.match(/\/video\/(\d{10,25})/);
  if (m1?.[1]) return m1[1];
  const m2 = raw.match(/\/embed\/v2\/(\d{10,25})/);
  if (m2?.[1]) return m2[1];
  const m3 = raw.match(/\/player\/v1\/(\d{10,25})/);
  if (m3?.[1]) return m3[1];
  const m4 = raw.match(/(\d{10,25})/);
  return m4?.[1] ?? null;
};

const TT_ORIGIN = 'https://www.tiktok.com';

const postToTikTok = (iframe, msg) => {
  const win = iframe?.contentWindow;
  if (!win) return;
  win.postMessage({ ...msg, 'x-tiktok-player': true }, TT_ORIGIN);
};

const TikTokEmbed = ({ videoId }) => {
  const iframeRef = useRef(null);
  const playingRef = useRef(false);

  const [ttReady, setTtReady] = useState(false);
  const [ttPlaying, setTtPlaying] = useState(false);
  const [ttMuted, setTtMuted] = useState(true);
  const [showTapToPlay, setShowTapToPlay] = useState(false);
  const [showSoundBtn, setShowSoundBtn] = useState(true);

  const embedSrc = videoId
    ? `https://www.tiktok.com/player/v1/${videoId}?controls=1&autoplay=1&description=0&music_info=0`
    : '';

  const enableSound = () => {
    if (!ttReady) return;
    setShowSoundBtn(false);
    postToTikTok(iframeRef.current, { type: 'unMute' });
    postToTikTok(iframeRef.current, { type: 'play' });
    setTtMuted(false);
  };

  const handleTapPlay = () => {
    postToTikTok(iframeRef.current, { type: 'play' });
    setShowTapToPlay(false);
  };

  useEffect(() => {
    setTtReady(false);
    setTtPlaying(false);
    setTtMuted(true);
    setShowTapToPlay(false);
    setShowSoundBtn(true);
    playingRef.current = false;

    if (!videoId) return;

    const onMessage = (event) => {
      if (event.origin !== TT_ORIGIN) return;

      let data = null;
      if (typeof event.data === 'string') {
        try { data = JSON.parse(event.data); } catch { data = null; }
      } else if (typeof event.data === 'object' && event.data) {
        data = event.data;
      }
      if (!data || data['x-tiktok-player'] !== true) return;

      if (data.type === 'onPlayerReady') {
        setTtReady(true);
        postToTikTok(iframeRef.current, { type: 'mute' });
        postToTikTok(iframeRef.current, { type: 'play' });
        setTtMuted(true);
        window.setTimeout(() => {
          if (!playingRef.current) setShowTapToPlay(true);
        }, 1200);
      }

      if (data.type === 'onStateChange') {
        const state = Number(data.value);
        if (state === 1) {
          playingRef.current = true;
          setTtPlaying(true);
          setShowTapToPlay(false);
        } else if (state === 2 || state === 0) {
          playingRef.current = false;
          setTtPlaying(false);
        }
      }

      if (data.type === 'onMute') {
        const muted = Boolean(data.value);
        setTtMuted(muted);
        if (!muted) setShowSoundBtn(false);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [videoId]);

  if (!embedSrc) return null;

  return (
    <div className="w-full h-full relative bg-black">
      <iframe
        ref={iframeRef}
        src={embedSrc}
        className="w-full h-full"
        scrolling="no"
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        title="TikTok Player"
        style={{ border: 'none' }}
      />

      {/* Tap to play overlay (autoplay blocked) */}
      {showTapToPlay && (
        <button
          type="button"
          onClick={handleTapPlay}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 backdrop-blur-[1px]"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-red-600 font-extrabold shadow-xl">
            <Play className="w-4 h-4" /> Chạm để phát
          </span>
        </button>
      )}

      {/* Enable sound overlay */}
      {ttReady && ttPlaying && ttMuted && !showTapToPlay && showSoundBtn && (
        <button
          type="button"
          onClick={enableSound}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 backdrop-blur-[1px]"
        >
          <span className="inline-flex items-center gap-3 px-7 py-3 rounded-full bg-white text-red-600 text-sm font-extrabold shadow-2xl">
            <Volume2 className="w-5 h-5" />
            BẬT TIẾNG
          </span>
        </button>
      )}
    </div>
  );
};

const FlashcardExercise = () => {
  const location = useLocation();
  const { canCreateContent } = usePermissions()
  const [currentCard, setCurrentCard] = useState(0);
  const [flashcards, setFlashcards] = useState([]);
  const [displayedCards, setDisplayedCards] = useState([]);
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentAudio, setCurrentAudio] = useState(null);
  const audioPlayCount = useRef(0);
  const [session, setSession] = useState(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [speechSynth] = useState(window.speechSynthesis);
  const [isRecording, setIsRecording] = useState(false);
  const [pronunciationResult, setPronunciationResult] = useState(null);
  const [mediaMode, setMediaMode] = useState("image"); // 'video' or 'image'
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [videoRefs, setVideoRefs] = useState([]);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const [azureAvailable, setAzureAvailable] = useState(false);
  const [cardScores, setCardScores] = useState({});
  const [colorTheme, setColorTheme] = useState('blue');
  const [showTutorial, setShowTutorial] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationScore, setCelebrationScore] = useState(0);
  const [celebrationXP, setCelebrationXP] = useState(0);
  const [hasPlayedPassAudio, setHasPlayedPassAudio] = useState(false);
  const { currentMeme, showMeme, playFeedback, playCelebration, passGif } = useFeedback();

  // Get exerciseId and sessionId from URL search params
  const searchParams = new URLSearchParams(location.search);
  const exerciseId = searchParams.get("exerciseId");
  const sessionId = searchParams.get("sessionId");
  const isChallenge = searchParams.get("isChallenge") === "true";
  const challengeId = searchParams.get("challengeId");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startExercise, completeExerciseWithXP } = useProgress();
  const [challengeStartTime, setChallengeStartTime] = useState(null);

  useEffect(() => {
    const init = async () => {
      if (exerciseId) {
        fetchFlashcards();
        // Start exercise tracking (captures challenge start time)
        if (user) {
          if (isChallenge && challengeId) {
            const { startedAt } = await startExercise(exerciseId);
            setChallengeStartTime(startedAt);
          } else {
            await startExercise(exerciseId);
          }
        }
      } else {
        setLoading(false);
        setError("Không tìm thấy ID bài tập");
      }
    };
    init();
  }, [exerciseId, user]);

  // Fetch session info for navigation
  useEffect(() => {
    if (sessionId) {
      fetchSessionInfo();
    }
  }, [sessionId]);

  const fetchSessionInfo = async () => {
    try {
      const { data, error } = await supabase
        .from("sessions")
        .select(
          `
          *,
          units:unit_id (
            *,
            courses:course_id (*)
          )
        `
        )
        .eq("id", sessionId)
        .maybeSingle();

      if (error) throw error;
      setSession(data);

      // Set color theme from session or unit
      const theme = data?.color_theme || data?.units?.color_theme || 'blue'
      setColorTheme(theme)
    } catch (err) {
      console.error("Error fetching session info:", err);
    }
  };

  const fetchFlashcards = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .eq("id", exerciseId)
        .eq("exercise_type", "flashcard")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExercise(data);
      }

      if (data && data.content && data.content.cards) {
        setFlashcards(data.content.cards);
        // Show all cards
        setDisplayedCards(data.content.cards);

        // Save recent exercise for Home page card
        try {
          const continuePath = `/study/flashcard?exerciseId=${data.id}&sessionId=${sessionId}`;
          saveRecentExercise({
            ...data,
            continuePath,
          });
        } catch {}
      } else {
        setFlashcards([]);
        setDisplayedCards([]);
      }
    } catch (err) {
      console.error("Error fetching flashcards:", err);
      setError("Không thể tải dữ liệu flashcard");
    } finally {
      setLoading(false);
    }
  };

  const currentFlashcard = displayedCards[currentCard];

  // Function to get next exercise in session
  const getNextExercise = async () => {
    if (!sessionId) return null;

    try {
      const { data: exercises, error } = await supabase
        .from("exercises")
        .select("*")
        .eq("session_id", sessionId)
        .eq("is_active", true)
        .order("order_index");

      if (error) throw error;

      const currentIndex = exercises.findIndex((ex) => ex.id === exerciseId);
      if (currentIndex !== -1 && currentIndex < exercises.length - 1) {
        return exercises[currentIndex + 1];
      }
      return null;
    } catch (err) {
      console.error("Error fetching next exercise:", err);
      return null;
    }
  };

  // Function to navigate to next exercise
  const goToNextExercise = async () => {
    // Validate that ALL cards have been practiced
    const totalCards = displayedCards.length;
    const practicedCards = Object.keys(cardScores).length;

    if (totalCards > 0 && practicedCards < totalCards) {
      // Show alert - must practice all cards
      alert(
        `Please practice pronunciation for all ${totalCards} cards. You've practiced ${practicedCards} so far.`
      );
      return; // Block navigation
    }

    // Calculate average of best scores
    let finalScore = 0;

    if (practicedCards > 0) {
      const scores = Object.values(cardScores).map((card) => card.bestScore);
      const totalScore = scores.reduce((sum, score) => sum + score, 0);
      finalScore = Math.round(totalScore / scores.length);
    }

    // Mark current exercise as completed for progress tracking
    let xpResult = 0;
    try {
      if (user && exerciseId) {
        const baseXP = exercise?.xp_reward || 10;
        const bonusXP = finalScore >= 95 ? Math.round(baseXP * 0.5) : finalScore >= 90 ? Math.round(baseXP * 0.3) : 0;
        const totalXP = baseXP + bonusXP;

        const result = await completeExerciseWithXP(exerciseId, totalXP, {
          score: finalScore,
          max_score: 100,
          xp_earned: totalXP,
          challengeId: challengeId,
          challengeStartedAt: challengeStartTime,
        });
        xpResult = result?.xpAwarded ?? 0;
      }
    } catch (e) {
      console.error("Failed to mark exercise completed:", e);
    }

    // Show celebration screen instead of navigating directly
    setCelebrationScore(finalScore);
    setCelebrationXP(xpResult);
    setShowCelebration(true);
  };

  // Finish daily challenge and go back to dashboard
  const goToFinishChallenge = async () => {
    // Validate that ALL cards have been practiced
    const totalCards = displayedCards.length;
    const practicedCards = Object.keys(cardScores).length;

    if (totalCards > 0 && practicedCards < totalCards) {
      alert(
        `Please practice pronunciation for all ${totalCards} cards. You've practiced ${practicedCards} so far.`
      );
      return;
    }

    // Calculate average of best scores
    let score = 0;

    if (practicedCards > 0) {
      const scores = Object.values(cardScores).map((card) => card.bestScore);
      const totalScore = scores.reduce((sum, s) => sum + s, 0);
      score = Math.round(totalScore / scores.length);
    }

    // Use completeExerciseWithXP (same as MultipleChoice) to handle progress + challenge tracking
    let xpResult = 0;
    try {
      const baseXP = exercise?.xp_reward || 10;
      const bonusXP = score >= 95 ? Math.round(baseXP * 0.5) : score >= 90 ? Math.round(baseXP * 0.3) : 0;
      const totalXP = baseXP + bonusXP;

      const result = await completeExerciseWithXP(exerciseId, totalXP, {
        score: score,
        max_score: 100,
        xp_earned: totalXP,
        challengeId: challengeId,
        challengeStartedAt: challengeStartTime,
      });
      xpResult = result?.xpAwarded ?? 0;

      if (result.xpAwarded > 0) {
        console.log(`✅ Challenge completed! Awarded ${result.xpAwarded} XP`);
      }
    } catch (e) {
      console.error("Failed to save challenge progress:", e);
    }

    // Show celebration screen instead of navigating directly
    setCelebrationScore(score);
    setCelebrationXP(xpResult);
    setShowCelebration(true);
  };

  // Handle navigation when user dismisses the celebration screen
  const handleCelebrationDismiss = async () => {
    if (isChallenge) {
      navigate("/");
      return;
    }

    const nextExercise = await getNextExercise();

    if (nextExercise) {
      const paths = {
        flashcard: "/study/flashcard",
        fill_blank: "/study/fill-blank",
        multiple_choice: "/study/multiple-choice",
      };
      const exercisePath =
        paths[nextExercise.exercise_type] || "/study/flashcard";
      navigate(
        `${exercisePath}?exerciseId=${nextExercise.id}&sessionId=${sessionId}`
      );
    } else {
      // No more exercises, mark session as completed then go back to session
      try {
        if (user && sessionId) {
          await supabase.from("session_progress").upsert({
            user_id: user.id,
            session_id: sessionId,
            status: "completed",
            progress_percentage: 100,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error("Failed to mark session completed:", e);
      } finally {
        navigate(
          `/study/course/${session?.units?.course_id}/unit/${session?.unit_id}/session/${sessionId}`
        );
      }
    }
  };

  const handleCardSelect = (index) => {
    // Stop current audio and reset play count when switching cards
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
    audioPlayCount.current = 0;
    // Stop any speech synthesis
    speechSynth.cancel();
    // Pause all videos
    pauseAllVideos();
    // Reset flip state, video index, and pronunciation result
    setIsFlipped(false);
    setMediaMode("image");
    setCurrentVideoIndex(0);
    setPronunciationResult(null);
    setCurrentCard(index);
  };

  const speakText = (text, lang = "en-US", rate = 1) => {
    // Stop any current speech
    speechSynth.cancel();

    if (!text) return;

    const speak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.pitch = 1;
      utterance.volume = 0.8;

      // Get available voices
      const voices = speechSynth.getVoices();

      // Debug: log available voices
      console.log("🔊 Available TTS voices:", voices.length, voices.map(v => `${v.name} (${v.lang})`));

      // Simple approach: just find any English voice, don't be picky
      let voice = null;

      if (lang.startsWith("en")) {
        // Try to find ANY English voice
        voice = voices.find((v) =>
          v.lang === "en-US" ||
          v.lang === "en-GB" ||
          v.lang.startsWith("en-") ||
          v.lang === "en"
        );

        // Still no voice? Try by name
        if (!voice) {
          voice = voices.find((v) =>
            v.name.toLowerCase().includes("english")
          );
        }
      }

      // Fallback to first available voice
      if (!voice && voices.length > 0) {
        voice = voices[0];
      }

      if (voice) {
        console.log("🔊 Using voice:", voice.name, voice.lang);
        utterance.voice = voice;
      } else {
        console.log("🔊 No voice found, using default");
      }

      speechSynth.speak(utterance);
    };

    // On Android, voices may not be loaded yet - wait for them
    const voices = speechSynth.getVoices();
    if (voices.length > 0) {
      speak();
    } else {
      // Wait for voices to load (Android needs this)
      speechSynth.onvoiceschanged = () => {
        speak();
      };
      // Fallback: try speaking anyway after a short delay
      setTimeout(() => {
        if (speechSynth.getVoices().length === 0) {
          // Still no voices, speak without voice selection
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = lang;
          utterance.rate = 0.75;
          speechSynth.speak(utterance);
        }
      }, 100);
    }
  };

  const playAudio = () => {
    if (currentFlashcard) {
      // If there's a custom audio URL, play that instead of TTS
      if (currentFlashcard.audioUrl && currentFlashcard.audioUrl.trim()) {
        // Stop current speech if speaking
        if (speechSynth.speaking) {
          speechSynth.cancel();
        }

        // Stop current audio if playing
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.currentTime = 0;
        }

        // Play custom audio (slow down by 25% on second click)
        const audio = new Audio(currentFlashcard.audioUrl);
        audioPlayCount.current += 1;
        audio.playbackRate = audioPlayCount.current >= 2 ? 0.75 : 1;
        audio.play().catch((err) => {
          console.error("Error playing audio:", err);
          // Fallback to TTS if audio fails
          const textToSpeak = currentFlashcard.front;
          const language = "en-US";
          speakText(textToSpeak, language);
        });
        setCurrentAudio(audio);
      } else {
        // Use text-to-speech as fallback
        // Stop current speech if speaking
        if (speechSynth.speaking) {
          speechSynth.cancel();
          return;
        }

        audioPlayCount.current += 1;
        // Always speak the front text (English) regardless of flip state
        const textToSpeak = currentFlashcard.front;
        const language = "en-US";

        speakText(textToSpeak, language, audioPlayCount.current >= 2 ? 0.75 : 1);
      }
    }
  };

  const flipCard = () => {
    if (mediaMode === "video") {
      // In video mode, flip toggles to image card view
      pauseAllVideos();
      setMediaMode("image");
    } else if (!isFlipped && currentFlashcard?.videoUrls?.length > 0) {
      // In image mode front face, flip back to video
      setMediaMode("video");
    } else {
      // Normal image flip (front <-> back)
      setIsFlipped(!isFlipped);
    }
  };

  const goToNextCard = () => {
    const nextIndex = (currentCard + 1) % displayedCards.length;
    handleCardSelect(nextIndex);
  };

  const goToPreviousCard = () => {
    const prevIndex =
      (currentCard - 1 + displayedCards.length) % displayedCards.length;
    handleCardSelect(prevIndex);
  };

  const toggleMediaMode = () => {
    const newMode = mediaMode === "image" ? "video" : "image";

    if (newMode === "image") {
      pauseAllVideos();
    }
    setMediaMode(newMode);
    setCurrentVideoIndex(0);
  };

  const pauseAllVideos = () => {
    videoRefs.forEach((videoRef) => {
      if (videoRef) {
        videoRef.pause();
        videoRef.currentTime = 0;
      }
    });
  };

  // Toggle recording with Azure pronunciation assessment
  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsRecording(false);
    } else if (!azureAvailable) {
      // Fallback: Use MediaRecorder + AssemblyAI speech-to-text
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });

          if (audioBlob.size < 1000) {
            setPronunciationResult({
              transcript: "Recording too short — speak louder",
              targetWord: currentFlashcard?.front,
              accuracy: 0,
              isCorrect: false,
              error: true,
            });
            setTimeout(() => setPronunciationResult(null), 3000);
            return;
          }

          setPronunciationResult({ loading: true });

          try {
            console.log("🎤 Sending audio to AssemblyAI...", { blobSize: audioBlob.size, blobType: audioBlob.type });
            const res = await fetch("/api/transcribe", {
              method: "POST",
              body: audioBlob,
            });
            console.log("📡 AssemblyAI response status:", res.status);
            const data = await res.json();
            console.log("📊 AssemblyAI result:", JSON.stringify(data, null, 2));

            if (data.success && data.text) {
              const referenceText = currentFlashcard?.front || "";
              const transcript = data.text;
              const referenceLower = referenceText.toLowerCase().trim();
              const transcriptLower = transcript.toLowerCase().trim();

              // Score: exact/contains match uses confidence, otherwise string similarity
              let syllableScore;
              if (
                transcriptLower === referenceLower ||
                transcriptLower.includes(referenceLower) ||
                referenceLower.includes(transcriptLower)
              ) {
                syllableScore = Math.max(
                  70,
                  Math.round((data.confidence || 0.8) * 100)
                );
              } else {
                // Levenshtein similarity
                const maxLen = Math.max(
                  referenceLower.length,
                  transcriptLower.length
                );
                if (maxLen === 0) {
                  syllableScore = 0;
                } else {
                  const dp = Array.from(
                    { length: transcriptLower.length + 1 },
                    (_, i) => [i]
                  );
                  for (let j = 0; j <= referenceLower.length; j++)
                    dp[0][j] = j;
                  for (let i = 1; i <= transcriptLower.length; i++) {
                    for (let j = 1; j <= referenceLower.length; j++) {
                      const cost =
                        transcriptLower[i - 1] === referenceLower[j - 1]
                          ? 0
                          : 1;
                      dp[i][j] = Math.min(
                        dp[i - 1][j] + 1,
                        dp[i][j - 1] + 1,
                        dp[i - 1][j - 1] + cost
                      );
                    }
                  }
                  const dist =
                    dp[transcriptLower.length][referenceLower.length];
                  syllableScore = Math.round(
                    ((maxLen - dist) / maxLen) * 100
                  );
                }
              }

              // Apply score boost (for younger learners)
              const scoreBoost = exercise?.score_boost || 0;
              if (scoreBoost > 0) {
                syllableScore = Math.min(100, syllableScore + scoreBoost);
              }

              // Update card scores
              const cardId = currentFlashcard?.id;
              setCardScores((prev) => {
                const existing = prev[cardId];
                const newBestScore = existing
                  ? Math.max(existing.bestScore, syllableScore)
                  : syllableScore;
                const newAttempts = existing ? existing.attempts + 1 : 1;
                return {
                  ...prev,
                  [cardId]: {
                    word: currentFlashcard?.front,
                    bestScore: newBestScore,
                    attempts: newAttempts,
                    lastAttempt: new Date(),
                  },
                };
              });

              setPronunciationResult({
                transcript,
                targetWord: referenceText,
                accuracy: syllableScore,
                isCorrect: syllableScore >= 70,
                error: false,
                words: [],
              });

              playFeedback(syllableScore >= 80);
            } else {
              setPronunciationResult({
                transcript: data.error || "No speech detected",
                targetWord: currentFlashcard?.front,
                accuracy: 0,
                isCorrect: false,
                error: true,
              });
            }
          } catch (err) {
            console.error("Transcription error:", err);
            setPronunciationResult({
              transcript: "Transcription failed — check connection",
              targetWord: currentFlashcard?.front,
              accuracy: 0,
              isCorrect: false,
              error: true,
            });
          }

          setTimeout(() => setPronunciationResult(null), 5000);
        };

        mediaRecorder.onerror = (error) => {
          console.error("MediaRecorder error:", error);
          stream.getTracks().forEach((track) => track.stop());
          setIsRecording(false);
          setPronunciationResult({
            transcript: "Recording error",
            targetWord: currentFlashcard?.front,
            accuracy: 0,
            isCorrect: false,
            error: true,
          });
          setTimeout(() => setPronunciationResult(null), 3000);
        };

        mediaRecorder.start(100);
        setIsRecording(true);

        // Auto-stop after 5 seconds
        setTimeout(() => {
          if (mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            setIsRecording(false);
          }
        }, 5000);
      } catch (error) {
        console.error("Error accessing microphone:", error);
        alert("Failed to access microphone. Please check permissions.");
        setIsRecording(false);
      }
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          // Stop all tracks
          stream.getTracks().forEach((track) => track.stop());

          // Create audio blob
          const audioBlob = new Blob(audioChunksRef.current, {
            type: "audio/webm",
          });

          console.log("🎤 Recording stopped, blob size:", audioBlob.size);

          // Show loading state
          setPronunciationResult({
            loading: true,
          });

          // Assess pronunciation using Azure
          const referenceText = currentFlashcard?.front || "";
          const result = await assessPronunciation(
            referenceText,
            audioBlob,
            "en-US"
          );

          console.log("📊 Azure assessment result:", result);

          if (result.success) {
            // Use syllable score as the main score (first word's first syllable)
            const syllableScore =
              result.words?.[0]?.syllables?.[0]?.accuracyScore ||
              result.overallScore;

            // Update card scores - keep best score per card
            const cardId = currentFlashcard?.id;
            setCardScores((prev) => {
              const existing = prev[cardId];
              const newBestScore = existing
                ? Math.max(existing.bestScore, syllableScore)
                : syllableScore;
              const newAttempts = existing ? existing.attempts + 1 : 1;

              return {
                ...prev,
                [cardId]: {
                  word: currentFlashcard?.front,
                  bestScore: newBestScore,
                  attempts: newAttempts,
                  lastAttempt: new Date(),
                },
              };
            });

            setPronunciationResult({
              transcript: result.recognizedText,
              targetWord: currentFlashcard?.front,
              accuracy: syllableScore, // Show syllable score instead of overall
              accuracyScore: result.accuracyScore,
              fluencyScore: result.fluencyScore,
              completenessScore: result.completenessScore,
              prosodyScore: result.prosodyScore,
              feedback: result.feedback,
              words: result.words,
              isCorrect: syllableScore >= 70,
              error: false,
            });

            // Play meme + sound feedback based on score
            playFeedback(syllableScore >= 80);
          } else {
            // If Azure service error (quota exhausted, etc.), switch to browser fallback
            if (result.error === 'SERVICE_ERROR' || result.error === 'RECOGNITION_FAILED') {
              setAzureAvailable(false);
              console.warn('⚠️ Azure unavailable, switching to browser Speech Recognition fallback');
            }
            setPronunciationResult({
              transcript: result.error === 'SERVICE_ERROR'
                ? "Azure unavailable — try again, using browser mode"
                : (result.message || "Error"),
              targetWord: currentFlashcard?.front,
              accuracy: 0,
              isCorrect: false,
              error: true,
            });
          }

          // Auto-hide result after 8 seconds
          setTimeout(() => {
            setPronunciationResult(null);
          }, 5000);
        };

        mediaRecorder.onerror = (error) => {
          console.error("MediaRecorder error:", error);
          stream.getTracks().forEach((track) => track.stop());
          setIsRecording(false);
          setPronunciationResult({
            transcript: "Recording error",
            targetWord: currentFlashcard?.front,
            accuracy: 0,
            isCorrect: false,
            error: true,
          });
          setTimeout(() => {
            setPronunciationResult(null);
          }, 3000);
        };

        // Start recording with timeslice to capture data regularly (every 100ms)
        mediaRecorder.start(100);
        setIsRecording(true);

        // Auto-stop after 5 seconds
        setTimeout(() => {
          if (mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            setIsRecording(false);
          }
        }, 5000);
      } catch (error) {
        console.error("Error accessing microphone:", error);
        alert("Failed to access microphone. Please check permissions.");
        setIsRecording(false);
      }
    }
  };

  // Play celebration audio when celebration screen shows and score passes
  useEffect(() => {
    if (showCelebration && !hasPlayedPassAudio && celebrationScore >= 80) {
      playCelebration();
      setHasPlayedPassAudio(true);
    }
  }, [showCelebration, hasPlayedPassAudio, celebrationScore, playCelebration]);

  // Auto-play video when switching to video mode or changing video index
  useEffect(() => {
    if (mediaMode === "video" && videoRefs[currentVideoIndex]) {
      const videoElement = videoRefs[currentVideoIndex];
      const playPromise = videoElement.play();

      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.log("Auto-play prevented:", error);
        });
      }
    }
  }, [mediaMode, currentVideoIndex, videoRefs]);

  // Bottom nav Back: go back to session view
  useEffect(() => {
    const handleBottomNavBack = () => {
      console.log('🎯 Bottom nav "Back" clicked in FlashcardExercise');
      // Stop any playing audio and speech when going back
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        setCurrentAudio(null);
      }
      speechSynth.cancel();
      // Pause all videos
      pauseAllVideos();
      // Navigate back to session view
      if (session && session.units && session.units.levels) {
        const unitId = session.units.id;
        navigate(
          `/study/course/${courseId}/unit/${unitId}/session/${sessionId}`
        );
      } else if (sessionId) {
        // Fallback: try to navigate to session without full path
        navigate(`/study/course/1/unit/1/session/${sessionId}`);
      } else {
        // Final fallback to study page
        navigate("/study");
      }
    };

    window.addEventListener("bottomNavBack", handleBottomNavBack);
    return () =>
      window.removeEventListener("bottomNavBack", handleBottomNavBack);
  }, [session, sessionId, navigate, currentAudio]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">{error}</div>
        <Button onClick={fetchFlashcards} variant="outline">
          Thử lại
        </Button>
      </div>
    );
  }

  if (flashcards.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600 mb-4">Không có flashcard nào</div>
        <Link to="/study">
          <Button variant="outline">Quay lại</Button>
        </Link>
      </div>
    );
  }

  if (displayedCards.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600 mb-4">Không có card nào để hiển thị</div>
        <Link to="/study">
          <Button variant="outline">Quay lại</Button>
        </Link>
      </div>
    );
  }

  const sideImages = getThemeSideImages(colorTheme)

  return (
    <>
      <style>{`
        .flip-card-container {
          perspective: 1000px;
        }

        .flip-card-inner {
          position: relative;
          width: 100%;
          transition: transform 0.4s;
          transform-style: preserve-3d;
        }

        .flip-card-inner.flipped {
          transform: rotateY(180deg);
        }

        .flip-card-front,
        .flip-card-back {
          position: absolute;
          width: 100%;
          height: 100%;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
        }

        .flip-card-back {
          transform: rotateY(180deg);
        }

        /* Disable pointer events on the hidden face so iframes remain interactive */
        .flip-card-inner:not(.flipped) .flip-card-back {
          pointer-events: none;
        }
        .flip-card-inner.flipped .flip-card-front {
          pointer-events: none;
        }

        .button-3d {
          transform: translateY(0);
          transition: all 0.1s ease;
        }

        .button-3d:active:not(:disabled) {
          transform: translateY(4px);
        }

        /* Gray buttons (Previous/Next) */
        .button-3d.btn-gray {
          box-shadow: 0 4px 0 #201f1f;
        }
        .button-3d.btn-gray:active:not(:disabled) {
          box-shadow: 0 2px 0 #201f1f;
        }
        .button-3d.btn-gray:disabled {
          box-shadow: 0 2px 0 #0000001a;
        }

        /* Orange button (Media toggle) */
        .button-3d.btn-orange {
          box-shadow: 0 4px 0 #a24719;
        }
        .button-3d.btn-orange:active:not(:disabled) {
          box-shadow: 0 2px 0 #a24719;
        }
        .button-3d.btn-orange:disabled {
          box-shadow: 0 2px 0 #0000001a;
        }

        /* Blue button (Audio) */
        .button-3d.btn-blue {
          box-shadow: 0 4px 0 #001b69;
        }
        .button-3d.btn-blue:active:not(:disabled) {
          box-shadow: 0 2px 0 #001b69;
        }
        .button-3d.btn-blue:disabled {
          box-shadow: 0 2px 0 #0000001a;
        }

        /* Red button (Stop/Recording) */
        .button-3d.btn-red {
          box-shadow: 0 4px 0 #9b2020;
        }
        .button-3d.btn-red:active:not(:disabled) {
          box-shadow: 0 2px 0 #9b2020;
        }
        .button-3d.btn-red:disabled {
          box-shadow: 0 2px 0 #0000001a;
        }

        /* Purple button (Mic) */
        .button-3d.btn-purple {
          box-shadow: 0 4px 0 #5c00af;
        }
        .button-3d.btn-purple:active:not(:disabled) {
          box-shadow: 0 2px 0 #5c00af;
        }
        .button-3d.btn-purple:disabled {
          box-shadow: 0 2px 0 #0000001a;
        }

        /* Green button (Flip) */
        .button-3d.btn-green {
          box-shadow: 0 4px 0 #225000;
        }
        .button-3d.btn-green:active:not(:disabled) {
          box-shadow: 0 2px 0 #225000;
        }
      `}</style>
      {/* Left side image - only visible on desktop (md and up) - Fixed to viewport */}
      <div className="hidden md:block fixed left-0 bottom-[0%] w-48 lg:w-64 xl:w-80 pointer-events-none z-10">
        <img
          src={sideImages.left}
          alt="Theme decoration left"
          className="w-full h-auto object-contain"
          style={{ maxHeight: '80vh' }}
        />
      </div>

      {/* Right side image - only visible on desktop (md and up) - Fixed to viewport */}
      <div className="hidden md:block fixed right-0 bottom-[0%] w-48 lg:w-64 xl:w-80 pointer-events-none z-10">
        <img
          src={sideImages.right}
          alt="Theme decoration right"
          className="w-full h-auto object-contain"
          style={{ maxHeight: '80vh' }}
        />
      </div>

      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 px-2 sm:px-4 py-4 sm:py-6 relative z-20">
        {canCreateContent() && sessionId && <TeacherExerciseNav sessionId={sessionId} currentExerciseId={exerciseId} />}
        {/* Main Card Display with Right Side Thumbnails */}
        <div className="flex flex-col lg:flex-row gap-4 max-w-full mx-auto">
          {/* Main Card */}
          <div className="flex-1 max-w-xl lg:max-w-xl mx-auto w-full">
            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 flip-card-container">
              <div className="relative">
                {/* Card Content - Front or Back */}
                <div
                  className={`flip-card-inner ${
                    mediaMode === "video"
                      ? getVideoAspectClass(currentFlashcard?.videoUrls?.[currentVideoIndex])
                      : "aspect-square"
                  } ${isFlipped ? "flipped" : ""}`}
                >
                  {/* Front Face */}
                  <div className={`flip-card-front ${
                    mediaMode === "video"
                      ? getVideoAspectClass(currentFlashcard?.videoUrls?.[currentVideoIndex])
                      : "aspect-square"
                  } relative`}>
                    {mediaMode === "image" ? (
                      <>
                        <img
                          src={currentFlashcard?.image}
                          alt={currentFlashcard?.front}
                          className="w-full h-full object-contain"
                        />
                        {/* Overlay with front text */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent flex items-end justify-center px-4 pb-6 pt-12">
                          <div className="text-center text-white">
                            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-2 drop-shadow-lg break-words max-w-full">
                              {currentFlashcard?.front}
                            </h2>
                          </div>
                        </div>

                        {/* Pronunciation Result Overlay */}
                        {pronunciationResult && (
                          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-10 overflow-y-auto">
                            <div className="text-center text-white p-6 max-w-lg">
                              {pronunciationResult.loading ? (
                                <>
                                  <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
                                  <h3 className="text-xl font-bold">
                                    Analyzing pronunciation...
                                  </h3>
                                </>
                              ) : pronunciationResult.error ? (
                                <>
                                  <div className="text-6xl mb-4">❌</div>
                                  <h3 className="text-2xl font-bold">Error</h3>
                                  <p className="text-lg mt-2">
                                    {pronunciationResult.transcript}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <div className="text-7xl font-bold mb-4">
                                    {pronunciationResult.accuracy}%
                                  </div>
                                  <div className="text-4xl mb-6">
                                    {pronunciationResult.isCorrect
                                      ? "✅"
                                      : "💪"}
                                  </div>

                                  {/* Syllable and Phoneme breakdown */}
                                  {pronunciationResult.words &&
                                    pronunciationResult.words.length > 0 && (
                                      <div className="mt-3 text-left bg-white/5 rounded-lg p-3 max-h-64 overflow-y-auto">
                                        <div className="space-y-3">
                                          {pronunciationResult.words.map(
                                            (word, idx) => (
                                              <div
                                                key={idx}
                                                className="space-y-2"
                                              >
                                                {/* Phoneme-level breakdown */}
                                                {word.phonemes &&
                                                  word.phonemes.length > 0 && (
                                                    <div>
                                                      <div className="text-xs text-gray-400 mb-1">
                                                        Phonemes:
                                                      </div>
                                                      <div className="flex flex-wrap gap-1">
                                                        {word.phonemes.map(
                                                          (phoneme, pIdx) => (
                                                            <div
                                                              key={pIdx}
                                                              className={`px-2 py-1 rounded text-xs font-mono ${
                                                                phoneme.accuracyScore >=
                                                                80
                                                                  ? "bg-green-700"
                                                                  : phoneme.accuracyScore >=
                                                                    60
                                                                  ? "bg-yellow-700"
                                                                  : "bg-red-700"
                                                              }`}
                                                              title={`Phoneme: ${phoneme.phoneme} - Score: ${phoneme.accuracyScore}%`}
                                                            >
                                                              {phoneme.phoneme}{" "}
                                                              <span className="text-xs opacity-75">
                                                                (
                                                                {
                                                                  phoneme.accuracyScore
                                                                }
                                                                %)
                                                              </span>
                                                            </div>
                                                          )
                                                        )}
                                                      </div>
                                                    </div>
                                                  )}
                                              </div>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {getTikTokVideoId(currentFlashcard?.videoUrls?.[currentVideoIndex]) ? (
                          <TikTokEmbed
                            videoId={getTikTokVideoId(currentFlashcard?.videoUrls?.[currentVideoIndex])}
                          />
                        ) : getYouTubeVideoId(currentFlashcard?.videoUrls?.[currentVideoIndex]) ? (
                          <YouTubeEmbed
                            videoId={getYouTubeVideoId(currentFlashcard?.videoUrls?.[currentVideoIndex])}
                          />
                        ) : (
                          <video
                            ref={(el) => {
                              if (el && !videoRefs[currentVideoIndex]) {
                                const newRefs = [...videoRefs];
                                newRefs[currentVideoIndex] = el;
                                setVideoRefs(newRefs);
                              }
                            }}
                            src={currentFlashcard?.videoUrls?.[currentVideoIndex]}
                            className="w-full h-full object-cover"
                            controls
                            autoPlay
                            playsInline
                            muted
                            onError={() => {
                              console.error(
                                "Video failed to load:",
                                currentFlashcard?.videoUrls?.[currentVideoIndex]
                              );
                            }}
                          />
                        )}
                        {/* Text overlay - only for non-TikTok/YouTube videos */}
                        {!getTikTokVideoId(currentFlashcard?.videoUrls?.[currentVideoIndex]) && !getYouTubeVideoId(currentFlashcard?.videoUrls?.[currentVideoIndex]) && (
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center px-4 pb-6 pt-12 pointer-events-none">
                            <div className="text-center text-white">
                              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-2 drop-shadow-lg break-words max-w-full">
                                {currentFlashcard?.front}
                              </h2>
                            </div>
                          </div>
                        )}

                        {/* Video thumbnails navigation */}
                        {currentFlashcard?.videoUrls?.length > 1 && (
                          <div className="absolute top-4 left-4 flex flex-row gap-2 z-10">
                            {currentFlashcard.videoUrls.map(
                              (videoUrl, videoIndex) => (
                                <button
                                  key={videoIndex}
                                  onClick={() => {
                                    if (videoRefs[currentVideoIndex]) {
                                      videoRefs[currentVideoIndex].pause();
                                    }
                                    setCurrentVideoIndex(videoIndex);
                                  }}
                                  className={`relative w-8 h-8 sm:w-8 sm:h-8 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                                    currentVideoIndex === videoIndex
                                      ? "border-blue-500 ring-2 ring-blue-400 scale-105"
                                      : "border-white/50 hover:border-white hover:scale-105"
                                  }`}
                                  title={`Video ${videoIndex + 1}`}
                                >
                                  {getTikTokVideoId(videoUrl) ? (
                                    <div className="w-full h-full bg-black flex items-center justify-center">
                                      <span className="text-white text-xs font-bold">TT</span>
                                    </div>
                                  ) : getYouTubeVideoId(videoUrl) ? (
                                    <div className="w-full h-full bg-red-600 flex items-center justify-center">
                                      <span className="text-white text-xs font-bold">YT</span>
                                    </div>
                                  ) : (
                                    <video
                                      src={videoUrl}
                                      className="w-full h-full object-cover pointer-events-none"
                                      muted
                                    />
                                  )}
                                  {currentVideoIndex === videoIndex && (
                                    <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center"></div>
                                  )}
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Back Face */}
                  <div className={`flip-card-back ${
                    mediaMode === "video"
                      ? getVideoAspectClass(currentFlashcard?.videoUrls?.[currentVideoIndex])
                      : "aspect-square"
                  } relative`}>
                    {mediaMode === "image" ? (
                      <>
                        <img
                          src={currentFlashcard?.image}
                          alt={currentFlashcard?.back}
                          className="w-full h-full object-contain"
                        />
                        {/* Overlay with back text */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent flex items-end justify-center px-4 pb-6 pt-12">
                          <div className="text-center text-white">
                            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-2 drop-shadow-lg break-words max-w-full">
                              {currentFlashcard?.back}
                            </h2>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {getTikTokVideoId(currentFlashcard?.videoUrls?.[currentVideoIndex]) ? (
                          <TikTokEmbed
                            videoId={getTikTokVideoId(currentFlashcard?.videoUrls?.[currentVideoIndex])}
                          />
                        ) : getYouTubeVideoId(currentFlashcard?.videoUrls?.[currentVideoIndex]) ? (
                          <YouTubeEmbed
                            videoId={getYouTubeVideoId(currentFlashcard?.videoUrls?.[currentVideoIndex])}
                          />
                        ) : (
                          <>
                            <video
                              src={currentFlashcard?.videoUrls?.[currentVideoIndex]}
                              className="w-full h-full object-cover"
                              controls
                              playsInline
                              muted
                            />
                            {/* Text overlay */}
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center px-4 pointer-events-none">
                              <div className="text-center text-white">
                                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-2 drop-shadow-lg break-words max-w-full">
                                  {currentFlashcard?.back}
                                </h2>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Score Indicator */}
                {Object.keys(cardScores).length > 0 && (() => {
                  const practicedCount = Object.keys(cardScores).length;
                  const totalCount = displayedCards.length;
                  const scores = Object.values(cardScores).map((c) => c.bestScore);
                  const avgScore = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
                  const chest = avgScore >= 90
                    ? { label: 'Rare', text: 'text-blue-700', img: assetUrl('/image/chest/chest-gold.png') }
                    : avgScore >= 80
                    ? { label: 'Uncommon', text: 'text-green-700', img: assetUrl('/image/chest/chest-silver.png') }
                    : { label: 'Common', text: 'text-gray-600', img: assetUrl('/image/chest/chest-bronze.png') };
                  const barColor = avgScore >= 90 ? 'bg-blue-500' : avgScore >= 80 ? 'bg-green-500' : 'bg-gray-400';
                  return (
                    <div className="px-4 pt-3 pb-1 bg-white">
                      <div className="flex items-center gap-3">
                        {/* Chest image */}
                        <div className="flex-shrink-0 text-center min-w-[3rem]">
                          <img src={chest.img} alt={chest.label} className="w-10 h-10 sm:w-12 sm:h-12 object-contain mx-auto" />
                          <div className={`text-[10px] sm:text-xs font-bold ${chest.text} leading-tight mt-0.5`}>{chest.label}</div>
                        </div>
                        {/* Score info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
                            <span className="text-gray-500">
                              {practicedCount}/{totalCount} thẻ
                            </span>
                            <span className={`font-bold ${chest.text}`}>
                              {avgScore}%
                            </span>
                          </div>
                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden relative">
                            <div
                              className={`h-full ${barColor} rounded-full transition-all duration-500`}
                              style={{ width: `${avgScore}%` }}
                            />
                            {/* Threshold markers */}
                            <div className="absolute top-0 h-full w-px bg-green-600 opacity-50" style={{ left: '80%' }} title="Uncommon 80%" />
                            <div className="absolute top-0 h-full w-px bg-blue-600 opacity-50" style={{ left: '90%' }} title="Rare 90%" />
                          </div>
                          <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                            <span>Common</span>
                            <span>Uncommon 80%+</span>
                            <span>Rare 90%+</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Controls */}
                <div className="p-3 sm:p-4 md:p-6 bg-white flex justify-center items-center gap-2 sm:gap-3 md:gap-4">
                  <button
                    onClick={goToPreviousCard}
                    className="button-3d btn-gray w-10 h-10 sm:w-12 sm:h-12 bg-gray-600 hover:bg-gray-700 text-white rounded-full flex items-center justify-center transition-colors duration-200 flex-shrink-0"
                    title="Previous Card"
                    disabled={displayedCards.length <= 1}
                  >
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>

                  {/* Media toggle button - hidden, kept for later */}
                  {/* <button
                    onClick={toggleMediaMode}
                    className="button-3d btn-orange w-12 h-12 sm:w-12 sm:h-12 md:w-16 md:h-16 bg-orange-600 hover:bg-orange-700 text-white rounded-full flex items-center justify-center transition-colors duration-200 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={
                      mediaMode === "image"
                        ? "Switch to Video"
                        : "Switch to Image"
                    }
                    disabled={
                      !currentFlashcard?.videoUrls ||
                      currentFlashcard.videoUrls.length === 0
                    }
                  >
                    {mediaMode === "image" ? (
                      <Video className="w-5 h-5 sm:w-6 sm:h-6" />
                    ) : (
                      <Image className="w-5 h-5 sm:w-6 sm:h-6" />
                    )}
                  </button> */}

                  <button
                    onClick={playAudio}
                    disabled={
                      !currentFlashcard?.front || !currentFlashcard.front.trim()
                    }
                    className={`button-3d w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-white rounded-full flex items-center justify-center transition-colors duration-200 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
                      speechSynth.speaking
                        ? "btn-red bg-red-600 hover:bg-red-700"
                        : "btn-blue bg-blue-700 hover:bg-blue-800"
                    }`}
                    title={speechSynth.speaking ? "Stop Speech" : "Speak Text"}
                  >
                    <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>

                  <button
                    onClick={toggleRecording}
                    disabled={
                      !currentFlashcard?.front || !currentFlashcard.front.trim()
                    }
                    className={`button-3d w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-white rounded-full flex items-center justify-center transition-colors duration-200 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
                      isRecording
                        ? "btn-red bg-red-600 hover:bg-red-700 animate-pulse"
                        : "btn-purple bg-purple-600 hover:bg-purple-700"
                    }`}
                    title={
                      isRecording ? "Recording..." : "Practice Pronunciation"
                    }
                  >
                    <Mic className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>

                  {!(currentFlashcard?.front?.trim() === currentFlashcard?.back?.trim() &&
                    !(currentFlashcard?.videoUrls?.length > 0)) && (
                    <button
                      onClick={flipCard}
                      className="button-3d btn-green w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-green-600 text-white rounded-full flex items-center justify-center transition-colors duration-200 flex-shrink-0"
                      title="Flip Card"
                    >
                      <div className="text-xs font-bold">FLIP</div>
                    </button>
                  )}

                  <button
                    onClick={() => setShowTutorial(true)}
                    className="button-3d btn-blue w-10 h-10 sm:w-12 sm:h-12 bg-sky-500 hover:bg-sky-600 text-white rounded-full flex items-center justify-center transition-colors duration-200 flex-shrink-0"
                    title="Tutorial"
                    style={{ boxShadow: '0 4px 0 #0369a1' }}
                  >
                    <Info className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>

                  <button
                    onClick={goToNextCard}
                    className="button-3d btn-gray w-10 h-10 sm:w-12 sm:h-12 bg-gray-600 hover:bg-gray-700 text-white rounded-full flex items-center justify-center transition-colors duration-200 flex-shrink-0"
                    title="Next Card"
                    disabled={displayedCards.length <= 1}
                  >
                    <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right Side Thumbnails - 3-4 Columns Grid */}
            <div className="hidden lg:block  flex-shrink-0 overflow-hidden">
              <div className="grid grid-cols-3 xl:grid-cols-8 gap-2 max-h-screen overflow-y-auto p-2">
                {displayedCards.map((card, index) => (
                  <button
                    key={card.id}
                    onClick={() => handleCardSelect(index)}
                    className={`relative aspect-square rounded-lg overflow-hidden transition-all duration-200 ${
                      currentCard === index
                        ? "ring-4 ring-blue-500 scale-100 z-10"
                        : "hover:scale-102 hover:shadow-lg"
                    }`}
                  >
                    <img
                      src={card.image}
                      alt={card.front}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="text-center text-white">
                        <p className="text-xs font-bold">{card.front}</p>
                      </div>
                    </div>
                    {/* Video indicator */}
                    {card.videoUrls && card.videoUrls.length > 0 && (
                      <div className="absolute top-1 left-1">
                        <div className="bg-orange-600 rounded-full p-1">
                          <Video className="w-3 h-3 text-white" />
                        </div>
                      </div>
                    )}
                    {/* Practice indicator */}
                    {cardScores[card.id] && (
                      <div className="absolute bottom-1 right-1">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            cardScores[card.id].bestScore >= 80
                              ? "bg-green-500"
                              : cardScores[card.id].bestScore >= 60
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                        >
                          ✓
                        </div>
                      </div>
                    )}
                    {currentCard === index && (
                      <div className="absolute top-1 right-1">
                        <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Thumbnail Navigation - Mobile/Tablet fallback */}
          <div className="lg:hidden w-full">
            <div className="grid gap-2 sm:gap-3 grid-cols-5 sm:grid-cols-4 md:grid-cols-5">
              {displayedCards.map((card, index) => (
                <button
                  key={card.id}
                  onClick={() => handleCardSelect(index)}
                  className={`relative aspect-square rounded-lg overflow-hidden transition-all duration-200 ${
                    currentCard === index
                      ? "ring-2 sm:ring-4 ring-blue-500 scale-105"
                      : "hover:scale-105 hover:shadow-lg"
                  }`}
                >
                  <img
                    src={card.image}
                    alt={card.front}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-1">
                    <div className="text-center text-white">
                      <p className="text-xs sm:text-sm font-bold line-clamp-2">
                        {card.front}
                      </p>
                    </div>
                  </div>
                  {/* Video indicator */}
                  {card.videoUrls && card.videoUrls.length > 0 && (
                    <div className="absolute top-1 left-1 sm:top-2 sm:left-2">
                      <div className="bg-orange-600 rounded-full p-1">
                        <Video className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  )}
                  {/* Practice indicator */}
                  {cardScores[card.id] && (
                    <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2">
                      <div
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          cardScores[card.id].bestScore >= 80
                            ? "bg-green-500"
                            : cardScores[card.id].bestScore >= 60
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                      >
                        ✓
                      </div>
                    </div>
                  )}
                  {currentCard === index && (
                    <div className="absolute top-1 right-1 sm:top-2 sm:right-2"></div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Next Exercise Button */}
        {(sessionId || isChallenge) && (
          <div className="flex justify-center mt-6">
            <Button
              onClick={isChallenge ? goToFinishChallenge : goToNextExercise}
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-50"
            >
              Hoàn thành
            </Button>
          </div>
        )}
      </div>

      {/* Celebration Screen */}
      {showCelebration && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <CelebrationScreen
            score={celebrationScore}
            correctAnswers={Object.keys(cardScores).length}
            totalQuestions={displayedCards.length}
            passThreshold={80}
            xpAwarded={celebrationXP}
            passGif={passGif}
            isRetryMode={false}
            wrongQuestionsCount={0}
            onBackToList={handleCelebrationDismiss}
            exerciseId={exerciseId}
          />
        </div>
      )}

      {/* Meme Overlay */}
      {showMeme && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <img
            src={currentMeme}
            alt="Reaction meme"
            className="rounded-lg shadow-2xl"
            style={{ width: '200px', height: 'auto' }}
          />
        </div>
      )}

      {/* Tutorial Modal */}
      {showTutorial && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowTutorial(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-[90%] max-w-md mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800">Hướng dẫn</h2>
              <button
                onClick={() => setShowTutorial(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4 text-sm text-gray-700">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-yellow-600 text-lg">🏆</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Cách tính điểm</p>
                  <p>Điểm của bài là trung bình cộng của các thẻ</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-red-500 text-lg">❤️</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Recorder không thu âm?</p>
                  <p>Reset lại permission</p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={() => setShowTutorial(false)}
                className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-lg transition-colors"
              >
                Đã hiểu!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FlashcardExercise;
