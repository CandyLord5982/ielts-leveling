// Azure Pronunciation Assessment Service
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

/**
 * Convert audio blob to WAV format
 * @param {Blob} audioBlob - The audio blob to convert
 * @returns {Promise<Blob>} WAV format audio blob
 */
const convertToWav = async (audioBlob) => {
  return new Promise((resolve, reject) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const fileReader = new FileReader();

    fileReader.onload = async () => {
      try {
        const arrayBuffer = fileReader.result;
        let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Resample to 16kHz for Azure (optimal for speech recognition)
        audioBuffer = await resampleAudioBuffer(audioBuffer, 16000);

        // Convert to WAV
        const wavBlob = audioBufferToWav(audioBuffer);
        audioContext.close();
        resolve(wavBlob);
      } catch (error) {
        audioContext.close();
        reject(error);
      }
    };

    fileReader.onerror = () => reject(fileReader.error);
    fileReader.readAsArrayBuffer(audioBlob);
  });
};

/**
 * Resample audio buffer to target sample rate (Azure prefers 16kHz)
 */
const resampleAudioBuffer = async (audioBuffer, targetSampleRate = 16000) => {
  if (audioBuffer.sampleRate === targetSampleRate) {
    return audioBuffer;
  }

  const offlineContext = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    Math.ceil(audioBuffer.duration * targetSampleRate),
    targetSampleRate
  );

  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start(0);

  return await offlineContext.startRendering();
};

/**
 * Convert AudioBuffer to WAV Blob (Mono, 16kHz, 16-bit PCM - Azure's preferred format)
 */
