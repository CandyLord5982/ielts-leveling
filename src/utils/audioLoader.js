// Alternative audio loading methods
export const loadAudioWithMediaElement = async (audioUrl, audioContext) => {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = audioUrl;
    
    audio.oncanplaythrough = () => {
      try {
        // Create MediaElementAudioSourceNode
        const source = audioContext.createMediaElementSource(audio);
        const analyser = audioContext.createAnalyser();
        const gainNode = audioContext.createGain();
        
        // Connect nodes
        source.connect(analyser);
        analyser.connect(gainNode);
        
        // Return the audio element and source
        resolve({ audio, source, analyser, gainNode });
      } catch (error) {
        reject(error);
      }
    };
    
    audio.onerror = (error) => {
      reject(new Error(`Failed to load audio: ${error}`));
    };
    
    audio.load();
  });
};

// Method to create audio buffer from MediaElementSource
export const createBufferFromMediaElement = async (source, audioContext, duration = 10) => {
  const sampleRate = audioContext.sampleRate;
  const length = sampleRate * duration;
  const buffer = audioContext.createBuffer(2, length, sampleRate);
  
  // This is a simplified approach - in practice, you'd need to record the audio
  // For now, return a silent buffer
  return buffer;
};











