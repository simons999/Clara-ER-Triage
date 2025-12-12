// geminiTTS.js — Gemini Text-to-Speech with Sulafat voice

const GeminiTTS = (function() {

    // Configuration - Sulafat is Clara's voice (warm and welcoming)
    const CONFIG = {
        model: 'gemini-2.5-flash-preview-tts', // TTS model with audio output support
        voice: 'Sulafat' // Clara's voice - warm and welcoming
    };

    let apiKey = null;
    let audioContext = null;
    let currentSource = null;
    let isPlaying = false;
    let onStateChange = null;
    let onComplete = null;

    // Voice states
    const STATES = {
        IDLE: 'idle',
        LOADING: 'loading',
        SPEAKING: 'speaking',
        ERROR: 'error'
    };

    let currentState = STATES.IDLE;

    /**
     * Initialize Gemini TTS
     * @param {string} key - Gemini API key
     * @param {function} stateCallback - Callback for state changes
     */
    function init(key, stateCallback) {
        // Get API key from parameter, ClaraConfig, or window.GEMINI_API_KEY
        apiKey = key || (window.ClaraConfig && window.ClaraConfig.apiKey) || window.GEMINI_API_KEY;
        onStateChange = stateCallback;

        console.log('[GeminiTTS] Initializing with API key:', apiKey ? 'present (' + apiKey.substring(0, 8) + '...)' : 'NOT SET');

        // Initialize AudioContext (needed for playback)
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            console.log('[GeminiTTS] Initialized with voice:', CONFIG.voice, 'AudioContext state:', audioContext.state);
        } catch (e) {
            console.error('[GeminiTTS] Failed to create AudioContext:', e);
        }
    }

    /**
     * Set current state and notify callback
     */
    function setState(state) {
        currentState = state;
        if (onStateChange) {
            onStateChange(state);
        }
    }

    /**
     * Speak text using Gemini TTS
     * @param {string} text - Text to speak
     * @param {function} completeCallback - Called when speech completes
     */
    async function speak(text, completeCallback) {
        console.log('[GeminiTTS] speak() called with text:', text.substring(0, 50) + '...');

        // Check if API key is available (this also updates from ClaraConfig if needed)
        const hasApiKey = isAvailable();
        console.log('[GeminiTTS] API key available:', hasApiKey);

        if (!text || text.trim() === '') {
            if (completeCallback) completeCallback();
            return;
        }

        if (!hasApiKey) {
            console.warn('[GeminiTTS] No API key set, falling back to Web Speech');
            onComplete = completeCallback;
            fallbackToWebSpeech(text);
            return;
        }

        // Stop any current playback BEFORE setting the new callback
        // This prevents the old callback from being called prematurely
        stop();

        // Set the callback AFTER stopping, so it's not cleared by stop()
        onComplete = completeCallback;

        setState(STATES.LOADING);

        try {
            console.log('[GeminiTTS] Calling generateSpeech...');
            const audioData = await generateSpeech(text);
            console.log('[GeminiTTS] Audio data received, playing...');
            await playAudio(audioData);
        } catch (error) {
            console.error('[GeminiTTS] Error:', error);
            setState(STATES.ERROR);
            // Fallback to Web Speech API
            fallbackToWebSpeech(text);
        }
    }

    /**
     * Generate speech audio from text using Gemini API
     * @param {string} text - Text to convert to speech
     * @returns {object} - Audio data with base64 and mimeType
     */
    async function generateSpeech(text) {
        // Ensure we have the latest API key
        const currentApiKey = apiKey || (window.ClaraConfig && window.ClaraConfig.apiKey) || window.GEMINI_API_KEY;
        if (!currentApiKey) {
            throw new Error('No API key available for TTS');
        }
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.model}:generateContent?key=${currentApiKey}`;

        const requestBody = {
            contents: [{
                parts: [{
                    text: text
                }]
            }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: CONFIG.voice
                        }
                    }
                }
            }
        };

        console.log('[GeminiTTS] Sending request to:', endpoint.replace(apiKey, 'API_KEY_HIDDEN'));
        console.log('[GeminiTTS] Request body:', JSON.stringify(requestBody, null, 2));

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('[GeminiTTS] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[GeminiTTS] Error response:', errorText);
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[GeminiTTS] Response structure:', Object.keys(data));

        // Extract audio data from response
        // Response structure: data.candidates[0].content.parts[0].inlineData.data (base64)
        const audioBase64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        const mimeType = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/wav';

        console.log('[GeminiTTS] Audio data found:', !!audioBase64, 'mimeType:', mimeType);

        if (!audioBase64) {
            console.error('[GeminiTTS] Full response:', JSON.stringify(data, null, 2));
            throw new Error('No audio data in response');
        }

        return { base64: audioBase64, mimeType };
    }

    /**
     * Play audio from base64 data
     * @param {object} audioData - Object with base64 and mimeType
     */
    async function playAudio(audioData) {
        const { base64, mimeType } = audioData;

        // Decode base64 to ArrayBuffer
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Resume AudioContext if suspended (browser autoplay policy)
        if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        if (!audioContext) {
            throw new Error('AudioContext not available');
        }

        let audioBuffer;

        // Check if this is raw PCM data from the TTS model
        // The TTS model outputs audio/L16;codec=pcm;rate=24000
        if (mimeType && mimeType.includes('L16') || mimeType.includes('pcm')) {
            // Convert raw PCM to AudioBuffer manually
            const sampleRate = 24000; // Gemini TTS outputs at 24kHz
            const numChannels = 1; // Mono audio

            // PCM L16 is 16-bit signed integers, little-endian
            const numSamples = bytes.length / 2;
            audioBuffer = audioContext.createBuffer(numChannels, numSamples, sampleRate);
            const channelData = audioBuffer.getChannelData(0);

            // Convert 16-bit PCM to float32 (-1.0 to 1.0)
            const dataView = new DataView(bytes.buffer);
            for (let i = 0; i < numSamples; i++) {
                // Read 16-bit signed integer (little-endian)
                const sample = dataView.getInt16(i * 2, true);
                // Convert to float (-1.0 to 1.0)
                channelData[i] = sample / 32768.0;
            }

            console.log('[GeminiTTS] Converted PCM audio:', numSamples, 'samples at', sampleRate, 'Hz');
        } else {
            // Standard audio format - let the browser decode it
            try {
                audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
            } catch (decodeError) {
                console.warn('[GeminiTTS] Failed to decode as standard audio, trying PCM conversion...');
                // Fallback: assume it's raw PCM
                const sampleRate = 24000;
                const numSamples = bytes.length / 2;
                audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
                const channelData = audioBuffer.getChannelData(0);
                const dataView = new DataView(bytes.buffer);
                for (let i = 0; i < numSamples; i++) {
                    const sample = dataView.getInt16(i * 2, true);
                    channelData[i] = sample / 32768.0;
                }
            }
        }

        // Create source and play
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        currentSource = source;
        isPlaying = true;
        setState(STATES.SPEAKING);

        source.onended = () => {
            isPlaying = false;
            currentSource = null;
            setState(STATES.IDLE);
            if (onComplete) {
                onComplete();
                onComplete = null;
            }
        };

        source.start(0);
    }

    /**
     * Stop current playback
     */
    function stop() {
        if (currentSource && isPlaying) {
            try {
                currentSource.stop();
            } catch (e) {
                // Already stopped
            }
            currentSource = null;
            isPlaying = false;
            setState(STATES.IDLE);
        }

        // Also stop any Web Speech fallback
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        // Call onComplete if there was a pending callback
        if (onComplete) {
            onComplete();
            onComplete = null;
        }
    }

    /**
     * Fallback to Web Speech API when Gemini fails
     * @param {string} text - Text to speak
     */
    function fallbackToWebSpeech(text) {
        console.log('Falling back to Web Speech API');

        if (!('speechSynthesis' in window)) {
            console.error('Web Speech API not supported');
            setState(STATES.IDLE);
            if (onComplete) {
                onComplete();
                onComplete = null;
            }
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to find a female voice
        const voices = speechSynthesis.getVoices();
        const preferredNames = ['Samantha', 'Karen', 'Victoria', 'Google US English Female', 'Microsoft Zira', 'Fiona'];

        for (const name of preferredNames) {
            const voice = voices.find(v =>
                v.name.toLowerCase().includes(name.toLowerCase()) &&
                v.lang.startsWith('en')
            );
            if (voice) {
                utterance.voice = voice;
                break;
            }
        }

        utterance.onstart = () => setState(STATES.SPEAKING);
        utterance.onend = () => {
            setState(STATES.IDLE);
            if (onComplete) {
                onComplete();
                onComplete = null;
            }
        };
        utterance.onerror = () => {
            setState(STATES.IDLE);
            if (onComplete) {
                onComplete();
                onComplete = null;
            }
        };

        speechSynthesis.speak(utterance);
    }

    /**
     * Get current state
     */
    function getState() {
        return currentState;
    }

    /**
     * Check if currently speaking
     */
    function isCurrentlySpeaking() {
        return isPlaying || currentState === STATES.SPEAKING;
    }

    /**
     * Change voice - disabled, Clara always uses Sulafat
     * @param {string} voiceName - Ignored, voice is fixed to Sulafat
     */
    function setVoice(voiceName) {
        // Voice is fixed to Sulafat for Clara
        console.log('GeminiTTS: Voice is fixed to Sulafat (Clara\'s voice)');
    }

    /**
     * Get current voice
     */
    function getVoice() {
        return CONFIG.voice;
    }

    /**
     * Get available voices - returns only Sulafat
     */
    function getAvailableVoices() {
        return ['Sulafat'];
    }

    /**
     * Unlock audio context (needed for browser autoplay policy)
     * Call this on user interaction
     */
    function unlockAudioContext() {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('AudioContext unlocked');
            }).catch(e => {
                console.warn('Failed to unlock AudioContext:', e);
            });
        }
    }

    /**
     * Warm up TTS by making a small request
     * Reduces latency on first real request
     */
    async function warmUp() {
        if (!apiKey) return;

        try {
            // Just verify the API is accessible, don't actually play anything
            console.log('GeminiTTS warming up...');
            // We could make a tiny request here, but for now just ensure AudioContext is ready
            if (audioContext && audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            console.log('GeminiTTS warm-up complete');
        } catch (e) {
            console.warn('GeminiTTS warm-up failed:', e);
        }
    }

    /**
     * Check if TTS is available (has API key)
     */
    function isAvailable() {
        // Re-check API key from config in case it was set after init
        if (!apiKey && window.ClaraConfig && window.ClaraConfig.apiKey) {
            apiKey = window.ClaraConfig.apiKey;
            console.log('[GeminiTTS] isAvailable: Updated API key from ClaraConfig');
        }
        return !!apiKey;
    }

    // Public API
    return {
        STATES,
        init,
        speak,
        stop,
        getState,
        isCurrentlySpeaking,
        setVoice,
        getVoice,
        getAvailableVoices,
        unlockAudioContext,
        warmUp,
        isAvailable,
        // Expose for advanced use
        generateSpeech,
        playAudio
    };

})();

// Make available on window object
window.GeminiTTS = GeminiTTS;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GeminiTTS;
}