const audioBufferToWav = (audioBuffer) => {
  // Azure Speech Service prefers mono audio
  const numberOfChannels = 1; // Force mono
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;

  // Mix down to mono if stereo
  let channelData;
  if (audioBuffer.numberOfChannels === 1) {
    channelData = audioBuffer.getChannelData(0);
  } else {
    // Mix stereo to mono
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    channelData = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) {
      channelData[i] = (left[i] + right[i]) / 2;
    }
  }

  const dataLength = channelData.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write audio data
  let index = 44;
  for (let i = 0; i < channelData.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(index, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    index += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Assess pronunciation using Azure Speech Service
 * @param {string} referenceText - The text the user should pronounce
 * @param {Blob} audioBlob - The recorded audio blob
 * @param {string} language - Language code (e.g., 'en-US', 'vi-VN')
 * @returns {Promise<Object>} Pronunciation assessment result
 */
export const assessPronunciation = async (referenceText, audioBlob, language = 'en-US') => {
  try {
    // Get Azure credentials from environment variables
    const subscriptionKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
    const serviceRegion = import.meta.env.VITE_AZURE_SPEECH_REGION || 'eastus';

    if (!subscriptionKey) {
      throw new Error('Azure Speech subscription key not configured');
    }

    console.log('🎤 Starting Azure pronunciation assessment...');
    console.log('Reference text:', referenceText);
    console.log('Language:', language);
    console.log('Original audio blob type:', audioBlob.type);
    console.log('Original audio blob size:', audioBlob.size, 'bytes');

    // Validate audio blob
    if (audioBlob.size < 1000) {
      console.error('Audio blob too small, likely no audio recorded');
      return {
        success: false,
        error: 'AUDIO_TOO_SHORT',
        message: 'Recording is too short or silent. Please speak clearly and try again.'
      };
    }

    // Convert audio to WAV format
    console.log('Converting audio to WAV format...');
    const wavBlob = await convertToWav(audioBlob);
    console.log('WAV blob size:', wavBlob.size, 'bytes');
    console.log('WAV blob type:', wavBlob.type);

    // Create speech config
    const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, serviceRegion);
    speechConfig.speechRecognitionLanguage = language;

    // Create pronunciation assessment config
    const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
      referenceText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      true // Enable miscue detection
    );

    // Configure detailed results
    pronunciationConfig.enableProsodyAssessment = true;

    // Create push stream for audio input
    const pushStream = sdk.AudioInputStream.createPushStream();

    // Push audio data to stream
    const reader = new FileReader();
    await new Promise((resolve, reject) => {
      reader.onload = () => {
        const arrayBuffer = reader.result;
        pushStream.write(arrayBuffer);
        pushStream.close();
        resolve();
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(wavBlob);
    });

    // Create audio config from push stream
    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

    // Create speech recognizer
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    pronunciationConfig.applyTo(recognizer);

    // Perform recognition
    const result = await new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        (result) => {
          recognizer.close();
          resolve(result);
        },
        (error) => {
          recognizer.close();
          reject(error);
        }
      );
    });

    console.log('📊 Azure result reason:', result.reason);

    // Check if recognition was successful
    if (result.reason === sdk.ResultReason.RecognizedSpeech) {
      console.log('✅ Speech recognized:', result.text);

      // Check if only punctuation or very short text was recognized
      const cleanText = result.text.replace(/[.,!?;:]/g, '').trim();
      if (cleanText.length === 0 || result.text === '.') {
        console.warn('⚠️ Only punctuation or silence detected');
        return {
          success: false,
          error: 'NO_CLEAR_SPEECH',
          message: 'No clear speech detected. Please speak louder and more clearly.'
        };
      }

      // Parse pronunciation assessment results
      const pronunciationResult = sdk.PronunciationAssessmentResult.fromResult(result);

      console.log('✅ Pronunciation assessment successful');
      console.log('Accuracy score:', pronunciationResult.accuracyScore);
      console.log('Pronunciation score:', pronunciationResult.pronunciationScore);
      console.log('Completeness score:', pronunciationResult.completenessScore);
      console.log('Fluency score:', pronunciationResult.fluencyScore);

      // Get detailed word-level results with phonemes and syllables
      const detailedResult = JSON.parse(result.properties.getProperty(
        sdk.PropertyId.SpeechServiceResponse_JsonResult
      ));

      console.log('📖 Detailed result:', JSON.stringify(detailedResult, null, 2));

      const words = detailedResult.NBest?.[0]?.Words || [];

      // Process words with syllables and phonemes
      const wordsWithDetails = words.map(word => {
        const syllables = word.Syllables || [];
        const phonemes = word.Phonemes || [];

        return {
          word: word.Word,
          accuracyScore: Math.round(word.PronunciationAssessment?.AccuracyScore || 0),
          errorType: word.PronunciationAssessment?.ErrorType || 'None',
          // Syllable breakdown
          syllables: syllables.map(syllable => ({
            syllable: syllable.Syllable,
            accuracyScore: Math.round(syllable.PronunciationAssessment?.AccuracyScore || 0),
            grapheme: syllable.Grapheme
          })),
          // Phoneme breakdown (most granular)
          phonemes: phonemes.map(phoneme => ({
            phoneme: phoneme.Phoneme,
            accuracyScore: Math.round(phoneme.PronunciationAssessment?.AccuracyScore || 0),
            nBestPhonemes: phoneme.PronunciationAssessment?.NBestPhonemes || []
          }))
        };
      });

      return {
        success: true,
        overallScore: Math.round(pronunciationResult.pronunciationScore),
        accuracyScore: Math.round(pronunciationResult.accuracyScore),
        fluencyScore: Math.round(pronunciationResult.fluencyScore),
        completenessScore: Math.round(pronunciationResult.completenessScore),
        prosodyScore: detailedResult.NBest?.[0]?.PronunciationAssessment?.ProsodyScore
          ? Math.round(detailedResult.NBest[0].PronunciationAssessment.ProsodyScore)
          : null,
        recognizedText: result.text,
        referenceText: referenceText,
        words: wordsWithDetails,
        feedback: generateFeedback(pronunciationResult, referenceText, result.text)
      };
    } else if (result.reason === sdk.ResultReason.NoMatch) {
      console.warn('⚠️ No speech recognized');
      const noMatchDetail = result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
      console.log('NoMatch details:', noMatchDetail);
      return {
        success: false,
        error: 'NO_SPEECH',
        message: 'No speech was detected. Please speak louder and closer to the microphone.'
      };
    } else {
      console.error('❌ Recognition failed:', result.errorDetails);
      return {
        success: false,
        error: 'RECOGNITION_FAILED',
        message: result.errorDetails || 'Speech recognition failed.'
      };
    }
  } catch (error) {
    console.error('❌ Azure pronunciation assessment error:', error);
    return {
      success: false,
      error: 'SERVICE_ERROR',
      message: error.message || 'An error occurred during pronunciation assessment.'
    };
  }
};

