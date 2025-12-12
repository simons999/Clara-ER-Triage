// Clara Voice Mode - Speech Recognition and Text-to-Speech

// Voice state
let voiceRecognition = null;
let voiceRecognitionActive = false;
let silenceTimer = null;
let interimTranscript = '';
let finalTranscript = '';
let isProcessingVoice = false;
let isClaraSpeaking = false; // Track when Clara is speaking to ignore mic input

// Speech synthesis
let currentUtterance = null;
let preferredVoice = null;

// Microphone permission state
let microphonePermissionGranted = false;
let persistentAudioStream = null; // Keep stream open to prevent repeated permission prompts

// Configuration
const SILENCE_TIMEOUT = 1500; // 1.5 seconds of silence before processing
const VOICE_LANG = 'en-US';

// ========================================
// MICROPHONE PERMISSION HANDLING
// ========================================

/**
 * Request microphone permission and keep stream open
 * Keeping the stream open prevents browsers from re-prompting for permission
 * when SpeechRecognition restarts
 * @returns {Promise<boolean>} - Whether permission was granted
 */
async function requestMicrophonePermission() {
    // If we already have an active stream, permission is granted
    if (persistentAudioStream && persistentAudioStream.active) {
        console.log('Microphone stream already active');
        return true;
    }

    try {
        // Request permission via getUserMedia and KEEP the stream open
        console.log('Requesting microphone permission...');
        persistentAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        console.log('Microphone permission granted, keeping stream active');
        microphonePermissionGranted = true;
        return true;
    } catch (error) {
        console.error('Microphone permission denied:', error.name, error.message);
        microphonePermissionGranted = false;
        persistentAudioStream = null;
        return false;
    }
}

/**
 * Release the microphone stream when exiting voice mode
 */
function releaseMicrophoneStream() {
    if (persistentAudioStream) {
        persistentAudioStream.getTracks().forEach(track => track.stop());
        persistentAudioStream = null;
        console.log('Microphone stream released');
    }
}

// ========================================
// SPEECH RECOGNITION (Speech-to-Text)
// ========================================

/**
 * Initialize the SpeechRecognition instance
 * @returns {boolean} - Whether initialization was successful
 */
function initVoiceRecognition() {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.error('Speech recognition not supported in this browser');
        showVoiceError('Voice mode is not supported in this browser. Please use text mode instead.');
        return false;
    }

    voiceRecognition = new SpeechRecognition();

    // Configure recognition
    voiceRecognition.continuous = true;
    voiceRecognition.interimResults = true;
    voiceRecognition.lang = VOICE_LANG;
    voiceRecognition.maxAlternatives = 1;

    // Set up event handlers
    setupRecognitionHandlers();

    console.log('Voice recognition initialized');
    return true;
}

/**
 * Set up all event handlers for SpeechRecognition
 */
function setupRecognitionHandlers() {
    if (!voiceRecognition) return;

    voiceRecognition.onstart = () => {
        console.log('Voice recognition started');
        voiceRecognitionActive = true;
    };

    voiceRecognition.onaudiostart = () => {
        console.log('Audio capture started');
    };

    voiceRecognition.onsoundstart = () => {
        // User started making sound
        if (!isProcessingVoice && window.ClaraApp) {
            window.ClaraApp.setVoiceState('listening');
        }
    };

    voiceRecognition.onspeechstart = () => {
        // User started speaking
        clearSilenceTimer();
        if (!isProcessingVoice && window.ClaraApp) {
            window.ClaraApp.setVoiceState('listening');
        }
    };

    voiceRecognition.onspeechend = () => {
        // User stopped speaking - start silence timer
        startSilenceTimer();
    };

    voiceRecognition.onsoundend = () => {
        // Sound ended - also start silence timer as backup
        startSilenceTimer();
    };

    voiceRecognition.onresult = (event) => {
        handleRecognitionResult(event);
    };

    voiceRecognition.onerror = (event) => {
        handleRecognitionError(event);
    };

    voiceRecognition.onend = () => {
        console.log('Voice recognition ended');
        voiceRecognitionActive = false;

        // Auto-restart if we're still in voice mode and not processing
        // IMPORTANT: Only restart if we have an active microphone stream
        // This prevents restarts after voice mode has been exited
        if (shouldRestartRecognition()) {
            setTimeout(() => {
                // Double-check conditions before restarting
                if (shouldRestartRecognition()) {
                    console.log('Auto-restarting recognition...');
                    startListening();
                } else {
                    console.log('Not restarting - conditions no longer met');
                }
            }, 100);
        } else {
            console.log('Not restarting recognition - shouldRestartRecognition returned false');
        }
    };
}

