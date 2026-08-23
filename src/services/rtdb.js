// src/services/rtdb.js
// Firebase RTDB REST Client (API Key Handshake)

// Set to your actual Firebase Realtime Database Project ID when configured
const FIREBASE_PROJECT = 'YOUR_FIREBASE_PROJECT';
let geminiApiKey = null;
let fetchAttempted = false;

export async function fetchGeminiApiKey() {
  if (fetchAttempted) return geminiApiKey;
  fetchAttempted = true;

  // Skip useless network roundtrip if project is unconfigured
  if (!FIREBASE_PROJECT || FIREBASE_PROJECT === 'YOUR_FIREBASE_PROJECT') {
    return null;
  }
  
  try {
    const response = await fetch(`https://${FIREBASE_PROJECT}.firebaseio.com/config/gemini_api_key.json`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    geminiApiKey = data;
    return geminiApiKey;
  } catch (error) {
    console.warn('[RTDB] Remote Gemini API Key fetch skipped:', error.message || error);
    return null;
  }
}

export function getGeminiApiKey() {
  return geminiApiKey;
}
