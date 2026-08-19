import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Volume2, RotateCcw } from 'lucide-react';
import Button from '../ui/Button';

const RecordingInterface = ({ sentence, targetText, onNext, onScoreUpdate, onAudioRecorded, onResult, onRecordingStart, onRecordingStop, hideSentence = false, embedded = false, hideAccuracy = false }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [transcription, setTranscription] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('idle');
  
  const mediaRecorderRef = useRef(null);
  const audioRef = useRef(null);
  const recognitionRef = useRef(null);
  const chunksRef = useRef([]);
  const finalTranscriptRef = useRef(''); // Store accumulated final transcript

  const isIOS = typeof navigator !== 'undefined' && (
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || 
     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
     /CriOS|FxiOS|OPiOS|mercury/.test(navigator.userAgent))
  );

  // Setup speech recognition on mount, but don't check mic permissions
  useEffect(() => {
    // iOS-specific: Delay speech recognition setup to avoid permission prompts
    if (isIOS) {
      // Don't setup speech recognition immediately on iOS
      console.log('📱 RecordingInterface mounted on iOS - speech recognition setup delayed');
      
      // Add user interaction listener for better permission handling
      const handleUserInteraction = () => {
        console.log('📱 iOS user interaction detected - setting up speech recognition');
        setupSpeechRecognition();
        // Remove listener after first interaction
        document.removeEventListener('touchstart', handleUserInteraction);
        document.removeEventListener('click', handleUserInteraction);
      };
      
      document.addEventListener('touchstart', handleUserInteraction, { once: true });
      document.addEventListener('click', handleUserInteraction, { once: true });
    } else {
      // On other platforms, setup immediately
    setupSpeechRecognition();
      console.log('📱 RecordingInterface mounted - speech recognition setup immediately');
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isIOS]);

  const checkMicrophonePermission = async () => {
    try {
      // First check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('Media devices not supported in this browser');
        setPermissionStatus('not-supported');
        return;
      }

      // For iOS: DO NOT use permissions.query as it can trigger permission prompts
      // Simply set to idle and let the user initiate recording to request permissions
      setPermissionStatus('idle');
      console.log('✅ Media devices supported, ready to record (no permission check to avoid iOS prompt)');
    } catch (error) {
      console.error('Microphone permission error:', error);
      setPermissionStatus('error');
    }
  };

  const setupSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      // Mobile-specific settings for better stability
      if (isIOS || /Android/i.test(navigator.userAgent)) {
        recognitionRef.current.continuous = false; // Mobile works better with shorter sessions
      } else {
        recognitionRef.current.continuous = true;  // Desktop can handle continuous
      }
      recognitionRef.current.interimResults = true;  // Show interim results
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onresult = (event) => {
        let newFinalTranscript = '';
        let interimTranscript = '';
        
        // Process only the new results (from resultIndex onwards)
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            newFinalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        // Accumulate final transcripts (don't overwrite)
        if (newFinalTranscript.trim()) {
          finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + newFinalTranscript.trim();
          console.log('Accumulated final transcript:', finalTranscriptRef.current);
        }
        
        // Display accumulated final + current interim
        const displayTranscript = finalTranscriptRef.current + 
          (interimTranscript.trim() ? (finalTranscriptRef.current ? ' ' : '') + interimTranscript.trim() : '');
        
        if (displayTranscript.trim()) {
          setTranscription(displayTranscript.trim());
        }
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          setTranscription('Could not understand speech. Please try again.');
        }
        
        // On mobile, restart STT if still recording and error is not aborted
        if (isRecording && event.error !== 'aborted' && (isIOS || /Android/i.test(navigator.userAgent))) {
          console.log('🔄 Restarting STT after error on mobile');
          setTimeout(() => {
            try {
              if (recognitionRef.current && isRecording) {
                recognitionRef.current.start();
              }
            } catch (restartErr) {
              console.warn('Failed to restart STT:', restartErr);
            }
          }, 100);
        }
      };
      
      recognitionRef.current.onend = () => {
        console.log('Speech recognition ended');
        
        // On mobile, auto-restart while recording to avoid mid-session stops
        if (isRecording && (isIOS || /Android/i.test(navigator.userAgent))) {
          console.log('🔄 STT ended, restarting for mobile...');
          setTimeout(() => {
            try {
              if (recognitionRef.current && isRecording) {
                recognitionRef.current.start();
              }
            } catch (restartErr) {
              console.warn('Failed to restart STT:', restartErr);
            }
          }, 200);
        }
      };
    }
  };

  const calculateAccuracy = (spokenText, targetText) => {
    console.log('🎯 Calculating accuracy for:');
    console.log('Spoken:', spokenText);
    console.log('Target:', targetText);
    
    // Safety check for undefined targetText
    if (!targetText) {
        console.error('targetText is undefined in calculateAccuracy');
        return 0;
    }
    
    // Remove HTML tags and clean text
    const cleanTargetText = targetText.replace(/<[^>]*>/g, '');
    
    // Clean and normalize text
    const spoken = spokenText.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const target = cleanTargetText.toLowerCase().replace(/[^\w\s]/g, '').trim();
    
    console.log('Cleaned spoken:', spoken);
    console.log('Cleaned target:', target);
    
    // If texts are identical after cleaning, it's 100%
    if (spoken === target) {
      console.log('✅ Perfect match! 100% accuracy');
      setAccuracy(100);
      onScoreUpdate?.(100, 0); // Pass 0 for XP since it's handled elsewhere
      onResult?.({ accuracy: 100, xp: 0 });
      return;
    }
    
    const spokenWords = spoken.split(/\s+/).filter(word => word.length > 0);
    const targetWords = target.split(/\s+/).filter(word => word.length > 0);
    
    console.log('Spoken words:', spokenWords);
    console.log('Target words:', targetWords);
    
    // Advanced matching algorithm
    let totalScore = 0;
    const matchedSpokenIndices = new Set();
    
    // For each target word, find the best match in spoken words
    for (let i = 0; i < targetWords.length; i++) {
      const targetWord = targetWords[i];
      let bestMatch = 0;
      let bestMatchIndex = -1;
      
      for (let j = 0; j < spokenWords.length; j++) {
        if (matchedSpokenIndices.has(j)) continue; // Skip already matched words
        
        const spokenWord = spokenWords[j];
        let matchScore = 0;
        
        if (spokenWord === targetWord) {
          // Exact match
          matchScore = 1.0;
        } else if (spokenWord.includes(targetWord) || targetWord.includes(spokenWord)) {
          // Partial match (one word contains the other)
          matchScore = 0.8;
        } else {
          // Calculate similarity based on common characters
          const similarity = calculateWordSimilarity(spokenWord, targetWord);
          if (similarity > 0.6) { // Only count if reasonably similar
            matchScore = similarity * 0.7; // Reduce score for non-exact matches
          }
        }
        
        // Bonus for positional accuracy (word is close to expected position)
        const positionDiff = Math.abs(i - j);
        const positionBonus = Math.max(0, 1 - (positionDiff / Math.max(spokenWords.length, targetWords.length)));
        matchScore *= (0.7 + 0.3 * positionBonus); // 70% word match + 30% position bonus
        
        if (matchScore > bestMatch) {
          bestMatch = matchScore;
          bestMatchIndex = j;
        }
      }
      
      if (bestMatchIndex !== -1) {
        matchedSpokenIndices.add(bestMatchIndex);
        totalScore += bestMatch;
        console.log(`Target "${targetWord}" matched with "${spokenWords[bestMatchIndex]}" (score: ${bestMatch.toFixed(2)})`);
      } else {
        console.log(`Target "${targetWord}" - no match found`);
      }
    }
    
    console.log('Total score:', totalScore);
    console.log('Target words count:', targetWords.length);
    
    // Calculate percentage
    const accuracyScore = targetWords.length > 0 
      ? Math.round((totalScore / targetWords.length) * 100)
      : 0;
    
    // Small penalty for extra words (but not as harsh)
    let finalScore = accuracyScore;
    if (spokenWords.length > targetWords.length + 1) { // Allow 1 extra word without penalty
      const extraWords = spokenWords.length - targetWords.length - 1;
      const extraWordsPenalty = Math.min(10, extraWords * 3); // Reduced penalty
      finalScore = Math.max(0, accuracyScore - extraWordsPenalty);
    }
    
    console.log('Final accuracy score:', finalScore);
    
    setAccuracy(finalScore);
    
    // Pass accuracy to parent - XP will be handled by the exercise component
    onScoreUpdate?.(finalScore, 0); // Pass 0 for XP since it's handled elsewhere
    onResult?.({ accuracy: finalScore, xp: 0 });
  };

  // Helper function to calculate word similarity
  const calculateWordSimilarity = (word1, word2) => {
    if (word1 === word2) return 1.0;
    if (word1.length === 0 || word2.length === 0) return 0;
    
    // Simple character-based similarity
    const maxLength = Math.max(word1.length, word2.length);
    const minLength = Math.min(word1.length, word2.length);
    
    let matches = 0;
    for (let i = 0; i < minLength; i++) {
      if (word1[i] === word2[i]) {
        matches++;
      }
    }
    
    // Also check for common substrings
    let commonChars = 0;
    for (const char of word1) {
      if (word2.includes(char)) {
        commonChars++;
      }
    }
    
    const positionSimilarity = matches / maxLength;
    const characterSimilarity = commonChars / word1.length;
    
    return Math.max(positionSimilarity, characterSimilarity * 0.8);
  };

  const startRecording = async () => {
    try {
      console.log('🎤 Starting recording...');
      
      // Ensure speech recognition is setup before recording (especially on iOS)
      if (!recognitionRef.current && isIOS) {
        console.log('📱 Setting up speech recognition before recording on iOS');
        setupSpeechRecognition();
      }
      
      // Request microphone permission immediately without checking devices first
      // This avoids premature permission prompts on iOS
      let stream;
      try {
        // Try with iOS-optimized constraints first
        if (isIOS) {
          console.log('📱 Using iOS-optimized audio constraints');
          // iOS Safari works best with minimal constraints
          stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              // Remove sampleRate constraint for iOS compatibility
            }
          });
        } else {
          // Use full constraints for other platforms
          stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              sampleRate: 44100,
            }
          });
        }
      } catch (err) {
        console.warn('Primary getUserMedia failed, retrying with minimal constraints', err);
        // Fallback to minimal constraints for maximum compatibility
        try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (fallbackErr) {
          console.error('Fallback getUserMedia also failed:', fallbackErr);
          throw fallbackErr;
        }
      }

      setPermissionStatus('granted');

      // Use iOS-compatible MediaRecorder settings
      let mediaRecorderOptions = {};
      if (isIOS) {
        // iOS Safari supports these formats better
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mediaRecorderOptions.mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mediaRecorderOptions.mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/wav')) {
          mediaRecorderOptions.mimeType = 'audio/wav';
        }
        // Don't specify codec for iOS compatibility
        console.log('📱 iOS MediaRecorder options:', mediaRecorderOptions);
      } else {
        // Use opus codec for other platforms
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mediaRecorderOptions.mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mediaRecorderOptions.mimeType = 'audio/webm';
        }
      }

      mediaRecorderRef.current = new MediaRecorder(stream, mediaRecorderOptions);
      
      chunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        // Use the same mime type that was used for MediaRecorder
        const mimeType = mediaRecorderOptions.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        
        if (onAudioRecorded) {
          onAudioRecorded(url, blob);
        }
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      
      if (onRecordingStart) onRecordingStart();
      if (recognitionRef.current) recognitionRef.current.start();
      
    } catch (error) {
      console.error('Error starting recording:', error);
      
      // Enhanced iOS-specific error handling
      if (error.name === 'NotFoundError') {
        setPermissionStatus('no-device');
        console.log('📱 No microphone device found');
      } else if (error.name === 'NotAllowedError') {
        setPermissionStatus('denied');
        if (isIOS) {
          console.log('📱 iOS microphone permission denied - user needs to enable in Settings');
        }
      } else if (error.name === 'NotSupportedError') {
        setPermissionStatus('not-supported');
        console.log('📱 Microphone not supported on this device');
      } else if (error.name === 'AbortError') {
        // Common on iOS when permission is interrupted
        console.log('📱 iOS permission request was aborted');
        setPermissionStatus('error');
      } else if (error.name === 'NotReadableError') {
        // iOS-specific: hardware already in use
        console.log('📱 iOS microphone hardware already in use');
        setPermissionStatus('error');
      } else if (error.name === 'SecurityError') {
        // iOS-specific: security context issues
        console.log('📱 iOS security error - may need HTTPS');
        setPermissionStatus('error');
      } else if (error.name === 'TypeError') {
        // iOS-specific: getUserMedia not available
        console.log('📱 iOS getUserMedia not available');
        setPermissionStatus('not-supported');
      } else {
        console.log('📱 Unknown error:', error.name, error.message);
        setPermissionStatus('error');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    if (onRecordingStop) onRecordingStop();
    
    setTimeout(() => {
      const finalText = finalTranscriptRef.current.trim() || transcription.trim();
      if (finalText) {
        console.log('Calculating accuracy for final text:', finalText);
        const textToCompare = targetText || sentence;
        calculateAccuracy(finalText, textToCompare);
      }
    }, 500);
  };

  const playRecording = () => {
    if (audioRef.current && audioUrl) {
      setIsPlaying(true);
      audioRef.current.play();
    }
  };

  const resetRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscription('');
    setAccuracy(null);
    setIsPlaying(false);
    finalTranscriptRef.current = ''; // Reset accumulated transcript
  };

  const startNewRecording = () => {
    // Reset all states when starting a new recording
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscription('');
    setAccuracy(null);
    setIsPlaying(false);
    finalTranscriptRef.current = ''; // Reset accumulated transcript
    
    // Start recording
    startRecording();
  };

  const getAccuracyColor = () => {
    if (accuracy === null) return 'text-gray-500';
    if (accuracy >= 90) return 'text-green-600';
    if (accuracy >= 80) return 'text-blue-600';
    if (accuracy >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAccuracyMessage = () => {
    if (accuracy === null) return '';
    if (accuracy >= 90) return 'Excellent! Perfect pronunciation!';
    if (accuracy >= 80) return 'Great job! Very good pronunciation!';
    if (accuracy >= 70) return 'Good! Keep practicing!';
    if (accuracy >= 60) return 'Not bad! Try to speak more clearly.';
    return 'Keep practicing! Try speaking slower and clearer.';
  };

  // Handle different permission statuses
  if (permissionStatus === 'checking') {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Checking Microphone...</h3>
          <p className="text-gray-600">Please wait while we check your microphone access.</p>
        </div>
      </div>
    );
  }

  // Show recording interface for idle, granted, and error states
  if (permissionStatus === 'idle' || permissionStatus === 'granted') {
    const containerClass = embedded 
      ? "p-2" 
      : "bg-white rounded-xl shadow-sm p-6 mb-6";

    return (
      <div className={containerClass}>
        
        {/* Recording Controls - Outside the box */}
        <div className={`flex items-center justify-center ${embedded ? 'mb-4' : 'mb-6'}`}>
          <button
            onClick={isRecording ? stopRecording : startNewRecording}
            disabled={permissionStatus === 'checking'}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all transform hover:scale-105 ${
              isRecording
                ? 'bg-red-500 animate-pulse shadow-lg'
                : 'bg-blue-600 hover:bg-blue-700 shadow-md'
            }`}
          >
            {isRecording ? (
              <Square className="w-8 h-8 text-white" />
            ) : (
              <Mic className="w-8 h-8 text-white" />
            )}
          </button>
        </div>
        
        {/* Status Text */}
        <p className={`text-center text-gray-600 font-medium ${embedded ? 'mb-3' : 'mb-4'}`}>
          {isRecording 
            ? 'Recording... Speak continuously and tap stop when done!' 
            : ''
          }
        </p>
        
        {/* Score Display - Only show when accuracy is available and not hidden */}
        {accuracy !== null && !hideAccuracy && (
          <div className="text-center mb-4">
            <span className={`font-bold text-4xl ${getAccuracyColor()}`}>
              {accuracy}%
            </span>
          </div>
        )}
        
        {/* Control Buttons */}
        <div className="flex flex-wrap justify-center gap-3">
          {audioUrl && (
            <>
              <Button variant="secondary" size="sm" onClick={playRecording}>
                <Play className="w-4 h-4" />
              </Button>
              
              <Button variant="secondary" size="sm" onClick={startNewRecording}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
        
        {/* Hidden audio element for playback */}
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          style={{ display: 'none' }}
        />
      </div>
    );
  }

  if (permissionStatus === 'denied') {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="text-center">
          <Mic className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Microphone Access Denied</h3>
          <div className="text-gray-600 mb-4">
            {isIOS ? (
              <div className="space-y-3">
                <p className="font-medium">📱 Để bật microphone trên iOS:</p>
                <ol className="text-left text-sm space-y-2 max-w-md mx-auto bg-gray-50 p-4 rounded-lg">
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-blue-600">1.</span>
                    <span>Vào Cài đặt iPhone → Safari → Camera & Microphone</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-blue-600">2.</span>
                    <span>Đặt Microphone thành "Hỏi" hoặc "Cho phép"</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-blue-600">3.</span>
                    <span>Làm mới trang này và thử lại</span>
                  </li>
                </ol>
                <p className="text-xs text-gray-500">
                  💡 Nếu vẫn không hoạt động, hãy thử đóng và mở lại Safari
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p>Vui lòng cho phép truy cập microphone để luyện nói.</p>
                <p className="text-sm text-gray-500">
                  Nhấp vào biểu tượng microphone trên thanh địa chỉ trình duyệt.
                </p>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <Button variant="primary" onClick={checkMicrophonePermission}>
              Thử lại
            </Button>
            <Button variant="secondary" onClick={() => {
              // Simulate completion without recording
              setTranscription('Microphone access denied - practice completed');
              setAccuracy(85); // Default accuracy
              onScoreUpdate?.(85, 25);
              onResult?.({ accuracy: 85, xp: 25 });
            }}>
              Tiếp tục không cần microphone
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (permissionStatus === 'no-device') {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="text-center">
          <Mic className="w-16 h-16 text-orange-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Không tìm thấy microphone</h3>
          <div className="text-gray-600 mb-4">
            {isIOS ? (
              <div className="space-y-2">
                <p>📱 Không tìm thấy microphone trên thiết bị iOS.</p>
                <p className="text-sm text-gray-500">
                  Hãy kiểm tra xem thiết bị có microphone không và thử lại.
                </p>
              </div>
            ) : (
              <p>Chúng tôi không thể phát hiện microphone nào trên thiết bị của bạn. Vui lòng kiểm tra kết nối microphone và thử lại.</p>
            )}
          </div>
          <div className="space-y-3">
            <Button variant="primary" onClick={checkMicrophonePermission}>
              Kiểm tra lại
            </Button>
            <Button variant="secondary" onClick={() => {
              // Simulate completion without recording
              setTranscription('Microphone not available - practice completed');
              setAccuracy(85); // Default accuracy
              onScoreUpdate?.(85, 25);
            }}>
              Tiếp tục không cần microphone
            </Button>
            <div className="text-sm text-gray-500">
              💡 Mẹo: Đảm bảo microphone được kết nối và không được sử dụng bởi ứng dụng khác
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (permissionStatus === 'not-supported') {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="text-center">
          <Mic className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Microphone không được hỗ trợ</h3>
          <div className="text-gray-600 mb-4">
            {isIOS ? (
              <div className="space-y-2">
                <p>📱 Trình duyệt của bạn không hỗ trợ truy cập microphone.</p>
                <p className="text-sm text-gray-500">
                  Vui lòng sử dụng Safari hoặc cập nhật trình duyệt lên phiên bản mới nhất.
                </p>
              </div>
            ) : (
              <p>Trình duyệt của bạn không hỗ trợ truy cập microphone. Vui lòng thử sử dụng trình duyệt hiện đại như Chrome, Firefox, hoặc Safari.</p>
            )}
          </div>
          <div className="space-y-3">
            <Button variant="primary" onClick={checkMicrophonePermission}>
              Thử lại
            </Button>
            <Button variant="secondary" onClick={() => {
              // Simulate completion without recording
              setTranscription('Microphone not supported - practice completed');
              setAccuracy(85); // Default accuracy
              onScoreUpdate?.(85, 25);
            }}>
              Tiếp tục không cần microphone
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (permissionStatus === 'error') {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="text-center">
          <Mic className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Lỗi microphone</h3>
          <div className="text-gray-600 mb-4">
            {isIOS ? (
              <div className="space-y-2">
                <p>📱 Có lỗi khi truy cập microphone trên iOS.</p>
                <p className="text-sm text-gray-500">
                  Vui lòng thử làm mới trang hoặc kiểm tra cài đặt Safari.
                </p>
              </div>
            ) : (
              <p>Có lỗi khi truy cập microphone. Vui lòng thử làm mới trang hoặc kiểm tra cài đặt trình duyệt.</p>
            )}
          </div>
          <div className="space-y-3">
            <Button variant="primary" onClick={checkMicrophonePermission}>
              Thử lại
            </Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Làm mới trang
            </Button>
            <Button variant="secondary" onClick={() => {
              // Simulate completion without recording
              setTranscription('Microphone error - practice completed');
              setAccuracy(85); // Default accuracy
              onScoreUpdate?.(85, 25);
            }}>
              Tiếp tục không cần microphone
            </Button>
          </div>
        </div>
      </div>
    );
  }

};

export default RecordingInterface;