// Audio proxy utility to bypass CORS
export const fetchAudioWithProxy = async (audioUrl) => {
  try {
    // Option 1: Use a CORS proxy service
    const proxyUrl = `https://cors-anywhere.herokuapp.com/${audioUrl}`;
    const response = await fetch(proxyUrl, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Proxy fetch failed: ${response.status}`);
    }
    
    return response;
  } catch (error) {
    console.warn('Proxy method failed:', error);
    throw error;
  }
};

// Option 2: Use multiple proxy services as fallback
export const fetchAudioWithFallback = async (audioUrl) => {
  const proxies = [
    `https://cors-anywhere.herokuapp.com/${audioUrl}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(audioUrl)}`,
    `https://thingproxy.freeboard.io/fetch/${audioUrl}`
  ];
  
  for (const proxyUrl of proxies) {
    try {
      const response = await fetch(proxyUrl);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      console.warn(`Proxy ${proxyUrl} failed:`, error);
      continue;
    }
  }
  
  throw new Error('All proxy methods failed');
};











