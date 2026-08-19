import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../supabase/client";
import { usePet, getPetLevelFromXp } from "../../hooks/usePet";
import { useInventory } from "../../hooks/useInventory";
import { useAuth } from "../../hooks/useAuth";
import { useProgress } from "../../hooks/useProgress";
import { chatWithPet } from "../../utils/petChatService";
import {
  Star,
  Sparkles,
  MessageCircle,
  Send,
  X,
  Loader2,
} from "lucide-react";
import PetCatchGame from "./games/PetCatchGame";
import PetFlappyGame from "./games/PetFlappyGame";
import PetWordScramble from "./games/PetWordScramble";
import PetWhackMole from "./games/PetWhackMole";
import PetAstroBlast from "./games/PetAstroBlast";
import PetMatchGame from "./games/PetMatchGame";
import PetWordType from "./games/PetWordType";
import PetBombParty from "./games/PetBombParty";
import PetSayItRight from "./games/PetSayItRight";
import PetQuizRush from "./games/PetQuizRush";
import PetQuizBossBattle from "./games/PetQuizBossBattle";
import PetAngryPet from "./games/PetAngryPet";
import PvPMatchmaking from "../pvp/PvPMatchmaking";
import WildEncounterModal from "./WildEncounterModal";
import PetMazeAdventure from "./games/PetMazeAdventure";
import PetFishingGame from "./games/PetFishingGame";

import { assetUrl } from '../../hooks/useBranding';
import { fetchPvpSchedule, checkPvpAvailability } from '../../utils/pvpSchedule';
import { getSettings, getSetting } from '../../utils/siteSettings';
// Pet chat messages - replace with your own!
const PET_MESSAGES = [
  // English Idioms
  "Practice makes perfect! Keep going! 💪",
  "Every cloud has a silver lining! ☁️✨",
  "Rome wasn't built in a day - be patient with yourself!",
  "The early bird catches the worm! 🐦",
  "When life gives you lemons, make lemonade! 🍋",
  "Actions speak louder than words!",
  "Don't put all your eggs in one basket! 🥚",
  "Better late than never, right?",
  // Fun Facts
  "Did you know? Honey never spoils! 🍯",
  "Fun fact: Octopuses have three hearts! 🐙",
  "Did you know? Bananas are berries, but strawberries aren't! 🍌",
  "Fun fact: A group of flamingos is called a 'flamboyance'! 🦩",
  "Did you know? Sharks existed before trees! 🦈",
  "Fun fact: Venus is the only planet that spins clockwise! 🪐",
  "Did you know? Cows have best friends! 🐄💕",
  "Fun fact: The shortest war in history lasted 38 minutes!",
  "Good-bye is a contraction of God be with ye",
  "The original name for a butterfly was flutterby",
  "Uncopyrightable is the longest word in common use that contains no letter more than once.",
  "Go! is the shortest, grammatically correct sentence.",
  "Aegilops is the longest word with all letters in alphabetical order.",

  // Encouragement
  "You're doing great! Keep it up! ⭐",
  "Learning is a journey, not a race! 🚀",
  "Mistakes help us grow! Don't be afraid to try!",
  "I believe in you! Let's learn together! 📚",
];