/**
 * Handle speech recognition results
 */
function handleRecognitionResult(event) {
    interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
            finalTranscript += transcript + ' ';
            console.log('Final transcript:', transcript);
        } else {
            interimTranscript += transcript;
        }
    }

    // Update UI with interim transcript
    updateInterimDisplay(interimTranscript || finalTranscript.trim());

    // Reset silence timer when we get new results
    if (finalTranscript.trim()) {
        startSilenceTimer();
    }
}

/**
 * Handle speech recognition errors
 */
function handleRecognitionError(event) {
    console.error('Speech recognition error:', event.error);

    switch (event.error) {
        case 'no-speech':
            // This is normal - user is just quiet, keep listening
            console.log('No speech detected, continuing to listen...');
            break;

        case 'audio-capture':
            showVoiceError('Microphone not available. Please check your microphone settings.');
            break;

        case 'not-allowed':
            // Reset permission state so we re-request on next attempt
            microphonePermissionGranted = false;
            showVoiceError('Microphone access denied. Please allow microphone access to use voice mode.');
            offerTextModeFallback();
            break;

        case 'network':
            showVoiceError('Network error. Please check your connection.');
            // Try to restart after a delay
            setTimeout(() => {
                if (shouldRestartRecognition()) {
                    startListening();
                }
            }, 2000);
            break;

        case 'aborted':
            // Recognition was stopped intentionally
            console.log('Recognition aborted');
            break;

        default:
            console.log('Unhandled recognition error:', event.error);
    }
}

/**
 * Start listening for voice input
 * Returns a Promise to handle async permission request
 */
async function startListening() {
    // Ensure we have microphone permission before starting
    // This prevents repeated permission prompts
    if (!persistentAudioStream || !persistentAudioStream.active) {
        console.log('[Voice] No active mic stream, requesting permission first...');
        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
            console.error('[Voice] Cannot start listening - no microphone permission');
            return false;
        }
    } else {
        console.log('[Voice] Using existing mic stream');
    }

    if (!voiceRecognition) {
        if (!initVoiceRecognition()) {
            return false;
        }
    }

    // Check if already running
    if (voiceRecognitionActive) {
        console.log('[Voice] Recognition already active, not starting again');
        return true;
    }

    // Reset transcripts
    interimTranscript = '';
    finalTranscript = '';
    isProcessingVoice = false;

    try {
        voiceRecognition.start();
        if (window.ClaraApp) {
            window.ClaraApp.setVoiceState('idle');
        }
        console.log('[Voice] Started listening');
        return true;
    } catch (error) {
        if (error.name === 'InvalidStateError') {
            // Already started, that's okay
            console.log('[Voice] Recognition already running');
            return true;
        }
        console.error('[Voice] Failed to start listening:', error);
        return false;
    }
}

/**
 * Stop listening for voice input
 */
function stopListening() {
    clearSilenceTimer();

    if (voiceRecognition && voiceRecognitionActive) {
        try {
            voiceRecognition.stop();
            console.log('Stopped listening');
        } catch (error) {
            console.error('Failed to stop listening:', error);
        }
    }

    voiceRecognitionActive = false;
    interimTranscript = '';
    finalTranscript = '';
}

/**
 * Check if recognition should restart
 */