/**
 * Generate feedback message based on pronunciation scores
 */
const generateFeedback = (pronunciationResult, referenceText, recognizedText) => {
  const score = pronunciationResult.pronunciationScore;
  const accuracy = pronunciationResult.accuracyScore;
  const fluency = pronunciationResult.fluencyScore;

  let feedback = '';

  // Overall assessment
  if (score >= 90) {
    feedback = 'Excellent pronunciation! 🌟';
  } else if (score >= 80) {
    feedback = 'Very good! 👍';
  } else if (score >= 70) {
    feedback = 'Good effort! Keep practicing. 💪';
  } else if (score >= 60) {
    feedback = 'Fair. Try to focus on clarity. 🎯';
  } else {
    feedback = 'Keep practicing. You can do it! ��';
  }

  // Add specific tips
  if (accuracy < 70) {
    feedback += ' Focus on pronouncing each sound clearly.';
  }
  if (fluency < 70) {
    feedback += ' Try to speak more smoothly without long pauses.';
  }

  // Check if text matches
  const recognizedLower = recognizedText.toLowerCase().trim();
  const referenceLower = referenceText.toLowerCase().trim();
  if (recognizedLower !== referenceLower && accuracy < 80) {
    feedback += ` Make sure you're saying "${referenceText}".`;
  }

  return feedback;
};

/**
 * Record audio from microphone
 * @param {number} maxDuration - Maximum recording duration in milliseconds
 * @returns {Promise<Blob>} Recorded audio blob
 */
export const recordAudio = async (maxDuration = 10000) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const audioChunks = [];

    return new Promise((resolve, reject) => {
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        stream.getTracks().forEach(track => track.stop());
        resolve(audioBlob);
      };

      mediaRecorder.onerror = (error) => {
        stream.getTracks().forEach(track => track.stop());
        reject(error);
      };

      // Start recording
      mediaRecorder.start();

      // Stop after max duration
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, maxDuration);

      // Return stop function
      mediaRecorder.stopRecording = () => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      };
    });
  } catch (error) {
    console.error('Error recording audio:', error);
    throw new Error('Failed to access microphone. Please check permissions.');
  }
};

/**
 * Simple browser-based pronunciation assessment (fallback)
 * Uses Web Speech API for basic scoring
 */
export const assessPronunciationSimple = async (referenceText, language = 'en-US') => {
  return new Promise((resolve, reject) => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      reject(new Error('Speech recognition not supported'));
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;

      // Simple comparison
      const recognizedLower = transcript.toLowerCase().trim();
      const referenceLower = referenceText.toLowerCase().trim();
      const isMatch = recognizedLower.includes(referenceLower) ||
                      referenceLower.includes(recognizedLower);

      const accuracyScore = isMatch ? Math.round(confidence * 100) : 30;

      resolve({
        success: true,
        overallScore: accuracyScore,
        accuracyScore: accuracyScore,
        fluencyScore: Math.round(confidence * 95),
        completenessScore: isMatch ? 100 : 50,
        prosodyScore: null,
        recognizedText: transcript,
        referenceText: referenceText,
        words: [],
        feedback: accuracyScore >= 80 ? 'Great job! 🌟' : 'Keep practicing! 💪'
      });
    };

    recognition.onerror = (event) => {
      reject(new Error(`Speech recognition error: ${event.error}`));
    };

    recognition.start();

    // Auto-stop after 10 seconds
    setTimeout(() => {
      recognition.stop();
    }, 10000);
  });
};