const PetDisplay = () => {
  const {
    activePet,
    feedPet,
    playWithPet,
    evolvePet,
    drainPetEnergy,
    restoreUserEnergy,
    getActiveBonuses,
    userEnergy,
    rollWildAreaEncounter,
    pendingEncounter,
    clearEncounter,
  } = usePet();
  const { inventory, fetchInventory } = useInventory();
  const { user, profile, isAdmin } = useAuth();
  const isStaff = () => isAdmin() || profile?.role === 'teacher';
  const { getEquippedItemsXPBonus, addXP } = useProgress();
  const [showFeedMenu, setShowFeedMenu] = useState(false);
  const [message, setMessage] = useState(null);
  const [chatBubble, setChatBubble] = useState(null);
  const [showPetInfo, setShowPetInfo] = useState(false);
  const [showBonuses, setShowBonuses] = useState(false);
  const [itemBonuses, setItemBonuses] = useState({ total: 0, items: [] });
  const [isEating, setIsEating] = useState(false);
  const [evolving, setEvolving] = useState(false);
  const [evolutionOverlay, setEvolutionOverlay] = useState(null); // { oldImage, newImage, petName, newStageName }

  // Feed animation state
  const [feedAnimation, setFeedAnimation] = useState(null); // { food: '🍖', particles: [] }
  const petContainerRef = useRef(null);
  const pendingAttemptId = useRef(null);

  // Play animation state
  const [playAnimation, setPlayAnimation] = useState(null); // { xpGained: 10, phase: 'active' }
  const [trainingVideoLoaded, setTrainingVideoLoaded] = useState(false);
  const [idleAnimation, setIdleAnimation] = useState(false); // plays idle video over pet

  // Chat state
  const [playDisabled, setPlayDisabled] = useState(false);
  const [playCooldown, setPlayCooldown] = useState(0);
  const [showGame, setShowGame] = useState(null); // null | 'picker' | 'catch' | 'flappy' | 'scramble' | 'whackmole' | 'astroblast' | 'matchgame' | 'quizrush' | 'bossbattle' | 'angrypet'
  const [gameLeaderboards, setGameLeaderboards] = useState({ whackmole: [], scramble: [], astroblast: [], matchgame: [], wordtype: [], bombparty: [], sayitright: [], quizrush: [], bossbattle: [], angrypet: [], fishing: [] });
  const [wordBank, setWordBank] = useState([]);
  const [questionBank, setQuestionBank] = useState([]);
  const [enabledGames, setEnabledGames] = useState(['scramble', 'whackmole', 'astroblast', 'matchgame', 'wordtype', 'bombparty', 'sayitright', 'quizrush', 'bossbattle', 'angrypet', 'catch', 'fishing']);
  const [competitionGame, setCompetitionGame] = useState(null); // game type with active competition
  const [chestEnabled, setChestEnabled] = useState(false); // whether chest can appear in games
  const [mazeBlocked, setMazeBlocked] = useState(false); // whether maze adventure is blocked
  const [mazeBlockedReason, setMazeBlockedReason] = useState('');
  const [trainingBlocked, setTrainingBlocked] = useState(false); // true when outside allowed schedule
  const [trainingBlockedReason, setTrainingBlockedReason] = useState('');
  const [pvpWaitingCount, setPvpWaitingCount] = useState(0);
  const [showWildArea, setShowWildArea] = useState(false);
  const [wildAreaLoading, setWildAreaLoading] = useState(false);
  const [mazeAdventure, setMazeAdventure] = useState(null); // { mode: 'encounter'|'standalone', pet: object|null, rarity: string }
  const [encounterPetAfterMaze, setEncounterPetAfterMaze] = useState(null); // pet object to show WildEncounterModal after maze
  const [wildAreaCooldown, setWildAreaCooldown] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatContainerRef = useRef(null);

  // Fetch equipped item XP bonuses
  useEffect(() => {
    const fetchItemBonuses = async () => {
      const result = await getEquippedItemsXPBonus()
      setItemBonuses(result)
    }
    fetchItemBonuses()
  }, [profile?.active_title, profile?.active_background_url, profile?.active_bowl_url])

  // Fetch chest settings and determine eligibility
  const [chestCheckTrigger, setChestCheckTrigger] = useState(0);
  useEffect(() => {
    const checkChestEligibility = async () => {
      if (!user?.id) return;

      // Fetch chest settings (shared cache)
      const map = await getSettings(['chest_enabled', 'chest_start_time', 'chest_end_time', 'chest_daily_limit']);

      // Check if chest feature is enabled
      if (map['chest_enabled'] !== 'true') {
        setChestEnabled(false);
        return;
      }

      // Check time window (Vietnam timezone)
      const now = new Date();
      const vnFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      const vnParts = {};
      vnFormatter.formatToParts(now).forEach(p => { vnParts[p.type] = p.value; });
      const currentMinutes = parseInt(vnParts.hour) * 60 + parseInt(vnParts.minute);

      const startTime = map['chest_start_time'] || '';
      const endTime = map['chest_end_time'] || '';

      if (startTime && endTime) {
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        const startMinutes = sh * 60 + (sm || 0);
        const endMinutes = eh * 60 + (em || 0);

        if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
          setChestEnabled(false);
          return;
        }
      }

      // Check daily limit
      const dailyLimit = parseInt(map['chest_daily_limit']) || 0;
      if (dailyLimit > 0) {
        // Get today's date in Vietnam timezone
        const todayVN = `${vnParts.year}-${vnParts.month}-${vnParts.day}`;
        const todayStart = todayVN + 'T00:00:00+07:00';
        const todayEnd = todayVN + 'T23:59:59+07:00';

        const { count } = await supabase
          .from('user_chests')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('source', 'pet_game')
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd);

        if ((count || 0) >= dailyLimit) {
          setChestEnabled(false);
          return;
        }
      }

      setChestEnabled(true);
    };

    checkChestEligibility();
  }, [user?.id, chestCheckTrigger]);

  // Fetch maze adventure settings and determine eligibility
  useEffect(() => {
    const checkMazeEligibility = async () => {
      if (!user?.id) return;

      const map = await getSettings(['maze_enabled', 'maze_start_time', 'maze_end_time', 'maze_daily_limit']);

      if (map['maze_enabled'] === 'false') {
        setMazeBlocked(true);
        setMazeBlockedReason('Wild Area is currently closed.');
        return;
      }

      // Check time window (Vietnam timezone)
      const now = new Date();
      const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
      const startTime = map['maze_start_time'];
      const endTime = map['maze_end_time'];

      if (startTime && endTime) {
        const currentMinutes = vnTime.getHours() * 60 + vnTime.getMinutes();
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        const startMinutes = sh * 60 + sm;
        const endMinutes = eh * 60 + em;

        if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
          setMazeBlocked(true);
          setMazeBlockedReason(`Wild Area opens ${startTime}–${endTime}.`);
          return;
        }
      }

      // Check daily limit (server-side enforced, but also check here for UI)
      const dailyLimit = parseInt(map['maze_daily_limit']) || 0;
      if (dailyLimit > 0) {
        const todayVN = vnTime.toISOString().split('T')[0];
        const todayStart = new Date(todayVN + 'T00:00:00+07:00').toISOString();
        const { count } = await supabase
          .from('wild_area_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('action', 'encounter')
          .gte('created_at', todayStart);

        if ((count || 0) >= dailyLimit) {
          setMazeBlocked(true);
          setMazeBlockedReason(`Daily limit reached (${dailyLimit}/${dailyLimit}).`);
          return;
        }
      }

      setMazeBlocked(false);
      setMazeBlockedReason('');
    };

    checkMazeEligibility();
  }, [user?.id]);

  // Fetch enabled training games
  useEffect(() => {
    const fetchEnabledGames = async () => {
      const value = await getSetting('pet_training_enabled_games')
      if (value) {
        try { setEnabledGames(JSON.parse(value)) } catch {}
      }
    }
    fetchEnabledGames()

    // Fetch active competition game type
    const fetchCompetition = async () => {
      const m = await getSettings([
        'leaderboard_competition_active',
        'leaderboard_competition_type',
        'leaderboard_competition_game_type',
        'leaderboard_competition_end_date',
      ])
      {
        const isActive = m['leaderboard_competition_active'] !== 'false'
        const compType = m['leaderboard_competition_type'] || 'game'
        const endDate = m['leaderboard_competition_end_date'] || ''
        const notExpired = !endDate || new Date() <= new Date(endDate + 'T23:59:59+07:00')
        if (isActive && compType === 'game' && notExpired) {
          setCompetitionGame(m['leaderboard_competition_game_type'] || 'scramble')
        }
      }
    }
    fetchCompetition()

    // Fetch activity schedule (controls training + PvP)
    const checkTrainingSchedule = async () => {
      const schedule = await fetchPvpSchedule()
      const { available, reason } = checkPvpAvailability(schedule)
      const blocked = !available && !isStaff()
      setTrainingBlocked(blocked)
      if (blocked) setTrainingBlockedReason(reason)
    }
    checkTrainingSchedule()
  }, [])

  // Poll PvP matchmaking waiting count
  useEffect(() => {
    const fetchWaitingCount = async () => {
      const { count } = await supabase.from('pvp_matchmaking')
        .select('id', { count: 'exact', head: true })
        .eq('game_type', 'wordtype')
        .eq('status', 'waiting')
      setPvpWaitingCount(count || 0)
    }
    fetchWaitingCount()
    const interval = setInterval(fetchWaitingCount, 10000)
    return () => clearInterval(interval)
  }, [])

  // Scroll chat to bottom when new messages arrive (only inside chat container)
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Show random chat bubble periodically (disabled temporarily)
  useEffect(() => {
    return; // disabled temporarily
    if (!activePet) return;

    const showRandomMessage = () => {
      const randomMsg =
        PET_MESSAGES[Math.floor(Math.random() * PET_MESSAGES.length)];
      setChatBubble(randomMsg);
      // Hide after 4 seconds
      setTimeout(() => setChatBubble(null), 8000);
    };

    // Show first message after 2 seconds
    const initialTimeout = setTimeout(showRandomMessage, 2000);

    // Then show messages every 15-30 seconds randomly
    const interval = setInterval(() => {
      const randomDelay = Math.random() * 15000 + 30000; // 15-30 seconds
      setTimeout(showRandomMessage, randomDelay);
    }, 30000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [activePet]);

  // Handle sending chat message
  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading || !activePet) return;

    const userMessage = chatInput.trim();
    setChatInput("");

    // Check and drain pet energy first
    const energyResult = await drainPetEnergy(5);
    if (!energyResult.success) {
      setChatMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage },
        {
          role: "pet",
          content: `*${activePet.nickname || activePet.name} ngáp dài* Mình hơi mệt rồi... cho mình nghỉ ngơi hoặc ăn gì đó nhé! 😴`,
        },
      ]);
      return;
    }

    // Add user message to chat
    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage },
    ]);
    setChatLoading(true);

    try {
      const response = await chatWithPet(
        activePet,
        userMessage,
        chatMessages,
        "vi",
      );
      // Add pet response to chat
      setChatMessages((prev) => [
        ...prev,
        { role: "pet", content: response.message },
      ]);
      // Show in chat bubble too
      setChatBubble(response.message);
      setTimeout(() => setChatBubble(null), 10000);
    } catch (error) {
      console.error("Chat error:", error);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "pet",
          content: `*${activePet.nickname || activePet.name} looks confused*`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Wild area cooldown timer
  useEffect(() => {
    if (wildAreaCooldown <= 0) return
    const timer = setInterval(() => {
      setWildAreaCooldown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [wildAreaCooldown])

  // Ticket count for wild area
  const adventureTickets = inventory.filter(i => i.item?.item_type === 'ticket' && i.item?.name === 'Adventure Ticket')
  const adventureTicketCount = adventureTickets.reduce((sum, i) => sum + (i.quantity || 0), 0)

  // Wild Area handler — routes through maze adventure before encounter
  const handleWildAreaSearch = async () => {
    // Check maze access (admins bypass)
    if (mazeBlocked && !isAdmin()) {
      setMessage({ type: 'error', text: mazeBlockedReason || 'Wild Area is not available right now.' })
      return
    }

    setWildAreaLoading(true)
    const result = await rollWildAreaEncounter()
    setWildAreaLoading(false)
    if (result?.error === 'no_ticket') {
      setMessage({ type: 'error', text: 'You need an Adventure Ticket to enter the Wild Area!' })
      return
    }
    if (result?.error === 'daily_limit') {
      setMazeBlocked(true)
      setMazeBlockedReason(`Daily limit reached (${result.daily_limit}/${result.daily_limit}).`)
      setMessage({ type: 'error', text: `Daily limit reached (${result.daily_limit}/${result.daily_limit}).` })
      return
    }
    if (result?.cooldown_remaining && !isAdmin()) {
      setWildAreaCooldown(result.cooldown_remaining)
    }
    if (result?.encountered) {
      fetchInventory() // refresh ticket count
      clearEncounter() // prevent WildEncounterModal from showing yet
      setShowWildArea(false)
      await fetchWordBank()
      await fetchQuestionBank()
      setMazeAdventure({ mode: 'encounter', pet: result.pet, rarity: result.pet.rarity })
    } else if (!result?.cooldown_remaining) {
      setMessage({ type: 'info', text: 'No wild pets found... try again later!' })
    }
  }


  if (!activePet) {
    return (
      <div className="relative bg-white border border-gray-200 shadow-lg p-6 text-center overflow-hidden"
        style={{ clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)' }}
      >
        <div className="absolute top-0 left-[12px] w-5 h-[1px] bg-gradient-to-r from-blue-300/40 to-transparent" />
        <div className="absolute top-0 left-[12px] w-[1px] h-5 bg-gradient-to-b from-blue-300/40 to-transparent" />
        <div className="absolute bottom-0 right-[12px] w-5 h-[1px] bg-gradient-to-l from-blue-300/40 to-transparent" />
        <div className="absolute bottom-0 right-[12px] w-[1px] h-5 bg-gradient-to-t from-blue-300/40 to-transparent" />
        <div className="text-gray-400 mb-4">
          <Sparkles className="w-16 h-16 mx-auto mb-2" />
          <h3 className="text-xl font-semibold text-gray-600">No Active Pet</h3>
          <p className="text-sm text-gray-500 mt-2">
            Pet gain you bonus XP and explain questions to you
          </p>
        </div>
      </div>
    );
  }

  const bonuses = getActiveBonuses();

  const petFoodItems = inventory.filter(
    (item) => item.item?.item_type === "pet_food" && item.quantity > 0 && !item.item?.name?.toLowerCase().includes('evolution'),
  );

  // Get energy gain based on food rarity
  const getFoodStats = (rarity) => {
    const stats = {
      common: { energy: 5 },
      uncommon: { energy: 10 },
      rare: { energy: 15 },
      epic: { energy: 20 },
    };
    return stats[rarity] || stats.common;
  };

  // Get next evolution stage info
  const getNextEvolution = () => {
    if (!activePet?.evolution_stages) return null;
    const currentStage = activePet.evolution_stage || 0;
    const stages = activePet.evolution_stages;

    // Find next stage
    const nextStage = stages.find((stage) => stage.stage === currentStage + 1);
    return nextStage;
  };

  // Find evolution fruit matching pet rarity in inventory
  const getEvolutionFruit = () => {
    if (!activePet) return null
    return inventory.find(
      (item) => item.item?.item_type === "pet_food" && item.quantity > 0 && item.item?.rarity === activePet.rarity && item.item?.name?.toLowerCase().includes('evolution')
    ) || null
  }

  const handleEvolve = async () => {
    const fruit = getEvolutionFruit()
    if (!fruit) return
    setEvolving(true)
    try {
      // Capture old image before evolving
      const oldImage = getPetImage()
      const result = await evolvePet(activePet.id, fruit.item.id)
      if (result.success) {
        // Find new stage image
        const newStageData = activePet.evolution_stages?.find(s => s.stage === result.new_stage)
        const newImage = newStageData?.image_url || oldImage
        const newStageName = newStageData?.name || `Stage ${result.new_stage}`
        setEvolutionOverlay({
          oldImage,
          newImage,
          petName: activePet.nickname || activePet.name,
          newStageName,
        })
      } else {
        setMessage({ type: 'error', text: result.error || 'Evolution failed' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (e) {
      console.error('Evolution failed:', e)
    } finally {
      setEvolving(false)
    }
  }

  // Trigger flying food animation
  const triggerFeedAnimation = (energyGained = 15, foodImageUrl = null) => {
    const particles = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      image: foodImageUrl,
      angle: i * 45 + Math.random() * 20,
      distance: 40 + Math.random() * 30,
    }));

    setFeedAnimation({ food: foodImageUrl, particles, phase: "flying", energyGained });

    // After food reaches pet, show burst
    setTimeout(() => {
      setFeedAnimation((prev) => (prev ? { ...prev, phase: "burst" } : null));
    }, 600);

    // Start eating state
    setTimeout(() => {
      setIsEating(true);
    }, 600);

    // Clear animation after 3 seconds
    setTimeout(() => {
      setFeedAnimation(null);
    }, 3000);

    // Stop eating state
    setTimeout(() => {
      setIsEating(false);
    }, 4000);
  };

  // Trigger play animation with XP gain
  const triggerPlayAnimation = (xpGained = 10) => {
    setTrainingVideoLoaded(false);
    setPlayAnimation({ xpGained, phase: "active" });

    // Clear animation after 6 seconds
    setTimeout(() => {
      setPlayAnimation(null);
      setTrainingVideoLoaded(false);
    }, 6000);
  };

  const handleFeed = async (itemId = null) => {
    const result = await feedPet(activePet.id, itemId);
    if (result.success) {
      // Find the food item image
      const foodItem = itemId ? petFoodItems.find(i => i.item.id === itemId) : null;
      // Get energy gained from result or calculate from item rarity
      const energyGained = result.energy_gained || (foodItem ? getFoodStats(foodItem.item.rarity).energy : 15);
      const foodImageUrl = foodItem?.item?.image_url || null;

      // Restore user-level energy
      await restoreUserEnergy(energyGained);

      // Play chomp sound
      const chompSound = new Audio(assetUrl('/sound/chomp.mp3'));
      chompSound.play().catch(() => {});

      // Trigger flying food animation with energy gained
      triggerFeedAnimation(energyGained, foodImageUrl);

      setMessage({
        type: "success",
        text: `${activePet.nickname || activePet.name} enjoyed the meal! 😋`,
      });
      setShowFeedMenu(false);
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage({
        type: "error",
        text: result.error || "Failed to feed pet",
      });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handlePlay = async () => {
    if (trainingBlocked) {
      setShowGame('picker');
      return;
    }
    if ((userEnergy ?? 100) < 5) {
      setMessage({ type: 'error', text: `${activePet.nickname || activePet.name} is too tired to train! Feed your pet first. 😴` });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    await fetchWordBank();
    await fetchQuestionBank();
    setShowGame('picker');
  };

  // Record attempt at game START (score 0), update with real score on end.
  // This way refresh/quit still counts as an attempt.
  const recordAttemptStart = async (gameType) => {
    if (!gameType || !user?.id) return;

    // Check attempt limit during active competition (shared cache)
    const settingsMap = await getSettings([
      'leaderboard_competition_active',
      'leaderboard_competition_type',
      'leaderboard_competition_game_type',
      'leaderboard_competition_max_attempts',
      'leaderboard_competition_end_date',
    ]);

    const isActive = settingsMap['leaderboard_competition_active'] !== 'false';
    const compType = settingsMap['leaderboard_competition_type'] || 'game';
    const activeGameType = settingsMap['leaderboard_competition_game_type'] || 'scramble';
    const maxAttempts = parseInt(settingsMap['leaderboard_competition_max_attempts']) || 0;
    const endDate = settingsMap['leaderboard_competition_end_date'] || '';

    // Enforce attempt limit only during active competition for the matching game
    const isCompetitionGame = isActive && compType === 'game' && gameType === activeGameType
      && !(endDate && new Date() > new Date(endDate + 'T23:59:59+07:00'));

    if (isCompetitionGame && maxAttempts > 0) {
      const now = new Date();
      const day = now.getDay();
      const daysFromMonday = day === 0 ? 6 : day - 1;
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - daysFromMonday);
      const weekStartISO = weekStart.toISOString().split('T')[0] + 'T00:00:00+07:00';

      const { count } = await supabase
        .from('training_scores')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('game_type', gameType)
        .gte('played_at', weekStartISO);

      if (count >= maxAttempts) {
        pendingAttemptId.current = null;
        return;
      }
    }

    // Always insert score — regardless of competition status
    const { data } = await supabase.from('training_scores').insert({
      user_id: user.id,
      game_type: gameType,
      score: 0
    }).select('id').single();

    pendingAttemptId.current = data?.id || null;
  };

  const fetchGameLeaderboard = async (gameType) => {
    if (!user?.id) return;
    const now = new Date();
    const day = now.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - daysFromMonday);
    const weekStartISO = weekStart.toISOString().split('T')[0] + 'T00:00:00+07:00';

    const { data: scores } = await supabase
      .from('training_scores')
      .select('user_id, score')
      .eq('game_type', gameType)
      .gte('played_at', weekStartISO);

    if (!scores || scores.length === 0) { setGameLeaderboards(prev => ({ ...prev, [gameType]: [] })); return; }

    const bestScores = {};
    scores.forEach(s => {
      if (!bestScores[s.user_id] || s.score > bestScores[s.user_id]) {
        bestScores[s.user_id] = s.score;
      }
    });

    // Exclude current user's own score
    delete bestScores[user.id];

    const userIds = Object.keys(bestScores);
    if (userIds.length === 0) { setGameLeaderboards(prev => ({ ...prev, [gameType]: [] })); return; }

    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', userIds)
      .eq('role', 'user');

    if (!users) { setGameLeaderboards(prev => ({ ...prev, [gameType]: [] })); return; }

    const sorted = users
      .map(u => ({ name: u.full_name || u.email?.split('@')[0] || 'Someone', score: bestScores[u.id] || 0 }))
      .sort((a, b) => b.score - a.score);

    setGameLeaderboards(prev => ({ ...prev, [gameType]: sorted }));
  };

  const fetchWordBank = async () => {
    const userLevel = profile?.current_level || 1;

    const { data: words } = await supabase
      .from('pet_word_bank')
      .select('word, hint, image_url, min_level')
      .eq('is_active', true)
      .lte('min_level', userLevel);

    if (words && words.length >= 10) setWordBank(words);
  };

  const fetchQuestionBank = async () => {
    const userLevel = profile?.current_level || 1;

    const { data: questions } = await supabase
      .from('pet_question_bank')
      .select('question, choices, answer_index, image_url')
      .eq('is_active', true)
      .lte('min_level', userLevel);

    if (questions && questions.length >= 5) setQuestionBank(questions);
  };

  // Level-based score bonus: lower levels get more bonus to keep tournaments fair
  const getLevelBonusPercent = () => {
    const level = profile?.current_level || 1;
    if (level <= 1) return 15;
    if (level <= 2) return 10;
    if (level <= 3) return 5;
    return 0;
  };

  const handleGameEnd = async (score, gameType, extra) => {
    setShowGame(null);

    // Apply level bonus to score
    const bonusPercent = getLevelBonusPercent();
    const bonusScore = Math.round(score * bonusPercent / 100);
    const finalScore = score + bonusScore;

    // Update the pending attempt row with the boosted score + refresh played_at to END time
    // (played_at was set at game-start; tournament scoring needs end-time so mid-game transitions count)
    if (pendingAttemptId.current && finalScore > 0) {
      await supabase.from('training_scores')
        .update({ score: finalScore, played_at: new Date().toISOString() })
        .eq('id', pendingAttemptId.current);
    }
    pendingAttemptId.current = null;

    // Auto-resolve any of this student's active tournament matches for this game_type.
    // Runs inline so the bracket updates without waiting for admin to press "Cập nhật điểm".
    if (user?.id && finalScore > 0) {
      try {
        const { data: myMatches } = await supabase
          .from('tournament_matches')
          .select('id, tournament_id, round, player1_id, player2_id, player1_score, player2_score, ready_at, created_at, tournaments!inner(game_type, status)')
          .eq('status', 'ready')
          .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
          .eq('tournaments.game_type', gameType)
          .eq('tournaments.status', 'active');

        for (const m of (myMatches || [])) {
          if (!m.player1_id || !m.player2_id) continue;
          const since = m.ready_at || m.created_at;

          const [p1Res, p2Res] = await Promise.all([
            supabase.from('training_scores')
              .select('score').eq('user_id', m.player1_id).eq('game_type', gameType)
              .gte('played_at', since).gt('score', 0).order('score', { ascending: false }).limit(1),
            supabase.from('training_scores')
              .select('score').eq('user_id', m.player2_id).eq('game_type', gameType)
              .gte('played_at', since).gt('score', 0).order('score', { ascending: false }).limit(1),
          ]);
          const p1Best = p1Res.data?.[0]?.score ?? null;
          const p2Best = p2Res.data?.[0]?.score ?? null;

          // Only update scores — winner is decided when admin advances the round,
          // so students can keep playing to improve their score.
          const partial = {};
          if (p1Best != null && p1Best !== m.player1_score) partial.player1_score = p1Best;
          if (p2Best != null && p2Best !== m.player2_score) partial.player2_score = p2Best;
          if (Object.keys(partial).length > 0) {
            await supabase.from('tournament_matches').update(partial).eq('id', m.id);
          }
        }
      } catch (e) {
        console.error('tournament auto-resolve failed', e);
      }
    }

    // Update mission progress for playing games (non-blocking)
    if (user?.id) {
      supabase.rpc('update_mission_progress', {
        p_user_id: user.id,
        p_goal_type: 'play_games',
        p_increment: 1
      }).then(() => {}, () => {})

      // Track detailed per-game stats for missions
      const gameGoalMap = {
        astroblast: extra?.wordsCompleted && { goal_type: 'blast_words', increment: extra.wordsCompleted },
        whackmole: extra?.molesWhacked && { goal_type: 'whack_moles', increment: extra.molesWhacked },
        scramble: extra?.wordsCompleted && { goal_type: 'scramble_words', increment: extra.wordsCompleted },
        wordtype: extra?.wordsCompleted && { goal_type: 'type_words', increment: extra.wordsCompleted },
        matchgame: extra?.pairsMatched && { goal_type: 'match_pairs', increment: extra.pairsMatched },
        sayitright: extra?.wordsPronounced && { goal_type: 'pronounce_words', increment: extra.wordsPronounced },
        quizrush: extra?.wordsCompleted && { goal_type: 'answer_questions', increment: extra.wordsCompleted },
        bossbattle: extra?.wordsCompleted && { goal_type: 'answer_questions', increment: extra.wordsCompleted },
        angrypet: extra?.wordsCompleted && { goal_type: 'answer_questions', increment: extra.wordsCompleted },
        fishing: extra?.wordsCompleted && { goal_type: 'catch_fish', increment: extra.wordsCompleted },
      }
      const gameGoal = gameGoalMap[gameType]
      if (gameGoal) {
        supabase.rpc('update_mission_progress', {
          p_user_id: user.id,
          p_goal_type: gameGoal.goal_type,
          p_increment: gameGoal.increment
        }).then(() => {}, () => {})
      }

      // Track 3-star achievements for missions
      if (extra?.stars === 3) {
        supabase.rpc('update_mission_progress', {
          p_user_id: user.id,
          p_goal_type: 'earn_3_stars',
          p_increment: 1
        }).then(() => {}, () => {})
      }
    }

    // Grant chest if collected during the game
    if (extra?.chestCollected && user?.id) {
      supabase.rpc('award_milestone_chest', {
        p_user_id: user.id,
        p_milestone_type: 'pet_game',
        p_source_ref: gameType
      }).then(({ data }) => {
        if (data?.success) {
          window.dispatchEvent(new CustomEvent('chest-earned', { detail: data }))
          setChestCheckTrigger(prev => prev + 1)
        }
      }, () => {})
    }

    setPlayDisabled(true);
    setPlayCooldown(5);
    const cooldownInterval = setInterval(() => {
      setPlayCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownInterval);
          setPlayDisabled(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const result = await playWithPet(activePet.id);
    if (result.success) {
      const xpGained = result.xp_gained || 10;
      triggerPlayAnimation(xpGained);
      await addXP(5);

      setTimeout(() => {
        const trainSound = new Audio(assetUrl('/sound/pet-training.mp3'));
        trainSound.play().catch(() => {});
      }, 4000);

      const evolved = result.evolution?.evolved;
      const levelUp = result.level_up;

      let message = `${activePet.nickname || activePet.name} scored ${finalScore} points! 💪`;
      if (evolved) {
        message = `🌟 ${activePet.nickname || activePet.name} evolved to Stage ${result.evolution.new_stage}! ✨`;
      } else if (levelUp) {
        message = `${activePet.nickname || activePet.name} leveled up! 🎉 Level ${result.level}`;
      }

      setMessage({
        type: "success",
        text: message,
      });
      setTimeout(() => setMessage(null), evolved ? 5000 : 3000);
    } else {
      setMessage({
        type: "error",
        text: result.error || "Failed to play with pet",
      });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const getRarityColor = (rarity) => {
    const colors = {
      common: "text-gray-600 bg-gray-200 border border-gray-300",
      uncommon: "text-green-700 bg-green-100 border border-green-300",
      rare: "text-blue-700 bg-blue-100 border border-blue-300 shadow-sm shadow-blue-200",
      epic: "text-purple-700 bg-purple-100 border border-purple-300 shadow-sm shadow-purple-200",
      legendary: "text-yellow-800 bg-gradient-to-r from-yellow-200 to-amber-200 border border-yellow-400 shadow-md shadow-yellow-300",
    };
    return colors[rarity] || colors.common;
  };

  const getRarityStars = (rarity) => {
    const stars = { common: '★', uncommon: '★★', rare: '★★★', epic: '★★★★', legendary: '★★★★★' };
    return stars[rarity] || '';
  };

  const getRarityGradient = (rarity) => {
    const gradients = {
      common: "from-gray-400 to-gray-500",
      uncommon: "from-green-400 to-emerald-500",
      rare: "from-blue-400 to-indigo-500",
      epic: "from-purple-500 to-pink-500",
      legendary: "from-yellow-400 to-orange-500",
    };
    return gradients[rarity] || gradients.common;
  };

  const getRarityAura = (rarity) => {
    const auras = {
      common: assetUrl('/common.png'),
      uncommon: assetUrl('/common.png'),
      rare: assetUrl('/common.png'),
      epic: assetUrl('/common.png'),
      legendary: assetUrl('/common.png'),
    };
    return auras[rarity] || assetUrl('/common.png');
  };

  // Get pet image based on current stats and evolution stage
  const getPetImage = () => {
    // Get base image for current evolution stage
    let baseImage = activePet.image_url;

    if (activePet.evolution_stages && activePet.evolution_stage > 0) {
      const currentStage = activePet.evolution_stages.find(
        (stage) => stage.stage === activePet.evolution_stage,
      );
      if (currentStage?.image_url) {
        baseImage = currentStage.image_url;
      }
    }

    if (!baseImage) return null;

    // Check for state variations (priority: eating > sleepy > default)
    // State images use naming pattern: base-eating.png, base-sleepy.png
    if (isEating) {
      const eatingImage = baseImage.replace(/\.([^.]+)$/, "-eating.$1");
      return eatingImage;
    }

    if ((userEnergy ?? 100) < 30) {
      // Try stage-specific sleepy image
      const sleepyImage = baseImage.replace(/\.([^.]+)$/, "-sleepy.$1");
      return sleepyImage;
    }

    return baseImage; // default/happy state for current stage
  };

  const getPetEnergyStatus = (energy) => {
    if (energy >= 70) return { status: "energetic", color: "text-green-500" };
    if (energy >= 40) return { status: "normal", color: "text-yellow-500" };
    return { status: "sleepy", color: "text-orange-500" };
  };

  const energyStatus = activePet
    ? getPetEnergyStatus(userEnergy ?? 100)
    : null;


  return (
    <div
      className="relative shadow-lg bg-cover bg-center bg-blue-200 overflow-hidden"
      style={{
        backgroundImage: `url(${assetUrl('/image/dashboard/2709577_14710.jpg')})`,
        clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
      }}
    >
      {/* Corner brackets */}
      <div className="absolute top-0 left-[12px] w-5 h-[1px] bg-gradient-to-r from-blue-300/40 to-transparent z-10" />
      <div className="absolute top-0 left-[12px] w-[1px] h-5 bg-gradient-to-b from-blue-300/40 to-transparent z-10" />
      <div className="absolute bottom-0 right-[12px] w-5 h-[1px] bg-gradient-to-l from-blue-300/40 to-transparent z-10" />
      <div className="absolute bottom-0 right-[12px] w-[1px] h-5 bg-gradient-to-t from-blue-300/40 to-transparent z-10" />
      {/* Feed Animation Styles */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        @keyframes flyToPet {
          0% {
            transform: translate(0, 0) scale(0.8);
            opacity: 1;
          }
          70% {
            transform: translate(clamp(-200px, -30vw, -100px), -150px) scale(1.4);
            opacity: 1;
          }
          100% {
            transform: translate(clamp(-200px, -30vw, -100px), -160px) scale(1);
            opacity: 0;
          }
        }
        @keyframes burstSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(180deg); }
        }
        @keyframes particle0 { 0% { transform: translateY(0) scale(0) rotate(0deg); opacity: 1; } 60% { opacity: 1; } 100% { transform: translateY(-60px) scale(1.2) rotate(360deg); opacity: 0; } }
        @keyframes particle1 { 0% { transform: translate(0, 0) scale(0) rotate(0deg); opacity: 1; } 60% { opacity: 1; } 100% { transform: translate(42px, -42px) scale(1.2) rotate(360deg); opacity: 0; } }
        @keyframes particle2 { 0% { transform: translateX(0) scale(0) rotate(0deg); opacity: 1; } 60% { opacity: 1; } 100% { transform: translateX(60px) scale(1.2) rotate(360deg); opacity: 0; } }
        @keyframes particle3 { 0% { transform: translate(0, 0) scale(0) rotate(0deg); opacity: 1; } 60% { opacity: 1; } 100% { transform: translate(42px, 42px) scale(1.2) rotate(360deg); opacity: 0; } }
        @keyframes particle4 { 0% { transform: translateY(0) scale(0) rotate(0deg); opacity: 1; } 60% { opacity: 1; } 100% { transform: translateY(60px) scale(1.2) rotate(360deg); opacity: 0; } }
        @keyframes particle5 { 0% { transform: translate(0, 0) scale(0) rotate(0deg); opacity: 1; } 60% { opacity: 1; } 100% { transform: translate(-42px, 42px) scale(1.2) rotate(360deg); opacity: 0; } }
        @keyframes particle6 { 0% { transform: translateX(0) scale(0) rotate(0deg); opacity: 1; } 60% { opacity: 1; } 100% { transform: translateX(-60px) scale(1.2) rotate(360deg); opacity: 0; } }
        @keyframes particle7 { 0% { transform: translate(0, 0) scale(0) rotate(0deg); opacity: 1; } 60% { opacity: 1; } 100% { transform: translate(-42px, -42px) scale(1.2) rotate(360deg); opacity: 0; } }
        @keyframes spinBackground {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }

        /* Play Animation Keyframes */
        @keyframes glowRing {
          0% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0.8;
          }
          50% {
            opacity: 0.6;
          }
          100% {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0;
          }
        }
        @keyframes fadeGlow {
          0% {
            opacity: 0;
          }
          20% {
            opacity: 0.8;
          }
          100% {
            opacity: 0;
          }
        }
        @keyframes petBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes auraPulse {
          0% {
            transform: scale(0.3);
            opacity: 0;
          }
          20% {
            transform: scale(1);
            opacity: 0.6;
          }
          35% {
            transform: scale(0.8);
            opacity: 0.4;
          }
          55% {
            transform: scale(1.3);
            opacity: 0.7;
          }
          70% {
            transform: scale(1);
            opacity: 0.4;
          }
          85% {
            transform: scale(1.5);
            opacity: 0.6;
          }
          100% {
            transform: scale(1.8);
            opacity: 0;
          }
        }
        @keyframes floatUpXP {
          0% {
            transform: translateY(0) scale(0.8);
            opacity: 0;
          }
          20% {
            opacity: 1;
            transform: translateY(-10px) scale(1.2);
          }
          80% {
            opacity: 1;
          }
          100% {
            transform: translateY(-80px) scale(1);
            opacity: 0;
          }
        }
        @keyframes orbitSparkle {
          0% {
            transform: rotate(0deg) translateX(40px) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: rotate(360deg) translateX(40px) rotate(-360deg);
            opacity: 0;
          }
        }
      `}</style>

      {/* Message Toast - portaled to body to escape clipPath containing block */}
      {message && createPortal(
        <div
          className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 shadow-lg text-center font-medium animate-fade-in ${
            message.type === "success"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
          style={{ clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}
        >
          {message.text}
        </div>,
        document.body
      )}

      <div className="flex flex-col md:flex-row gap-6">
        {/* Pet Avatar */}
        <div className="flex-1">
          <div
            className="bg-white p-4 text-center relative"
            style={{ clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)' }}
          >
            {/* Pet Status - top left */}

            
            {!(playAnimation && trainingVideoLoaded) && <div className="absolute top-2 left-2 z-20 space-y-1 w-32">
              <div className="flex items-center">
                {/* Icon overlapping the bar */}
                <img src={assetUrl('/image/dashboard/energy.svg')} alt="energy"
                  className="w-7 h-7 relative z-10 drop-shadow-lg" style={{ marginRight: '-16px' }}
                />
                {/* Bar track - pointed right end like game UI */}
                <div className="flex-1 relative h-2.5 overflow-hidden"
                  style={{
                    background: '#e5e7eb',
                    borderRadius: '2px 8px 8px 2px',
                   
                  }}
                >
                  {/* Fill bar */}
                  <div className="absolute inset-y-0 left-0"
                    style={{
                      width: `${userEnergy ?? 100}%`,
                      background: 'linear-gradient(180deg, #fde047 0%, #f59e0b 40%, #d97706 100%)',
                      boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.4)',
                      borderRadius: '1px 4px 4px 1px',
                    }}
                  />
                  {/* Shine highlight */}
                  <div className="absolute inset-x-0 top-0 h-[40%]"
                    style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)', borderRadius: '2px 8px 0 0' }}
                  />
                </div>
              </div>

              {(bonuses.length > 0 || itemBonuses.total > 0) && (
                <div className="relative mt-1">
                  <button
                    onClick={() => setShowBonuses(!showBonuses)}
                    className="w-8 h-8 hover:scale-110 transition-all"
                    title="View bonuses"
                  >
                    <img
                      src={assetUrl('/image/dashboard/pet-bonus.svg')}
                      alt="Pet bonuses"
                      className="w-full h-full object-contain drop-shadow-lg"
                    />
                  </button>

                  {showBonuses && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowBonuses(false)} />
                      <div className="absolute top-0 left-full ml-2 bg-white shadow-xl p-3 z-40 border-2 border-yellow-200 min-w-[200px]"
                        style={{ clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}
                      >
                        <div className="space-y-2">
                          {bonuses.map((bonus, idx) => (
                            <div key={idx}>
                              {bonus.breakdown && (<>
                                {bonus.breakdown.rarity > 0 && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600">Rarity ({activePet.rarity})</span>
                                    <span className="font-bold text-yellow-600">+{bonus.breakdown.rarity}%</span>
                                  </div>
                                )}
                                {bonus.breakdown.evolution > 0 && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600">Evolution Stg {activePet.evolution_stage}</span>
                                    <span className="font-bold text-purple-600">+{bonus.breakdown.evolution}%</span>
                                  </div>
                                )}
                              </>)}
                            </div>
                          ))}
                          {itemBonuses.items.map((item, idx) => (
                            <div key={`item-${idx}`} className="flex items-center justify-between text-xs">
                              <span className="text-gray-600">{item.name}</span>
                              <span className="font-bold text-blue-600">+{item.bonus}%</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between text-xs border-t border-gray-200 pt-1 mt-1">
                            <span className="font-bold text-gray-800">Total XP Bonus</span>
                            <span className="font-bold text-green-600">+{(bonuses.reduce((s, b) => s + (b.value || 0), 0)) + itemBonuses.total}%</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>}

            {/* Chat Bubble - absolute positioned */}
            {chatBubble && !(playAnimation && trainingVideoLoaded) && (
              <div className="absolute top-2 right-2 z-10">
                <div
                  className="relative bg-white rounded-[20px] px-4 py-2 shadow-lg max-w-[200px]"
                  style={{
                    border: "3px solid #4a5568",
                    boxShadow: "0 1px 0 #2d3748",
                  }}
                >
                  <p className="text-xs font-medium text-gray-800 text-center break-words whitespace-normal">
                    {chatBubble}
                  </p>
                  {/* Tail - pointing left toward pet */}
                  <div
                    className="absolute left-4 -bottom-3"
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: "10px solid transparent",
                      borderRight: "10px solid transparent",
                      borderTop: "12px solid #4a5568",
                    }}
                  />
                  <div
                    className="absolute left-4 -bottom-2"
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: "7px solid transparent",
                      borderRight: "7px solid transparent",
                      borderTop: "9px solid white",
                      marginLeft: "3px",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Flying Food Animation - outside overflow-hidden container */}
            {feedAnimation && (
              <>
                {/* Flying Food */}
                <div
                  className={`absolute z-20 text-4xl pointer-events-none ${
                    feedAnimation.phase === "flying"
                      ? "animate-fly-to-pet"
                      : "opacity-0"
                  }`}
                  style={{
                    animation:
                      feedAnimation.phase === "flying"
                        ? "flyToPet 0.7s ease-out forwards"
                        : "none",
                    bottom: "144px",
                    right: "24px",
                  }}
                >
                  {feedAnimation.food ? (
                    <img src={feedAnimation.food} alt="food" className="w-10 h-10 object-contain" />
                  ) : "🍖"}
                </div>

                {/* Particle Burst */}
                {feedAnimation.phase === "burst" && (
                  <>
                    {/* Feed glow is now inside the pet image container */}

                    <div
                      className="absolute z-20 pointer-events-none"
                      style={{ left: "50%", top: "120px" }}
                    >
                      {feedAnimation.particles.map((particle) => (
                        <div
                          key={particle.id}
                          className="absolute"
                          style={{
                            animation: `particle${particle.id} 1.2s ease-out forwards`,
                            marginLeft: "-12px",
                            marginTop: "-12px",
                          }}
                        >
                          {particle.image ? (
                            <img src={particle.image} alt="" className="w-6 h-6 object-contain" />
                          ) : "🍖"}
                        </div>
                      ))}
                    </div>

                    {/* Floating +Energy Text */}
                    <div
                      className="absolute z-20 pointer-events-none font-bold text-3xl"
                      style={{
                        left: "50%",
                        top: "120px",
                        marginLeft: "-60px",
                        width: "120px",
                        textAlign: "center",
                        animation: "floatUpXP 2s ease-out forwards",
                        color: "#f97316",
                        textShadow:
                          "0 0 10px rgba(249, 115, 22, 0.5), 2px 2px 4px rgba(0,0,0,0.3)",
                      }}
                    >
                      +{feedAnimation.energyGained} <img src={assetUrl('/image/dashboard/energy.svg')} alt="energy" className="inline w-5 h-5" />
                    </div>
                  </>
                )}
              </>
            )}

            {/* Play Animation - Floating XP */}
            {playAnimation && (
              <>
                {/* Floating +XP Text - appears after rotation ends */}
                <div
                  className="absolute z-30 pointer-events-none font-bold text-3xl"
                  style={{
                    left: "50%",
                    top: "120px",
                    marginLeft: "-50px",
                    width: "100px",
                    textAlign: "center",
                    animation: "floatUpXP 2s ease-out 4s forwards",
                    opacity: 0,
                    color: "#e7d214",
                    textShadow:
                      "0 0 10px rgba(208, 211, 17, 0.5), 2px 2px 4px rgba(0,0,0,0.3)",
                  }}
                >
                  +{playAnimation.xpGained} XP
                </div>
              </>
            )}

            {/* Pet Image */}
            <div
              ref={petContainerRef}
              className="w-48 h-48 mx-auto mb-4 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform relative"
              style={{ animation: 'petBob 2.5s ease-in-out infinite' }}
              onClick={() => setShowPetInfo(true)}
              title="Click to learn about the pet system"
            >
              {/* Aura Pulse Animation (hidden when training video is playing) */}
              {((playAnimation && !trainingVideoLoaded) || feedAnimation?.phase === "burst") && (
                <div
                  className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center"
                >
                  <div
                    className="w-full h-full rounded-full"
                    style={{
                      background: `radial-gradient(circle, ${
                        feedAnimation?.phase === "burst"
                          ? "rgba(249, 115, 22, 0.7), rgba(249, 115, 22, 0.3) 50%, transparent 70%"
                          : activePet.rarity === "legendary"
                            ? "rgba(250, 204, 21, 0.7), rgba(250, 204, 21, 0.3) 50%, transparent 70%"
                            : activePet.rarity === "epic"
                              ? "rgba(168, 85, 247, 0.7), rgba(168, 85, 247, 0.3) 50%, transparent 70%"
                              : activePet.rarity === "rare"
                                ? "rgba(59, 130, 246, 0.7), rgba(59, 130, 246, 0.3) 50%, transparent 70%"
                                : activePet.rarity === "uncommon"
                                  ? "rgba(34, 197, 94, 0.7), rgba(34, 197, 94, 0.3) 50%, transparent 70%"
                                  : "rgba(156, 163, 175, 0.7), rgba(156, 163, 175, 0.3) 50%, transparent 70%"
                      })`,
                      filter: "blur(15px)",
                      animation: "auraPulse 6s ease-in-out forwards",
                    }}
                  />
                </div>
              )}
              {/* Rotating background - always visible, hidden when training video is playing */}
              {!(playAnimation && trainingVideoLoaded) && !idleAnimation && (
                <div
                  className="absolute w-56 h-56 left-1/2 top-1/2 pointer-events-none"
                  style={{
                    animation: "spinBackground 20s linear infinite",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <img
                    src={getRarityAura(activePet.rarity)}
                    alt=""
                    className="w-full h-full object-contain opacity-80"
                  />
                </div>
              )}
              {activePet.image_url ? (
                <img
                  src={getPetImage()}
                  alt={activePet.name}
                  className="w-full h-full object-contain relative z-10"
                  onError={(e) => {
                    // Fallback to base stage image if mood variant doesn't exist
                    const baseImage = (() => {
                      if (
                        activePet.evolution_stages &&
                        activePet.evolution_stage > 0
                      ) {
                        const stage = activePet.evolution_stages.find(
                          (s) => s.stage === activePet.evolution_stage,
                        );
                        return stage?.image_url || activePet.image_url;
                      }
                      return activePet.image_url;
                    })();

                    if (e.target.src !== baseImage) {
                      e.target.src = baseImage;
                    }
                  }}
                />
              ) : (
                <span className="text-6xl relative z-10">
                  🐾
                </span>
              )}
              {/* Training video overlay - uses naming convention: base-training.mp4 */}
              {playAnimation && activePet.image_url && (
                <video
                  src={(() => {
                    // Use base image (not mood variant) to derive training video URL
                    let baseImage = activePet.image_url;
                    if (activePet.evolution_stages && activePet.evolution_stage > 0) {
                      const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
                      if (stage?.image_url) baseImage = stage.image_url;
                    }
                    return baseImage.replace(/\.([^.]+)$/, "-training.mp4");
                  })()}
                  autoPlay
                  playsInline
                  className="absolute inset-0 w-full h-full object-contain z-20"
                  onLoadedData={() => setTrainingVideoLoaded(true)}
                  onEnded={(e) => e.target.currentTime = 0}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    setTrainingVideoLoaded(false);
                  }}
                />
              )}
              {/* Idle animation video - uses naming convention: base-idle.mp4 */}
              {idleAnimation && activePet.image_url && (
                <video
                  src={(() => {
                    let baseImage = activePet.image_url;
                    if (activePet.evolution_stages && activePet.evolution_stage > 0) {
                      const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
                      if (stage?.image_url) baseImage = stage.image_url;
                    }
                    return baseImage.replace(/\.([^.]+)$/, "-idle.mp4");
                  })()}
                  autoPlay
                  playsInline
                  className="absolute inset-0 w-full h-full object-contain z-20"
                  onEnded={() => setIdleAnimation(false)}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    setIdleAnimation(false);
                  }}
                />
              )}
              {/* Transparent overlay to prevent right-click saving */}
              <div
                className="absolute inset-0 z-30"
                onContextMenu={(e) => e.preventDefault()}
                draggable={false}
              />
            </div>

            {/* Chat Button - Hidden
            <div className="absolute bottom-[272px] right-2 z-10">
              <button
                onClick={() => setShowChat(!showChat)}
                className="w-12 h-12 hover:scale-110 transition-all"
                title="Chat with pet"
              >
                <img
                  src={assetUrl('/image/dashboard/pet-chat.svg')}
                  alt="Chat with pet"
                  className="w-12 h-12 object-contain drop-shadow-lg"
                />
              </button>
            </div>
            */}

            {/* Train Button - Above Food Bowl */}
            {!profile?.is_banned && <div className="absolute bottom-52 right-2 z-10">
              <button
                onClick={handlePlay}
                disabled={playDisabled}
                className={`w-12 h-12 transition-all relative ${playDisabled ? 'cursor-not-allowed' : 'hover:scale-110'}`}
                title="Train pet"
              >
                <img
                  src={assetUrl('/image/dashboard/pet-train.svg')}
                  alt="Train pet"
                  className="w-full h-full object-contain drop-shadow-lg"
                />
                {playDisabled && playCooldown > 0 && (
                  <div className="absolute -inset-1 flex items-center justify-center rounded-full bg-black/50">
                    <svg className="absolute w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                      <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                      <circle
                        cx="28" cy="28" r="24" fill="none"
                        stroke="#f59e0b" strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 24}`}
                        strokeDashoffset={`${2 * Math.PI * 24 * (1 - playCooldown / 5)}`}
                        style={{ transition: 'stroke-dashoffset 1s linear' }}
                      />
                    </svg>
                    <span className="text-white font-bold text-base drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      {playCooldown}
                    </span>
                  </div>
                )}
                {pvpWaitingCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center animate-pulse shadow-lg">
                    {pvpWaitingCount}
                  </span>
                )}
              </button>
            </div>}

            {/* Food Bowl - Bottom Right */}
            <div className="absolute bottom-36 right-2 z-10">
              <div
                className="w-12 h-12 transition-all cursor-pointer hover:scale-110"
                title="Food bowl"
                onClick={() => setShowFeedMenu((v) => !v)}
              >
                <img
                  src={profile?.active_bowl_url ? (profile.active_bowl_url.startsWith('http') ? profile.active_bowl_url : assetUrl(profile.active_bowl_url)) : "https://bhlpjvcplrofixogcrqp.supabase.co/storage/v1/object/public/shop-assets/bowls/pet-bowl.png"}
                  alt="Food bowl"
                  className="w-full h-full object-contain drop-shadow-lg"
                />
              </div>

              {/* Feed Menu */}
              {showFeedMenu && (
                <>
                  {/* Overlay to close menu when clicking outside */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowFeedMenu(false)}
                  />
                  <div className="absolute bottom-full right-0 mb-2 bg-white shadow-xl p-4 z-20 border-2 border-orange-200 min-w-[200px]"
                    style={{ clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}
                  >

                  {petFoodItems.length === 0 ? (
                    <p className="text-xs text-gray-500 mb-2">
                      No pet food in inventory
                    </p>
                  ) : (
                    <div className="space-y-2 mb-2 max-h-40 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                      {petFoodItems.map((item) => {
                        const stats = getFoodStats(item.item.rarity);
                        return (
                          <button
                            key={item.item.id}
                            onClick={() => handleFeed(item.item.id)}
                            className="w-full text-left p-2 rounded hover:bg-orange-50 transition-colors flex items-center gap-2"
                          >
                            {item.item.image_url && (
                              <img src={item.item.image_url} alt={item.item.name} className="w-8 h-8 object-contain flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium truncate">
                                  {item.item.name}
                                </span>
                                <span className="text-xs text-gray-500 flex-shrink-0">
                                  x{item.quantity}
                                </span>
                              </div>
                              <div className="flex gap-3 mt-0.5 text-xs">
                                <span className="text-orange-600">
                                  <img src={assetUrl('/image/dashboard/energy.svg')} alt="energy" className="inline w-3.5 h-3.5 mr-0.5" />+{stats.energy}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                </>
              )}
            </div>

            {/* Wild Area Button - Bottom Left */}
            <div className="absolute bottom-36 left-2 z-10">
              <button
                onClick={() => setShowWildArea(true)}
                className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 hover:from-emerald-300 hover:to-green-500 shadow-lg hover:scale-110 transition-all flex items-center justify-center border-2 border-emerald-300"
                title="Wild Area - Search for wild pets"
              >
                <span className="text-2xl">🌿</span>
              </button>
            </div>

            <div className="flex flex-col items-center">
              <h2 className="text-2xl font-bold text-gray-800">
                {activePet.nickname || activePet.name}
              </h2>
              <span
                className={`px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider mt-1 ${getRarityColor(activePet.rarity)}`}
              >
                {getRarityStars(activePet.rarity)} {activePet.rarity}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {activePet.description}
            </p>

            {/* Level & Evolution Stage */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500" />
                <span className="font-bold text-lg">
                  Level {activePet.level}
                </span>
              </div>
              {activePet.evolution_stage > 0 && (
                <div className="flex items-center gap-1 bg-purple-100 px-3 py-1 border border-purple-200"
                  style={{ clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)' }}
                >
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-600">
                    Stage {activePet.evolution_stage}
                  </span>
                </div>
              )}
            </div>

            {/* XP Progress */}
            <div className="space-y-2">
              {(() => {
                const petLvl = getPetLevelFromXp(activePet.xp);
                return (
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Level Progress</span>
                      <span>{petLvl.xpInLevel} / {petLvl.xpForLevel} XP</span>
                    </div>
                    <div className="w-full bg-gray-200 h-2"
                      style={{ clipPath: 'polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)' }}
                    >
                      <div
                        className={`bg-gradient-to-r ${getRarityGradient(activePet.rarity)} h-2 transition-all`}
                        style={{ width: `${petLvl.progress}%` }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Evolution Progress */}
              {(() => {
                const nextEvolution = getNextEvolution();
                if (nextEvolution?.xp_required) {
                  const progress = Math.min(
                    100,
                    (activePet.xp / nextEvolution.xp_required) * 100,
                  );
                  return (
                    <div>
                      <div className="flex justify-between text-xs text-purple-600 mb-1">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Evolution Stage {nextEvolution.stage}
                        </span>

                      </div>
                      <div className="w-full bg-purple-100 h-2"
                        style={{ clipPath: 'polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)' }}
                      >
                        <div
                          className="bg-purple-500 h-2 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        </div>

        {/* Pet Actions */}
        <div className="flex-1 p-4 space-y-4">
          {/* Chat Panel */}
          {showChat && (
            <div className="bg-white p-4 border-2 border-pink-200"
              style={{ clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-pink-500" />
                  Chat with {activePet.nickname || activePet.name}
                </h3>
                <button
                  onClick={() => setShowChat(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Chat Messages */}
              <div
                ref={chatContainerRef}
                className="h-48 overflow-y-auto mb-3 space-y-2 p-2 bg-gray-50"
                style={{ clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}
              >
                {chatMessages.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-4">
                    Say hello to {activePet.nickname || activePet.name}!
                  </p>
                )}
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                        msg.role === "user"
                          ? "bg-blue-500 text-white rounded-br-none"
                          : "bg-pink-100 text-gray-800 rounded-bl-none"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-pink-100 text-gray-800 px-3 py-2 rounded-lg rounded-bl-none">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                    placeholder={
                      (userEnergy ?? 100) < 10
                        ? "Pet đang mệt..."
                        : `Message ${activePet.nickname || activePet.name}...`
                    }
                    className="flex-1 px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-pink-500 text-sm"
                    style={{ clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}
                    disabled={chatLoading || (userEnergy ?? 100) < 10}
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={
                      chatLoading ||
                      !chatInput.trim() ||
                      (userEnergy ?? 100) < 10
                    }
                    className="px-4 py-2 bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    style={{ clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)' }}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    <img src={assetUrl('/image/dashboard/energy.svg')} alt="energy" className="inline w-3.5 h-3.5 mr-0.5" />{userEnergy ?? 100}/100{" "}
                    {(userEnergy ?? 100) < 10 && "(Mệt rồi!)"}
                  </span>
                  <span>-5 energy/message</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pet Info Modal */}
      {showPetInfo && createPortal(
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={() => setShowPetInfo(false)}>
          <div
            className="relative bg-white border-2 border-blue-200 max-w-xl w-full max-h-[85vh] overflow-y-auto shadow-xl"
            style={{
              clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
              scrollbarWidth: 'none', msOverflowStyle: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Corner brackets */}
            <div className="absolute top-0 left-[12px] w-5 h-[1px] bg-gradient-to-r from-blue-300/40 to-transparent" />
            <div className="absolute top-0 left-[12px] w-[1px] h-5 bg-gradient-to-b from-blue-300/40 to-transparent" />
            <div className="absolute bottom-0 right-[12px] w-5 h-[1px] bg-gradient-to-l from-blue-300/40 to-transparent" />
            <div className="absolute bottom-0 right-[12px] w-[1px] h-5 bg-gradient-to-t from-blue-300/40 to-transparent" />

            {/* Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4 flex justify-between items-center"
              style={{ clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)' }}
            >
              <div>
                <h2 className="text-lg font-semibold tracking-wide uppercase">Pet System Guide</h2>
                <div className="h-[1px] w-20 bg-white/30 mt-1" />
              </div>
              <button
                onClick={() => setShowPetInfo(false)}
                className="text-white/80 hover:text-white hover:bg-white/20 p-1.5 transition-all"
                style={{ clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* How Pets Work */}
              <div className="relative bg-white border border-gray-200 p-4 shadow-sm overflow-hidden"
                style={{ clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}
              >
                <h3 className="text-sm font-semibold text-gray-800 mb-1.5 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  How Pets Work
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Pets are your learning companions that grow alongside you! Take care of them and they&apos;ll boost your XP earnings.
                </p>
              </div>

              {/* Evolution */}
              <div className="relative bg-white border border-purple-200 p-4 shadow-sm overflow-hidden"
                style={{ clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}
              >
                <h3 className="text-sm font-semibold text-purple-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-purple-100 flex items-center justify-center text-xs"
                    style={{ clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
                  >✨</span>
                  Evolution
                </h3>
                {activePet?.evolution_stages && activePet.evolution_stages.length > 0 ? (
                  <>
                    <p className="text-xs text-gray-500 mb-3">{activePet.nickname || activePet.name}&apos;s Evolution Path</p>
                    <div className="flex flex-wrap gap-2.5 justify-center">
                      {/* Base Stage */}
                      <div className={`relative bg-gray-50 p-2.5 border-2 flex flex-col items-center w-24 transition-all overflow-hidden ${
                        activePet.evolution_stage === 0 ? 'border-purple-400 shadow-md shadow-purple-100' : 'border-gray-200'
                      }`}
                        style={{ clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}
                      >
                        {(activePet.base_image_url || activePet.image_url) && (
                          <div className="relative w-14 h-14 mb-1.5">
                            <img src={activePet.base_image_url || activePet.image_url} alt="Base form" className="w-14 h-14 object-contain select-none pointer-events-none" onContextMenu={(e) => e.preventDefault()} draggable="false" />
                            <div className="absolute inset-0 bg-transparent" onContextMenu={(e) => e.preventDefault()} />
                          </div>
                        )}
                        <span className="font-semibold text-gray-700 text-[10px]">Base</span>
                        {activePet.evolution_stage === 0 && (
                          <span className="text-[9px] bg-purple-500 text-white px-1.5 py-0.5 mt-1 font-medium"
                            style={{ clipPath: 'polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)' }}
                          >Current</span>
                        )}
                      </div>

                      {activePet.evolution_stages.map((stage) => {
                        const isCurrent = activePet.evolution_stage === stage.stage;
                        const isUnlocked = activePet.evolution_stage >= stage.stage;
                        const isLocked = !isUnlocked;
                        return (
                          <div key={stage.stage} className={`relative bg-gray-50 p-2.5 border-2 flex flex-col items-center w-24 transition-all overflow-hidden ${
                            isCurrent ? 'border-purple-400 shadow-md shadow-purple-100' : isUnlocked ? 'border-green-300' : 'border-gray-200 opacity-75'
                          }`}
                            style={{ clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}
                          >
                            {stage.image_url && (
                              <div className="relative w-14 h-14 mb-1.5">
                                <img src={stage.image_url} alt={stage.name || `Stage ${stage.stage}`} className={`w-14 h-14 object-contain select-none pointer-events-none ${isLocked ? 'filter brightness-[0.2] contrast-[150%]' : ''}`} onContextMenu={(e) => e.preventDefault()} draggable="false" />
                                <div className="absolute inset-0 bg-transparent" onContextMenu={(e) => e.preventDefault()} />
                              </div>
                            )}
                            <span className={`font-semibold text-[10px] text-center ${isLocked ? 'text-gray-400' : 'text-gray-700'}`}>
                              {isLocked ? '???' : stage.name || `Stage ${stage.stage}`}
                            </span>
                            {stage.xp_required && (
                              <p className="text-[9px] text-gray-400 mt-0.5">{stage.xp_required} XP</p>
                            )}
                            {isCurrent && (
                              <span className="text-[9px] bg-purple-500 text-white px-1.5 py-0.5 mt-1 font-medium"
                                style={{ clipPath: 'polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)' }}
                              >Current</span>
                            )}
                            {isUnlocked && !isCurrent && (
                              <span className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 mt-1 font-medium"
                                style={{ clipPath: 'polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)' }}
                              >Unlocked</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Progress bar + Evolve button */}
                    {(() => {
                      const nextStage = activePet.evolution_stages.find((s) => s.stage === activePet.evolution_stage + 1);
                      if (nextStage?.xp_required) {
                        const progress = Math.min(100, (activePet.xp / nextStage.xp_required) * 100);
                        const xpReady = activePet.xp >= nextStage.xp_required;
                        const fruit = getEvolutionFruit();
                        return (
                          <div className="mt-3 bg-gray-50 p-3"
                            style={{ clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}
                          >
                            <div className="flex justify-between text-[10px] text-gray-500 mb-1.5 font-medium">
                              <span>Next Evolution</span>
                              <span>{activePet.xp} / {nextStage.xp_required} XP</span>
                            </div>
                            <div className="w-full bg-gray-200 h-2 overflow-hidden"
                              style={{ clipPath: 'polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)' }}
                            >
                              <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 transition-all duration-500" style={{ width: `${progress}%` }} />
                            </div>
                            {xpReady ? (
                              <div className="mt-2.5">
                                {fruit ? (
                                  <button
                                    onClick={handleEvolve}
                                    disabled={evolving}
                                    className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold hover:from-purple-600 hover:to-pink-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                    style={{ clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}
                                  >
                                    {evolving ? 'Evolving...' : (
                                      <>
                                        <span>✨</span>
                                        Evolve Now
                                        {fruit.item?.image_url && <img src={fruit.item.image_url} alt="" className="w-4 h-4 object-contain" />}
                                        <span className="opacity-70">x1</span>
                                      </>
                                    )}
                                  </button>
                                ) : (
                                  <p className="text-[10px] text-center text-orange-500 font-medium">
                                    XP ready! You need a {activePet.rarity} Evolution Potion to evolve.
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="mt-2 text-[10px] text-center text-purple-500 font-medium">
                                🧪 Your pet needs a {activePet.rarity} Evolution Potion to evolve!
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </>
                ) : (
                  <p className="text-sm text-gray-500 bg-gray-50 p-3"
                    style={{ clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}
                  >
                    This pet doesn&apos;t have evolution stages, but it&apos;s still a great companion!
                  </p>
                )}
              </div>

              {/* Bonuses */}
              <div className="relative bg-white border border-yellow-200 p-4 shadow-sm overflow-hidden"
                style={{ clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}
              >
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-yellow-100 flex items-center justify-center text-xs"
                    style={{ clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
                  >⭐</span>
                  XP Bonuses
                </h3>
                <div className="grid grid-cols-5 gap-1.5 text-xs mb-2.5">
                  {[
                    { label: 'Common', bonus: '+5%', bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
                    { label: 'Uncommon', bonus: '+10%', bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
                    { label: 'Rare', bonus: '+15%', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
                    { label: 'Epic', bonus: '+20%', bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
                    { label: 'Legendary', bonus: '+25%', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
                  ].map(({ label, bonus, bg, text, border }) => (
                    <div key={label} className={`${bg} border ${border} px-1.5 py-2 text-center`}
                      style={{ clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
                    >
                      <div className="text-gray-500 text-[10px]">{label}</div>
                      <div className={`font-semibold ${text}`}>{bonus}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-purple-50 border border-purple-100 px-3 py-2.5"
                  style={{ clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-purple-800 text-xs">Evolution Bonus</span>
                    <span className="font-semibold text-purple-600 text-xs">+5% per stage</span>
                  </div>
                  <div className="text-[10px] text-purple-400 mt-1">
                    Stage 0: +0% &bull; Stage 1: +5% &bull; Stage 2: +10% &bull; Stage 3: +15%
                  </div>
                </div>
              </div>

              {/* Energy */}
              <div className="relative bg-white border border-orange-200 p-4 shadow-sm overflow-hidden"
                style={{ clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}
              >
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <img src={assetUrl('/image/dashboard/energy.svg')} alt="energy" className="w-5 h-5" />
                  Energy System
                </h3>
                <div className="space-y-1.5 text-xs">
                  {[
                    { action: 'Training', cost: '-10 energy' },
                    { action: 'Ask pet (in exercises)', cost: '-5 energy' },
                    { action: 'Chat message', cost: '-5 energy' },
                  ].map(({ action, cost }) => (
                    <div key={action} className="flex justify-between items-center bg-gray-50 px-3 py-2"
                      style={{ clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)' }}
                    >
                      <span className="text-gray-600">{action}</span>
                      <span className="font-semibold text-orange-500 text-[11px]">{cost}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-orange-50 border border-orange-100 px-3 py-2.5 mt-2.5 flex items-center justify-between"
                  style={{ clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}
                >
                  <span className="font-semibold text-orange-800 text-xs">Auto Regen</span>
                  <span className="font-semibold text-orange-600 text-xs">+100 every day</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-2 text-center">
                  Feed your pet to restore energy instantly!
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white/80 backdrop-blur-sm p-4 border-t border-gray-100">
              <button
                onClick={() => { setShowPetInfo(false); setIdleAnimation(true); }}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-2.5 transition-all text-sm shadow-md"
                style={{ clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}
              >
                Got it!
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Game Picker Modal */}
      {showGame === 'picker' && createPortal(
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 px-4"
          onClick={() => setShowGame(null)}
        >
          <div className={`relative bg-white border-2 border-blue-200 shadow-xl w-full p-6 text-center overflow-hidden ${isStaff() ? 'max-w-2xl' : 'max-w-sm'}`}
            style={{ clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Corner brackets */}
            <div className="absolute top-0 left-[12px] w-5 h-[1px] bg-gradient-to-r from-blue-300/40 to-transparent" />
            <div className="absolute top-0 left-[12px] w-[1px] h-5 bg-gradient-to-b from-blue-300/40 to-transparent" />
            <div className="absolute bottom-0 right-[12px] w-5 h-[1px] bg-gradient-to-l from-blue-300/40 to-transparent" />
            <div className="absolute bottom-0 right-[12px] w-[1px] h-5 bg-gradient-to-t from-blue-300/40 to-transparent" />

            <h3 className="text-xl font-semibold text-gray-800 mb-1 uppercase tracking-wide">Choose Training Game</h3>
            <div className="h-[2px] w-24 bg-gradient-to-r from-transparent via-blue-400 to-transparent mx-auto mb-1" />
            {trainingBlocked ? (
              <div className="py-8">
                <div className="text-5xl mb-3">🚫</div>
                <p className="text-base font-semibold text-gray-700 mb-1">Training Unavailable</p>
                <p className="text-sm text-gray-500 mb-4">{trainingBlockedReason}</p>
                <button
                  onClick={() => setShowGame(null)}
                  className="px-6 py-2 bg-gray-100 text-gray-600 font-medium hover:bg-gray-200 transition"
                  style={{ clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}
                >
                  OK
                </button>
              </div>
            ) : (
            <>
            <p className="text-sm text-gray-500 mb-5">Earn +5 <img src={assetUrl('/image/study/xp.png')} alt="XP" className="w-4 h-4 inline" /> on success!</p>
            <style>{`.game-grid > button { clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }`}</style>
            <div className={`game-grid grid gap-3 ${isStaff() ? 'grid-cols-3 md:grid-cols-4' : 'grid-cols-2'}`}>
              {(isStaff() || enabledGames.includes('scramble')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('scramble'); fetchGameLeaderboard('scramble'); setShowGame('scramble'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'scramble' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-purple-200 hover:border-purple-400 hover:bg-purple-50'}`}
              >
                {competitionGame === 'scramble' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/image/dashboard/pet-scramble.jpg')} alt="Word Scramble" className="w-20 h-20 object-cover rounded-lg group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Word Scramble</span>
              </button>
              )}
              {(isStaff() || enabledGames.includes('whackmole')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('whackmole'); fetchGameLeaderboard('whackmole'); setShowGame('whackmole'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'whackmole' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-green-200 hover:border-green-400 hover:bg-green-50'}`}
              >
                {competitionGame === 'whackmole' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/pet-game/whack/mole-normal.png')} alt="Whack-a-Mole" className="w-20 h-20 object-contain group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Whack-a-Mole</span>
              </button>
              )}
              {(isStaff() || enabledGames.includes('astroblast')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('astroblast'); fetchGameLeaderboard('astroblast'); setShowGame('astroblast'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'astroblast' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-red-200 hover:border-red-400 hover:bg-red-50'}`}
              >
                {competitionGame === 'astroblast' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/image/inventory/spaceships/phantom-voyager.png')} alt="Astro Blast" className="w-20 h-20 object-contain group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Astro Blast</span>
              </button>
              )}
              {(isStaff() || enabledGames.includes('flappy')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('flappy'); fetchGameLeaderboard('flappy'); setShowGame('flappy'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'flappy' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-sky-200 hover:border-sky-400 hover:bg-sky-50'}`}
              >
                {competitionGame === 'flappy' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/image/dashboard/flap.png')} alt="Flappy Pet" className="w-20 h-20 object-contain group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Flappy Pet</span>
              </button>
              )}
              {(isStaff() || enabledGames.includes('matchgame')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('matchgame'); fetchGameLeaderboard('matchgame'); setShowGame('matchgame'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'matchgame' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50'}`}
              >
                {competitionGame === 'matchgame' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/image/dashboard/match1.png')} alt="Match Up" className="w-20 h-20 object-contain group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Match Up</span>
              </button>
              )}
              {(isStaff() || enabledGames.includes('wordtype')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('wordtype'); fetchGameLeaderboard('wordtype'); setShowGame('wordtype'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'wordtype' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50'}`}
              >
                {competitionGame === 'wordtype' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/image/dashboard/pet-type.webp')} alt="Word Type" className="w-20 h-20 object-cover rounded-lg group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Word Type</span>
              </button>
              )}
              {(isStaff() || enabledGames.includes('bombparty')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('bombparty'); fetchGameLeaderboard('bombparty'); setShowGame('bombparty'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'bombparty' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-purple-200 hover:border-purple-400 hover:bg-purple-50'}`}
              >
                {competitionGame === 'bombparty' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/pet-game/bomb/bomb.png')} alt="Bomb Defuse" className="w-20 h-20 object-contain group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Bomb Defuse</span>
              </button>
              )}
              {/* Say It Right is hidden from the training picker. The game itself
                  is still wired up (PvP, leaderboards, admin toggle) — only this
                  entry point is removed. */}
              {(isStaff() || enabledGames.includes('quizrush')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('quizrush'); fetchGameLeaderboard('quizrush'); setShowGame('quizrush'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'quizrush' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-violet-200 hover:border-violet-400 hover:bg-violet-50'}`}
              >
                {competitionGame === 'quizrush' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/pet-display/game-logo/quiz.png')} alt="Quiz Rush" className="w-20 h-20 object-contain rounded-lg group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Quiz Rush</span>
              </button>
              )}
              {(isStaff() || enabledGames.includes('bossbattle')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('bossbattle'); fetchGameLeaderboard('bossbattle'); setShowGame('bossbattle'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'bossbattle' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-red-200 hover:border-red-400 hover:bg-red-50'}`}
              >
                {competitionGame === 'bossbattle' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/pet-game/boss/boss1.png')} alt="Boss Battle" className="w-20 h-20 object-contain group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Boss Battle</span>
              </button>
              )}

              {(isStaff() || enabledGames.includes('angrypet')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('angrypet'); fetchGameLeaderboard('angrypet'); setShowGame('angrypet'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'angrypet' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-orange-200 hover:border-orange-400 hover:bg-orange-50'}`}
              >
                {competitionGame === 'angrypet' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/pet-game/angry/Slingshot.png')} alt="Angry Pet" className="w-20 h-20 object-contain group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Angry Pet</span>
              </button>
              )}

              {(isStaff() || enabledGames.includes('catch')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('catch'); setShowGame('catch'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'catch' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-teal-200 hover:border-teal-400 hover:bg-teal-50'}`}
              >
                {competitionGame === 'catch' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/image/pet/catch-game.png')} alt="Hungry Pet" className="w-20 h-20 object-contain group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Hungry Pet</span>
              </button>
              )}

              {(isStaff() || enabledGames.includes('fishing')) && (
              <button
                onClick={() => { drainPetEnergy(10); recordAttemptStart('fishing'); fetchGameLeaderboard('fishing'); setShowGame('fishing'); }}
                className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all group overflow-hidden ${competitionGame === 'fishing' ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50'}`}
              >
                {competitionGame === 'fishing' && <span className="absolute -top-2 -right-2 text-lg">🏆</span>}
                <img src={assetUrl('/pet-display/game-logo/fish.png')} alt="Fishing Frenzy" className="w-20 h-20 object-contain rounded-lg group-hover:scale-110 transition-transform" />
                <span className="font-bold text-gray-800 text-xs">Fishing Frenzy</span>
              </button>
              )}

              <button
                onClick={() => setShowGame('quickmatch')}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-purple-200 hover:border-purple-400 hover:bg-purple-50 transition-all group ${isStaff() ? 'col-span-full' : 'col-span-2'}`}
              >
                <img src={assetUrl('/icon/dashboard/pvp.png')} alt="PvP" className="w-12 h-12 object-contain group-hover:scale-110 transition-transform" />
                <div className="flex items-center gap-1">
                  <span className="font-bold text-purple-700 text-xs">Quick Match</span>
                  <span className="text-[10px] bg-purple-500 text-white px-1.5 py-0.5 rounded font-bold">LIVE</span>
                </div>
                {pvpWaitingCount > 0 && (
                  <span className="text-[11px] text-purple-500 font-semibold animate-pulse">{pvpWaitingCount} waiting</span>
                )}
              </button>

            </div>
            <button
              onClick={() => setShowGame(null)}
              className="mt-4 px-6 py-1.5 text-sm text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 transition-colors font-medium tracking-wide"
              style={{ clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)' }}
            >
              Cancel
            </button>
            </>
            )}
          </div>

        </div>,
        document.body
      )}

      {/* Quick Match */}
      {showGame === 'quickmatch' && (
        <PvPMatchmaking onClose={() => setShowGame(null)} wordBank={wordBank} />
      )}

      {/* Fishing Mini-Game */}
      {showGame === 'fishing' && (
        <PetFishingGame
          petImageUrl={(() => {
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          wordBank={wordBank}
          leaderboard={gameLeaderboards.fishing}
          chestEnabled={chestEnabled}
          boatSkinUrl={profile?.active_boat_url}
          currentLevel={profile?.current_level || 1}
          onGameEnd={(score, extra) => handleGameEnd(score, 'fishing', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Catch Mini-Game */}
      {showGame === 'catch' && (
        <PetCatchGame
          petImageUrl={(() => {
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          questionBank={questionBank}
          chestEnabled={chestEnabled}
          currentLevel={profile?.current_level || 1}
          onGameEnd={(score, extra) => handleGameEnd(score, 'catch', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Flappy Pet Mini-Game */}
      {showGame === 'flappy' && (
        <PetFlappyGame
          petImageUrl={(() => {
            // Use base image (not mood variant) for the game so it always loads
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          wordBank={wordBank}
          leaderboard={gameLeaderboards.flappy || []}
          chestEnabled={chestEnabled}
          currentLevel={profile?.current_level || 1}
          onGameEnd={(score, extra) => handleGameEnd(score, 'flappy', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Word Scramble Mini-Game */}
      {showGame === 'scramble' && (
        <PetWordScramble
          petImageUrl={(() => {
            // Use base image (not mood variant) for the game so it always loads
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          wordBank={wordBank}
          currentLevel={profile?.current_level || 1}
          leaderboard={gameLeaderboards.scramble}
          chestEnabled={chestEnabled}
          onGameEnd={(score, extra) => handleGameEnd(score, 'scramble', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Whack-a-Mole Mini-Game */}
      {showGame === 'whackmole' && (
        <PetWhackMole
          petImageUrl={(() => {
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          hammerSkinUrl={profile?.active_hammer_url}
          leaderboard={gameLeaderboards.whackmole}
          wordBank={wordBank}
          chestEnabled={chestEnabled}
          currentLevel={profile?.current_level || 1}
          onGameEnd={(score, extra) => handleGameEnd(score, 'whackmole', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Astro Blast Mini-Game */}
      {showGame === 'astroblast' && (
        <PetAstroBlast
          petImageUrl={(() => {
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          shipSkinUrl={profile?.active_spaceship_url}
          shipLaserColor={profile?.active_spaceship_laser}
          asteroidSkinUrls={[
            assetUrl('/pet-game/astro/alien1.png'),
            assetUrl('/pet-game/astro/alien2.png'),
            assetUrl('/pet-game/astro/alien3.png'),
            assetUrl('/pet-game/astro/alien4.png'),
            assetUrl('/pet-game/astro/alien5.png'),
            assetUrl('/pet-game/astro/alien6.png')
          ]}
          wordBank={wordBank}
          leaderboard={gameLeaderboards.astroblast}
          chestEnabled={chestEnabled}
          currentLevel={profile?.current_level || 1}
          onGameEnd={(score, extra) => handleGameEnd(score, 'astroblast', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Match Up Mini-Game */}
      {showGame === 'matchgame' && (
        <PetMatchGame
          petImageUrl={(() => {
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          wordBank={wordBank}
          leaderboard={gameLeaderboards.matchgame}
          chestEnabled={chestEnabled}
          currentLevel={profile?.current_level || 1}
          onGameEnd={(score, extra) => handleGameEnd(score, 'matchgame', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Word Type Mini-Game */}
      {showGame === 'wordtype' && (
        <PetWordType
          petImageUrl={(() => {
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          wordBank={wordBank}
          currentLevel={profile?.current_level || 1}
          leaderboard={gameLeaderboards.wordtype}
          chestEnabled={chestEnabled}
          onGameEnd={(score, extra) => handleGameEnd(score, 'wordtype', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Bomb Defuse Mini-Game */}
      {showGame === 'bombparty' && (
        <PetBombParty
          petImageUrl={(() => {
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          wordBank={wordBank}
          currentLevel={profile?.current_level || 1}
          leaderboard={gameLeaderboards.bombparty}
          onGameEnd={(score, extra) => handleGameEnd(score, 'bombparty', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Say It Right Mini-Game */}
      {showGame === 'sayitright' && (
        <PetSayItRight
          petImageUrl={(() => {
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          wordBank={wordBank}
          leaderboard={gameLeaderboards.sayitright}
          chestEnabled={chestEnabled}
          onGameEnd={(score, extra) => handleGameEnd(score, 'sayitright', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Quiz Rush Mini-Game */}
      {showGame === 'quizrush' && (
        <PetQuizRush
          petImageUrl={(() => {
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          questionBank={questionBank}
          leaderboard={gameLeaderboards.quizrush}
          chestEnabled={chestEnabled}
          onGameEnd={(score, extra) => handleGameEnd(score, 'quizrush', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Boss Battle Mini-Game */}
      {showGame === 'bossbattle' && (
        <PetQuizBossBattle
          petImageUrl={(() => {
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          questionBank={questionBank}
          leaderboard={gameLeaderboards.bossbattle}
          chestEnabled={chestEnabled}
          onGameEnd={(score, extra) => handleGameEnd(score, 'bossbattle', extra)}
          onClose={() => setShowGame(null)}
        />
      )}

      {/* Angry Pet Mini-Game */}
      {showGame === 'angrypet' && (
        <PetAngryPet
          petImageUrl={(() => {
            let baseImage = activePet.image_url;
            if (activePet.evolution_stages && activePet.evolution_stage > 0) {
              const stage = activePet.evolution_stages.find(s => s.stage === activePet.evolution_stage);
              if (stage?.image_url) baseImage = stage.image_url;
            }
            return baseImage;
          })()}
          petName={activePet.nickname || activePet.name}
          questionBank={questionBank}
          leaderboard={gameLeaderboards.angrypet}
          chestEnabled={chestEnabled}
          currentLevel={profile?.current_level || 1}
          onGameEnd={(score, extra) => handleGameEnd(score, 'angrypet', extra)}
          onClose={() => setShowGame(null)}
        />
      )}
      {/* Evolution Overlay */}
      {evolutionOverlay && (
        <PetEvolutionOverlay
          oldImage={evolutionOverlay.oldImage}
          newImage={evolutionOverlay.newImage}
          petName={evolutionOverlay.petName}
          newStageName={evolutionOverlay.newStageName}
          onComplete={() => setEvolutionOverlay(null)}
        />
      )}

      {/* Wild Area Overlay - portaled to body to escape clipPath containing block */}
      {showWildArea && createPortal(
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40 p-4">
          <div className="relative bg-gradient-to-b from-emerald-900 to-green-950 rounded-2xl max-w-sm w-full p-6 border border-emerald-700 shadow-2xl">
            {/* Close button */}
            <button
              onClick={() => setShowWildArea(false)}
              className="absolute top-3 right-3 text-emerald-300 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center">
              <span className="text-4xl mb-2 block">🌿</span>
              <h2 className="text-emerald-100 text-xl font-bold">Wild Area</h2>
              <p className="text-emerald-300/70 text-sm mt-1">Search for wild pets hiding in the wild!</p>

              {/* Ticket count */}
              <div className="mt-3 flex items-center justify-center gap-1.5 text-emerald-300">
                <span className="text-lg">🎟️</span>
                <span className="text-sm font-medium">{isAdmin() ? '∞' : adventureTicketCount} ticket{adventureTicketCount !== 1 ? 's' : ''}</span>
              </div>

              <div className="mt-4">
                {mazeBlocked && !isAdmin() ? (
                  <div>
                    <p className="text-red-400 text-sm font-medium">{mazeBlockedReason}</p>
                  </div>
                ) : wildAreaCooldown > 0 ? (
                  <div>
                    <div className="text-emerald-400 text-3xl font-mono font-bold">
                      {Math.floor(wildAreaCooldown / 60)}:{String(wildAreaCooldown % 60).padStart(2, '0')}
                    </div>
                    <p className="text-emerald-500 text-xs mt-2">Next search available soon...</p>
                  </div>
                ) : !isAdmin() && adventureTicketCount < 1 ? (
                  <div>
                    <p className="text-emerald-400/70 text-sm">You need an Adventure Ticket to search!</p>
                    <p className="text-emerald-500/50 text-xs mt-1">Buy tickets from the Shop!</p>
                  </div>
                ) : (
                  <button
                    onClick={handleWildAreaSearch}
                    disabled={wildAreaLoading}
                    className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {wildAreaLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Searching...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">🎟️ Search for Wild Pet</span>
                    )}
                  </button>
                )}
              </div>

              {/* Admin: Skip maze, go straight to encounter */}
              {isAdmin() && (
                <button
                  onClick={async () => {
                    setWildAreaLoading(true)
                    const result = await rollWildAreaEncounter()
                    setWildAreaLoading(false)
                    if (result?.encountered) {
                      fetchInventory()
                      setShowWildArea(false)
                      setEncounterPetAfterMaze(result.pet)
                    } else {
                      setMessage({ type: 'info', text: 'No wild pets found... try again!' })
                    }
                  }}
                  disabled={wildAreaLoading}
                  className="mt-3 px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-medium text-sm rounded-lg shadow hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                >
                  {wildAreaLoading ? 'Searching...' : 'Skip Maze (Admin)'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Maze Adventure */}
      {mazeAdventure && (
        <PetMazeAdventure
          mode={mazeAdventure.mode}
          encounterPet={mazeAdventure.pet}
          rarity={mazeAdventure.rarity}
          activePet={activePet}
          wordBank={wordBank}
          questionBank={questionBank}
          currentLevel={profile?.current_level || 1}
          chestEnabled={chestEnabled}
          profile={profile}
          onGameEnd={(score, gameType, extra) => handleGameEnd(score, gameType, extra)}
          onMazeComplete={() => {
            if (mazeAdventure.mode === 'encounter' && mazeAdventure.pet) {
              setEncounterPetAfterMaze(mazeAdventure.pet)
            }
            setMazeAdventure(null)
          }}
          onClose={() => { setMazeAdventure(null); clearEncounter(); }}
        />
      )}

      {/* Wild Encounter Modal — from direct encounter or after maze adventure */}
      {(pendingEncounter || encounterPetAfterMaze) && (
        <WildEncounterModal
          pet={pendingEncounter || encounterPetAfterMaze}
          onClose={() => {
            clearEncounter()
            setEncounterPetAfterMaze(null)
            setShowWildArea(false)
          }}
          onCatchComplete={() => {
            clearEncounter()
            setEncounterPetAfterMaze(null)
            setShowWildArea(false)
          }}
        />
      )}
    </div>
  );
};

const PetEvolutionOverlay = ({ oldImage, newImage, petName, newStageName, onComplete }) => {
  const [phase, setPhase] = useState('start') // start | glow | flash | reveal | done
  const audioRef = useRef(null)

  useEffect(() => {
    // Try to play evolution sound
    try {
      audioRef.current = new Audio(assetUrl('/sound/evolve.mp3'))
      audioRef.current.volume = 0.6
      audioRef.current.play().catch(() => {})
    } catch {}

    const timers = [
      setTimeout(() => setPhase('glow'), 800),
      setTimeout(() => setPhase('flash'), 3000),
      setTimeout(() => setPhase('reveal'), 3500),
      setTimeout(() => setPhase('done'), 5000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center" onClick={phase === 'done' ? onComplete : undefined}>
      {/* Background */}
      <div className={`absolute inset-0 transition-all duration-1000 ${
        phase === 'flash' ? 'bg-white' :
        phase === 'reveal' || phase === 'done' ? 'bg-black/80 backdrop-blur-sm' :
        'bg-black/90'
      }`} />

      <div className="relative z-10 flex flex-col items-center">
        {/* Title */}
        {(phase === 'start' || phase === 'glow') && (
          <p className="text-white text-lg font-bold mb-6 animate-pulse tracking-wider">
            What&apos;s happening...?
          </p>
        )}

        {/* Pet image container */}
        <div className="relative w-48 h-48 flex items-center justify-center">
          {/* Glow ring */}
          {phase === 'glow' && (
            <div className="absolute inset-0 rounded-full animate-ping opacity-30"
              style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)' }} />
          )}
          {(phase === 'glow') && (
            <div className="absolute inset-[-20px] rounded-full animate-spin"
              style={{
                background: 'conic-gradient(from 0deg, transparent, #a855f7, #ec4899, #a855f7, transparent)',
                opacity: 0.5,
                animationDuration: '2s',
              }} />
          )}

          {/* Old form (visible during start + glow, shaking during glow) */}
          {(phase === 'start' || phase === 'glow') && (
            <img
              src={oldImage}
              alt={petName}
              className={`w-40 h-40 object-contain relative z-10 select-none pointer-events-none ${
                phase === 'glow' ? 'animate-[shake_0.15s_infinite]' : ''
              }`}
              style={phase === 'glow' ? {
                filter: 'brightness(1.5) drop-shadow(0 0 20px #a855f7)',
              } : {}}
            />
          )}

          {/* Flash (white screen covers everything) */}
          {phase === 'flash' && (
            <div className="w-40 h-40 rounded-full bg-white animate-pulse" />
          )}

          {/* New form reveal */}
          {(phase === 'reveal' || phase === 'done') && (
            <img
              src={newImage}
              alt={petName}
              className="w-40 h-40 object-contain relative z-10 select-none pointer-events-none animate-[fadeScaleIn_0.8s_ease-out]"
              style={{ filter: 'drop-shadow(0 0 30px #a855f7)' }}
            />
          )}
        </div>

        {/* Sparkle particles during reveal */}
        {(phase === 'reveal' || phase === 'done') && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-[sparkleFloat_2s_ease-out_forwards]"
                style={{
                  left: `${50 + (Math.random() - 0.5) * 60}%`,
                  top: `${50 + (Math.random() - 0.5) * 60}%`,
                  background: ['#a855f7', '#ec4899', '#f59e0b', '#ffffff'][i % 4],
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* New stage name */}
        {(phase === 'reveal' || phase === 'done') && (
          <div className="mt-6 text-center animate-[fadeScaleIn_0.5s_ease-out_0.3s_both]">
            <p className="text-purple-300 text-sm font-medium mb-1">{petName} evolved into</p>
            <p className="text-white text-2xl font-black tracking-wide">{newStageName}</p>
          </div>
        )}

        {/* Tap to close */}
        {phase === 'done' && (
          <button
            onClick={onComplete}
            className="mt-8 px-6 py-2 rounded-full bg-purple-500/30 text-purple-200 text-sm font-medium border border-purple-400/30 hover:bg-purple-500/50 transition animate-pulse"
          >
            Tap to continue
          </button>
        )}
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px) rotate(-2deg); }
          75% { transform: translateX(4px) rotate(2deg); }
        }
        @keyframes fadeScaleIn {
          0% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes sparkleFloat {
          0% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0) translateY(-60px); }
        }
      `}</style>
    </div>,
    document.body
  )
}

export default PetDisplay;