function shouldRestartRecognition() {
    const currentMode = window.ClaraApp?.getCurrentMode();
    // Also check that we have an active microphone stream
    // If stream was released, don't restart (user exited voice mode)
    const hasActiveStream = persistentAudioStream && persistentAudioStream.active;
    // Don't restart while Clara is speaking (to avoid picking up TTS audio)
    return currentMode === 'voice' && !isProcessingVoice && !currentUtterance && !isClaraSpeaking && hasActiveStream;
}

/**
 * Start the silence timer
 */
function startSilenceTimer() {
    clearSilenceTimer();

    silenceTimer = setTimeout(() => {
        if (finalTranscript.trim() && !isProcessingVoice) {
            processVoiceInput(finalTranscript.trim());
        }
    }, SILENCE_TIMEOUT);
}

/**
 * Clear the silence timer
 */
function clearSilenceTimer() {
    if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
    }
}

/**
 * Process the voice input and send to Clara
 */
async function processVoiceInput(transcript) {
    if (!transcript || isProcessingVoice) return;

    console.log('Processing voice input:', transcript);
    isProcessingVoice = true;

    // Stop listening while processing
    stopListening();

    // Update state to processing
    if (window.ClaraApp) {
        window.ClaraApp.setVoiceState('processing');
    }

    // Clear the interim display
    updateInterimDisplay('');

    // Reset transcripts
    finalTranscript = '';
    interimTranscript = '';

    try {
        // Add user's message to the chat (for history)
        if (window.ClaraApp) {
            window.ClaraApp.addMessage(transcript, 'user');
        }

        // Send to Clara API
        const response = await window.Clara.sendMessage(transcript);

        // Show field update notifications
        if (response.fieldUpdates && response.fieldUpdates.length > 0 && window.ClaraApp) {
            response.fieldUpdates.forEach(update => {
                window.ClaraApp.showFieldNotification(update.field);
            });
        }

        // Handle actions from Clara's response (voice review commands)
        if (response.actions && response.actions.length > 0 && window.ClaraApp) {
            window.ClaraApp.handleActions(response.actions);
        }

        // Handle report complete - show choice or read aloud
        if (response.reportComplete && window.ClaraApp) {
            window.ClaraApp.handleReportComplete();
        }

        // Speak Clara's response
        speakResponse(response.message, () => {
            isProcessingVoice = false;
            // Resume listening after speaking
            if (window.ClaraApp?.getCurrentMode() === 'voice') {
                startListening();
            }
        });

    } catch (error) {
        console.error('Error processing voice input:', error);

        // Speak error message
        speakResponse("I'm having trouble understanding right now. Could you please try again?", () => {
            isProcessingVoice = false;
            if (window.ClaraApp?.getCurrentMode() === 'voice') {
                startListening();
            }
        });
    }
}

/**
 * Update the interim transcript display
 */
function updateInterimDisplay(text) {
    const statusText = document.getElementById('voice-status-text');
    if (statusText && text) {
        // Show what user is saying
        statusText.textContent = text;
        statusText.classList.add('transcript');
    } else if (statusText) {
        statusText.classList.remove('transcript');
    }
}

// ========================================
// TEXT-TO-SPEECH (Clara Speaking with Gemini TTS)
// ========================================

// Use Gemini TTS as primary, Web Speech API as fallback
let useGeminiTTS = true;

/**
 * Initialize Gemini TTS
 */
function initGeminiTTS() {
    // Get API key from ClaraConfig (user-provided) or fallback to window.GEMINI_API_KEY
    const apiKey = (window.ClaraConfig && window.ClaraConfig.apiKey) || window.GEMINI_API_KEY;

    if (window.GeminiTTS && apiKey) {
        GeminiTTS.init(apiKey, handleTTSStateChange);
        console.log('Gemini TTS initialized for Clara voice');
    } else {
        console.warn('Gemini TTS not available (no API key), will use Web Speech fallback');
        useGeminiTTS = false;
    }
}

