// Clara Configuration

// ============================================================
// HOSTED API KEY FOR LIMITED MODE
// Add your Gemini API key below to enable Limited mode for visitors
// Users get 3 sessions per 24 hours with this key
// ============================================================
const HOSTED_API_KEY = ''; // <-- ADD YOUR GEMINI API KEY HERE (Line 8)

// User's own API key (set dynamically, leave empty)
const GEMINI_API_KEY = '';

// Gemini API endpoint (Gemini 2.0 Flash)
const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Rate limiting configuration for Limited mode
const RATE_LIMIT_CONFIG = {
    maxSessions: 3,           // Maximum sessions per time window
    windowHours: 24,          // Time window in hours
    sessionKey: 'clara_limited_sessions'
};

// Export for use in other modules
window.ClaraConfig = {
    apiKey: GEMINI_API_KEY,
    hostedApiKey: HOSTED_API_KEY,
    endpoint: GEMINI_API_ENDPOINT,
    rateLimit: RATE_LIMIT_CONFIG
};

// Also expose as window.GEMINI_API_KEY for backwards compatibility
window.GEMINI_API_KEY = GEMINI_API_KEY;
window.HOSTED_API_KEY = HOSTED_API_KEY;