/**
 * Re-initialize Gemini TTS with a new API key
 * Called when user provides their API key
 */
function reinitGeminiTTS() {
    const apiKey = (window.ClaraConfig && window.ClaraConfig.apiKey) || window.GEMINI_API_KEY;

    if (window.GeminiTTS && apiKey) {
        GeminiTTS.init(apiKey, handleTTSStateChange);
        useGeminiTTS = true;
        console.log('Gemini TTS re-initialized with new API key');
        return true;
    }
    return false;
}

/**
 * Handle TTS state changes from GeminiTTS
 */
function handleTTSStateChange(state) {
    if (!window.ClaraApp) return;

    switch (state) {
        case GeminiTTS.STATES.LOADING:
            window.ClaraApp.setVoiceState('processing');
            break;
        case GeminiTTS.STATES.SPEAKING:
            window.ClaraApp.setVoiceState('responding');
            break;
        case GeminiTTS.STATES.IDLE:
            window.ClaraApp.setVoiceState('idle');
            break;
        case GeminiTTS.STATES.ERROR:
            // Will fallback to Web Speech, state handled there
            break;
    }
}

/**
 * Get the preferred voice for Clara (Web Speech fallback)
 */
function getPreferredVoice() {
    if (preferredVoice) return preferredVoice;

    const voices = speechSynthesis.getVoices();

    // Preferred voice names (in order of preference)
    const preferredNames = [
        'Samantha',
        'Karen',
        'Victoria',
        'Google US English Female',
        'Microsoft Zira',
        'female',
        'Fiona',
        'Moira'
    ];

    // Try to find a preferred voice
    for (const name of preferredNames) {
        const voice = voices.find(v =>
            v.name.toLowerCase().includes(name.toLowerCase()) &&
            v.lang.startsWith('en')
        );
        if (voice) {
            preferredVoice = voice;
            console.log('Selected Web Speech voice:', voice.name);
            return voice;
        }
    }

    // Fallback: any English female voice
    const englishVoice = voices.find(v =>
        v.lang.startsWith('en') &&
        (v.name.toLowerCase().includes('female') || !v.name.toLowerCase().includes('male'))
    );

    if (englishVoice) {
        preferredVoice = englishVoice;
        return englishVoice;
    }

    // Last resort: first English voice
    const anyEnglish = voices.find(v => v.lang.startsWith('en'));
    if (anyEnglish) {
        preferredVoice = anyEnglish;
        return anyEnglish;
    }

    return null;
}

/**
 * Speak Clara's response using Gemini TTS (with Web Speech fallback)
 * @param {string} text - The text to speak
 * @param {function} onComplete - Callback when speaking is complete
 * @param {boolean} skipAddMessage - If true, skip adding message to chat (for text mode TTS where message already added)
 */
function speakResponse(text, onComplete, skipAddMessage = false) {
    if (!text) {
        if (onComplete) onComplete();
        return;
    }

    // Stop any current speech first
    stopSpeaking();

    // Stop listening while Clara speaks (prevents picking up TTS audio)
    stopListening();
    isClaraSpeaking = true;

    // Add message to chat history (unless skipped - e.g., in text mode where message already added)
    if (window.ClaraApp && !skipAddMessage) {
        window.ClaraApp.addMessage(text, 'clara');
    }

    // Wrapper to handle completion and restart listening
    const handleComplete = () => {
        console.log('Clara finished speaking');
        isClaraSpeaking = false;
        if (onComplete) onComplete();
    };

    // Try Gemini TTS first
    if (useGeminiTTS && window.GeminiTTS && GeminiTTS.isAvailable()) {
        console.log('Speaking with Gemini TTS (Sulafat voice):', text.substring(0, 50) + '...');

        // Set state to processing immediately for smooth transition
        if (window.ClaraApp) {
            window.ClaraApp.setVoiceState('processing');
        }

        GeminiTTS.speak(text, handleComplete);
    } else {
        // Fallback to Web Speech API
        speakWithWebSpeech(text, handleComplete);
    }
}

/**
 * Speak using Web Speech API (fallback)
 * @param {string} text - The text to speak
 * @param {function} onComplete - Callback when speaking is complete
 */
function speakWithWebSpeech(text, onComplete) {
    // Check for speech synthesis support
    if (!window.speechSynthesis) {
        console.error('Speech synthesis not supported');
        if (onComplete) onComplete();
        return;
    }

    console.log('Speaking with Web Speech API:', text.substring(0, 50) + '...');

    // Create utterance
    currentUtterance = new SpeechSynthesisUtterance(text);

    // Configure voice
    const voice = getPreferredVoice();
    if (voice) {
        currentUtterance.voice = voice;
    }

    currentUtterance.rate = 0.95;
    currentUtterance.pitch = 1.0;
    currentUtterance.volume = 1.0;

    // Set state to responding
    if (window.ClaraApp) {
        window.ClaraApp.setVoiceState('responding');
    }

    // Handle completion
    currentUtterance.onend = () => {
        console.log('Web Speech finished speaking');
        currentUtterance = null;

        if (window.ClaraApp) {
            window.ClaraApp.setVoiceState('idle');
        }

        if (onComplete) onComplete();
    };

    currentUtterance.onerror = (event) => {
        console.error('Speech synthesis error:', event.error);
        currentUtterance = null;

        if (window.ClaraApp) {
            window.ClaraApp.setVoiceState('idle');
        }

        if (onComplete) onComplete();
    };

    // Start speaking
    speechSynthesis.speak(currentUtterance);
}

/**
 * Stop Clara from speaking
 */
function stopSpeaking() {
    // Stop Gemini TTS if active
    if (window.GeminiTTS) {
        GeminiTTS.stop();
    }

    // Also stop Web Speech
    if (window.speechSynthesis && speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    currentUtterance = null;
    isClaraSpeaking = false;
}

/**
 * Check if Clara is currently speaking
 */
function isSpeaking() {
    // Check both TTS systems
    const geminiSpeaking = window.GeminiTTS && GeminiTTS.isCurrentlySpeaking();
    const webSpeechSpeaking = window.speechSynthesis && speechSynthesis.speaking;
    return geminiSpeaking || webSpeechSpeaking || currentUtterance !== null;
}

/**
 * Toggle between Gemini TTS and Web Speech
 */
function toggleTTSEngine() {
    useGeminiTTS = !useGeminiTTS;
    console.log('TTS engine:', useGeminiTTS ? 'Gemini (Sulafat)' : 'Web Speech');
    return useGeminiTTS;
}

/**
 * Set TTS voice (for Gemini TTS)
 */
function setTTSVoice(voiceName) {
    if (window.GeminiTTS) {
        GeminiTTS.setVoice(voiceName);
    }
}

/**
 * Get available TTS voices
 */
function getAvailableTTSVoices() {
    if (window.GeminiTTS) {
        return GeminiTTS.getAvailableVoices();
    }
    return [];
}

// ========================================
// VOICE MODE LIFECYCLE
// ========================================

/**
 * Enter voice mode - initialize and start listening
 * @param {boolean} speakGreeting - Whether to speak Clara's greeting
 */
async function enterVoiceMode(speakGreeting = true) {
    console.log('Entering voice mode');

    // Request microphone permission FIRST before doing anything else
    // This prevents repeated permission prompts when SpeechRecognition restarts
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
        console.error('Microphone permission not granted');
        showVoiceError('Microphone access is required for voice mode. Please allow microphone access and try again.');
        offerTextModeFallback();
        return false;
    }

    // Initialize Gemini TTS if available
    initGeminiTTS();

    // Unlock audio context (needed for browser autoplay policy)
    if (window.GeminiTTS) {
        GeminiTTS.unlockAudioContext();
    }

    // Initialize recognition if needed
    if (!voiceRecognition) {
        if (!initVoiceRecognition()) {
            // Fall back to text mode
            offerTextModeFallback();
            return false;
        }
    }

    // Warm up TTS for faster first response
    if (window.GeminiTTS) {
        GeminiTTS.warmUp();
    }

    // Initialize conversation and get greeting
    if (speakGreeting) {
        try {
            const response = await window.Clara.initConversation();

            // Speak the greeting
            speakResponse(response.message, () => {
                // Start listening after greeting
                startListening();
            });
        } catch (error) {
            console.error('Error initializing voice conversation:', error);
            // Use fallback greeting
            speakResponse("Hi, I'm Clara. I'm here to help prepare the ER for your arrival. Tell me, what's happening right now?", () => {
                startListening();
            });
        }
    } else {
        // Just start listening
        startListening();
    }

    return true;
}

/**
 * Exit voice mode - clean up
 */
function exitVoiceMode() {
    console.log('Exiting voice mode');

    stopListening();
    stopSpeaking();
    clearSilenceTimer();

    // Release the microphone stream
    releaseMicrophoneStream();

    isProcessingVoice = false;
    interimTranscript = '';
    finalTranscript = '';
}

/**
 * Handle user interruption (started speaking while Clara is speaking)
 */
function handleInterruption() {
    if (isSpeaking()) {
        console.log('User interrupted Clara');
        stopSpeaking();

        // Small delay before resuming listening
        setTimeout(() => {
            if (window.ClaraApp?.getCurrentMode() === 'voice') {
                startListening();
            }
        }, 100);
    }
}

// ========================================
// ERROR HANDLING & FALLBACKS
// ========================================

/**
 * Show voice error message
 */
function showVoiceError(message) {
    console.error('Voice error:', message);

    const statusText = document.getElementById('voice-status-text');
    if (statusText) {
        statusText.textContent = message;
        statusText.classList.add('error');

        // Clear error after a few seconds
        setTimeout(() => {
            statusText.classList.remove('error');
        }, 5000);
    }
}

/**
 * Offer to switch to text mode
 */
function offerTextModeFallback() {
    // Automatically switch to text mode after showing error
    setTimeout(() => {
        if (window.ClaraApp) {
            window.ClaraApp.switchToMode('text');
        }
    }, 3000);
}

// ========================================
// DEMO HELPERS
// ========================================

/**
 * Simulate voice input for demo purposes
 * @param {string} text - The text to simulate as voice input
 */
function simulateVoiceInput(text) {
    console.log('Simulating voice input:', text);
    processVoiceInput(text);
}

// ========================================
// VOICE LOAD HANDLING
// ========================================

// Load voices when available (needed for some browsers)
if (window.speechSynthesis) {
    // Chrome needs this
    speechSynthesis.onvoiceschanged = () => {
        getPreferredVoice();
    };

    // Try to load immediately too
    getPreferredVoice();
}

// ========================================
// EXPORTS
// ========================================

window.ClaraVoice = {
    // Microphone permission
    requestMicrophonePermission,
    releaseMicrophoneStream,
    hasMicrophonePermission: () => microphonePermissionGranted,
    hasActiveMicStream: () => persistentAudioStream && persistentAudioStream.active,

    // Core functions
    initVoiceRecognition,
    startListening,
    stopListening,
    processVoiceInput,

    // Speech synthesis (Gemini TTS + Web Speech fallback)
    speakResponse,
    stopSpeaking,
    isSpeaking,
    getPreferredVoice,

    // Gemini TTS specific
    initGeminiTTS,
    reinitGeminiTTS,
    toggleTTSEngine,
    setTTSVoice,
    getAvailableTTSVoices,
    isUsingGeminiTTS: () => useGeminiTTS,

    // Lifecycle
    enterVoiceMode,
    exitVoiceMode,

    // Utilities
    handleInterruption,
    simulateVoiceInput,

    // State
    isListening: () => voiceRecognitionActive,
    isProcessing: () => isProcessingVoice
};
