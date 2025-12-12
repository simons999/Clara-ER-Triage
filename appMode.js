// appMode.js — Mode management, rate limiting, API key handling

const AppMode = (function() {

    const MODES = {
        DEMO: 'demo',
        LIMITED: 'limited',
        UNLIMITED: 'unlimited'
    };

    // State
    let currentMode = null;
    let userApiKey = null;
    let userIP = null;

    /**
     * Initialize mode manager
     */
    function init() {
        // Check if user has stored API key
        const storedKey = localStorage.getItem('clara_user_api_key');
        if (storedKey) {
            userApiKey = storedKey;
        }

        // Fetch user IP for rate limiting
        fetchUserIP();

        // Check if hosted API key is available
        updateLimitedModeAvailability();

        console.log('AppMode initialized');
    }

    // ============ IP & RATE LIMITING ============

    /**
     * Fetch user's IP address for rate limiting
     */
    async function fetchUserIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            userIP = data.ip;
            console.log('User IP fetched for rate limiting');
        } catch (e) {
            // Fallback: use a fingerprint based on available browser data
            userIP = generateBrowserFingerprint();
            console.log('Using browser fingerprint for rate limiting');
        }
    }

    /**
     * Generate a simple browser fingerprint as fallback
     */
    function generateBrowserFingerprint() {
        const nav = navigator;
        const screen = window.screen;
        const data = [
            nav.userAgent,
            nav.language,
            screen.width,
            screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset()
        ].join('|');

        // Simple hash
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'fp_' + Math.abs(hash).toString(36);
    }

    /**
     * Get rate limit data for current user
     */
    function getRateLimitData() {
        const config = window.ClaraConfig?.rateLimit || { maxSessions: 3, windowHours: 24, sessionKey: 'clara_limited_sessions' };
        const storageKey = config.sessionKey + '_' + (userIP || 'unknown');

        try {
            const data = localStorage.getItem(storageKey);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('Error reading rate limit data:', e);
        }

        return { sessions: [], ip: userIP };
    }

    /**
     * Save rate limit data
     */
    function saveRateLimitData(data) {
        const config = window.ClaraConfig?.rateLimit || { sessionKey: 'clara_limited_sessions' };
        const storageKey = config.sessionKey + '_' + (userIP || 'unknown');

        try {
            localStorage.setItem(storageKey, JSON.stringify(data));
        } catch (e) {
            console.error('Error saving rate limit data:', e);
        }
    }

    /**
     * Check if user can start a new session in Limited mode
     */
    function canStartLimitedSession() {
        const config = window.ClaraConfig?.rateLimit || { maxSessions: 3, windowHours: 24 };
        const data = getRateLimitData();
        const now = Date.now();
        const windowMs = config.windowHours * 60 * 60 * 1000;

        // Filter sessions within the time window
        const recentSessions = data.sessions.filter(ts => (now - ts) < windowMs);

        return recentSessions.length < config.maxSessions;
    }

    /**
     * Get remaining sessions for Limited mode
     */
    function getRemainingLimitedSessions() {
        const config = window.ClaraConfig?.rateLimit || { maxSessions: 3, windowHours: 24 };
        const data = getRateLimitData();
        const now = Date.now();
        const windowMs = config.windowHours * 60 * 60 * 1000;

        // Filter sessions within the time window
        const recentSessions = data.sessions.filter(ts => (now - ts) < windowMs);

        return Math.max(0, config.maxSessions - recentSessions.length);
    }

    /**
     * Get time until next session reset
     */
    function getTimeUntilReset() {
        const config = window.ClaraConfig?.rateLimit || { windowHours: 24 };
        const data = getRateLimitData();
        const now = Date.now();
        const windowMs = config.windowHours * 60 * 60 * 1000;

        if (data.sessions.length === 0) return null;

        // Find oldest session in window
        const oldestSession = Math.min(...data.sessions);
        const resetTime = oldestSession + windowMs;

        if (resetTime <= now) return null;

        const msRemaining = resetTime - now;
        const hours = Math.floor(msRemaining / (60 * 60 * 1000));
        const minutes = Math.floor((msRemaining % (60 * 60 * 1000)) / (60 * 1000));

        return { hours, minutes, totalMs: msRemaining };
    }

    /**
     * Record a new session for rate limiting
     */
    function recordLimitedSession() {
        const config = window.ClaraConfig?.rateLimit || { windowHours: 24 };
        const data = getRateLimitData();
        const now = Date.now();
        const windowMs = config.windowHours * 60 * 60 * 1000;

        // Clean up old sessions
        data.sessions = data.sessions.filter(ts => (now - ts) < windowMs);

        // Add new session
        data.sessions.push(now);
        data.ip = userIP;

        saveRateLimitData(data);

        console.log(`Limited session recorded. ${getRemainingLimitedSessions()} sessions remaining.`);
    }

    /**
     * Check if hosted API key is available and update UI
     */
    function updateLimitedModeAvailability() {
        const hostedKey = window.HOSTED_API_KEY || window.ClaraConfig?.hostedApiKey;
        const limitedBtn = document.getElementById('mode-limited-btn');

        if (limitedBtn) {
            if (hostedKey && hostedKey.length > 10) {
                limitedBtn.classList.remove('disabled');
                limitedBtn.disabled = false;
            } else {
                limitedBtn.classList.add('disabled');
                limitedBtn.disabled = true;
            }
        }
    }

    /**
     * Check if Limited mode is available (hosted key exists)
     */
    function isLimitedModeAvailable() {
        const hostedKey = window.HOSTED_API_KEY || window.ClaraConfig?.hostedApiKey;
        return hostedKey && hostedKey.length > 10;
    }

    // ============ MODE SELECTION ============

    /**
     * Select and activate a mode
     * @param {string} mode - Mode to select (demo, limited, unlimited)
     */
    function selectMode(mode) {
        currentMode = mode;
        localStorage.setItem('clara_mode', mode);

        // Sync API key to ClaraConfig for Clara module to use
        syncApiKeyToConfig();

        // Update mode indicator
        updateModeIndicator();

        switch (mode) {
            case MODES.DEMO:
                startDemoMode();
                break;
            case MODES.LIMITED:
                startLimitedMode();
                break;
            case MODES.UNLIMITED:
                startUnlimitedMode();
                break;
        }
    }

    /**
     * Sync current API key to window.ClaraConfig for Clara module
     */
    function syncApiKeyToConfig() {
        const apiKey = getApiKey();
        if (window.ClaraConfig) {
            window.ClaraConfig.apiKey = apiKey || '';
        }
        // Also update window.GEMINI_API_KEY for modules that use it directly
        window.GEMINI_API_KEY = apiKey || '';

        // Re-initialize Gemini TTS with the new API key
        if (apiKey && window.ClaraVoice && window.ClaraVoice.reinitGeminiTTS) {
            window.ClaraVoice.reinitGeminiTTS();
        }
    }

    /**
     * Get current mode
     */
    function getMode() {
        return currentMode;
    }

    /**
     * Get API key for current mode
     */
    function getApiKey() {
        switch (currentMode) {
            case MODES.DEMO:
                return null; // Demo doesn't use API
            case MODES.LIMITED:
                return window.HOSTED_API_KEY || window.ClaraConfig?.hostedApiKey || null;
            case MODES.UNLIMITED:
                return userApiKey;
            default:
                return null;
        }
    }

    /**
     * Check if app is in demo mode
     */
    function isDemoMode() {
        return currentMode === MODES.DEMO;
    }

    // ============ DEMO MODE ============

    function startDemoMode() {
        console.log('Starting demo mode');

        // Initialize demo scenario
        if (window.DemoScenario) {
            DemoScenario.init();
        }

        // Hide mode selection, show welcome screen
        hideModeSelection();
        showWelcomeScreen();
    }

    // ============ LIMITED MODE ============

    function startLimitedMode() {
        console.log('Starting limited mode');

        // Check if hosted API key is available
        if (!isLimitedModeAvailable()) {
            showRateLimitModal({
                title: 'Limited Mode Unavailable',
                message: 'Limited mode is not currently available. Please use your own API key with Unlimited mode.',
                showTimer: false
            });
            return;
        }

        // Check rate limit
        if (!canStartLimitedSession()) {
            const resetTime = getTimeUntilReset();
            showRateLimitModal({
                title: 'Session Limit Reached',
                message: `You've used all 3 sessions in the last 24 hours. Please wait for your sessions to reset, or use your own API key with Unlimited mode.`,
                showTimer: true,
                resetTime: resetTime
            });
            return;
        }

        // Record this session
        recordLimitedSession();

        // Show remaining sessions toast
        const remaining = getRemainingLimitedSessions();
        setTimeout(() => {
            showLimitedModeToast(`${remaining} session${remaining !== 1 ? 's' : ''} remaining today`);
        }, 1000);

        // Hide mode selection, show welcome screen
        hideModeSelection();
        showWelcomeScreen();
    }

    /**
     * Show rate limit modal
     */
    function showRateLimitModal(options) {
        const { title, message, showTimer, resetTime } = options;

        let timerHtml = '';
        if (showTimer && resetTime) {
            timerHtml = `
                <div class="rate-limit-timer">
                    <span class="timer-icon">⏱️</span>
                    <span class="timer-text">Next session available in: ${resetTime.hours}h ${resetTime.minutes}m</span>
                </div>
            `;
        }

        const modalHtml = `
            <div class="rate-limit-modal-overlay" onclick="AppMode.closeRateLimitModal()"></div>
            <div class="rate-limit-modal-content">
                <div class="rate-limit-icon">⏳</div>
                <h3 class="rate-limit-title">${title}</h3>
                <p class="rate-limit-message">${message}</p>
                ${timerHtml}
                <div class="rate-limit-actions">
                    <button class="rate-limit-btn primary" onclick="AppMode.closeRateLimitModal(); AppMode.selectMode('unlimited');">
                        🔑 Use My Own Key
                    </button>
                    <button class="rate-limit-btn secondary" onclick="AppMode.closeRateLimitModal();">
                        Close
                    </button>
                </div>
            </div>
        `;

        let modal = document.getElementById('rate-limit-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'rate-limit-modal';
            modal.className = 'rate-limit-modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = modalHtml;
        modal.classList.add('visible');
    }

    function closeRateLimitModal() {
        const modal = document.getElementById('rate-limit-modal');
        if (modal) {
            modal.classList.remove('visible');
        }
    }

    /**
     * Show toast notification for limited mode
     */
    function showLimitedModeToast(message) {
        let toast = document.getElementById('limited-mode-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'limited-mode-toast';
            toast.className = 'limited-mode-toast';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('visible');

        setTimeout(() => {
            toast.classList.remove('visible');
        }, 4000);
    }

    /**
     * Check if app is in limited mode
     */
    function isLimitedMode() {
        return currentMode === MODES.LIMITED;
    }

    // ============ UNLIMITED MODE (BYOK) ============

    function startUnlimitedMode() {
        // Check if user already has stored key
        if (userApiKey) {
            console.log('Starting unlimited mode with stored key');
            hideModeSelection();
            showWelcomeScreen();
        } else {
            // Show API key input
            showApiKeyScreen();
        }
    }

    function showApiKeyScreen() {
        hideModeSelection();
        const screen = document.getElementById('api-key-screen');
        if (screen) {
            screen.classList.add('active');
            screen.style.display = '';
            screen.style.pointerEvents = '';

            // Reset the form to its initial state
            resetApiKeyForm();
        }
    }

    /**
     * Reset the API key form to its initial state
     */
    function resetApiKeyForm() {
        const form = document.getElementById('api-key-form');
        const input = document.getElementById('api-key-input');
        const btn = document.getElementById('api-key-submit');
        const errorEl = document.getElementById('api-key-error');

        // Check if form was replaced with success message - restore it
        if (form && !input) {
            form.innerHTML = `
                <input type="password" id="api-key-input" class="api-key-input" placeholder="Paste your API key here">
                <p id="api-key-error" class="api-key-error"></p>
                <button id="api-key-submit" class="api-key-submit">Connect</button>
            `;

            // Re-attach event listeners
            const newInput = document.getElementById('api-key-input');
            const newBtn = document.getElementById('api-key-submit');

            if (newBtn) {
                newBtn.addEventListener('click', () => {
                    const key = newInput?.value;
                    if (key) submitApiKey(key);
                });
            }
            if (newInput) {
                newInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const key = newInput.value;
                        if (key) submitApiKey(key);
                    }
                });
            }
        } else {
            // Just reset existing form elements
            if (input) {
                input.value = '';
                input.disabled = false;
                input.classList.remove('shake');
            }
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Connect';
            }
            if (errorEl) {
                errorEl.textContent = '';
                errorEl.classList.remove('visible');
            }
        }
    }

    function hideApiKeyScreen() {
        const screen = document.getElementById('api-key-screen');
        if (screen) {
            screen.classList.remove('active');
        }
    }

    /**
     * Submit API key for validation
     */
    function submitApiKey(key) {
        if (!key || key.trim().length < 10) {
            showApiKeyError('Please enter a valid API key');
            return;
        }

        validateApiKey(key.trim());
    }

    /**
     * Validate API key with a test request
     */
    async function validateApiKey(key) {
        showApiKeyLoading();

        try {
            // Make a simple test call
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Hi' }] }]
                })
            });

            if (response.ok) {
                // Valid key!
                userApiKey = key;
                localStorage.setItem('clara_user_api_key', key);

                // Sync to ClaraConfig immediately so Clara can use it
                syncApiKeyToConfig();

                showApiKeySuccess();

                setTimeout(() => {
                    hideApiKeyScreen();
                    showWelcomeScreen();
                }, 1500);
            } else {
                const error = await response.json();
                showApiKeyError(error.error?.message || 'Invalid API key');
            }
        } catch (e) {
            showApiKeyError('Could not validate key. Check your connection.');
        }
    }

    function showApiKeyLoading() {
        const btn = document.getElementById('api-key-submit');
        const input = document.getElementById('api-key-input');

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Validating...';
        }
        if (input) {
            input.disabled = true;
        }
    }

    function showApiKeySuccess() {
        const container = document.getElementById('api-key-form');
        if (container) {
            container.innerHTML = `
                <div class="api-key-success">
                    <div class="success-icon">✓</div>
                    <div class="success-text">Connected!</div>
                    <div class="success-subtext">Starting Clara...</div>
                </div>
            `;
        }
    }

    function showApiKeyError(message) {
        const btn = document.getElementById('api-key-submit');
        const input = document.getElementById('api-key-input');
        const errorEl = document.getElementById('api-key-error');

        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Connect';
        }
        if (input) {
            input.disabled = false;
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 500);
        }
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.add('visible');
        }
    }

    /**
     * Clear stored API key and reset app to mode selection
     * @param {boolean} showModeScreen - Whether to show mode selection screen after clearing
     */
    function clearUserApiKey(showModeScreen = true) {
        // Clear internal state
        userApiKey = null;
        currentMode = null;

        // Clear from localStorage
        localStorage.removeItem('clara_user_api_key');
        localStorage.removeItem('clara_mode');

        // Clear from window objects that modules check
        if (window.ClaraConfig) {
            window.ClaraConfig.apiKey = '';
        }
        window.GEMINI_API_KEY = '';

        console.log('User API key cleared from all sources');

        // Reset the app and show mode selection
        if (showModeScreen) {
            // Reset the demo/conversation
            if (window.ClaraApp) {
                ClaraApp.resetDemo();
            }

            // Hide any active screens and show mode selection
            hideApiKeyScreen();
            showModeSelection();
        }

        return true;
    }

    /**
     * Check if user has stored API key
     */
    function hasStoredApiKey() {
        return !!localStorage.getItem('clara_user_api_key');
    }

    // ============ UI HELPERS ============

    function showModeSelection() {
        // Hide all other screens first
        const allScreens = document.querySelectorAll('.screen');
        allScreens.forEach(s => {
            s.classList.remove('active');
            s.style.pointerEvents = '';
        });

        // Show mode selection screen
        const screen = document.getElementById('mode-selection-screen');
        if (screen) {
            screen.classList.add('active');
            screen.style.display = '';
            screen.style.pointerEvents = '';
        }
    }

    function hideModeSelection() {
        const screen = document.getElementById('mode-selection-screen');
        if (screen) {
            screen.classList.remove('active');
        }
    }

    function showWelcomeScreen() {
        // Hide mode selection first
        hideModeSelection();
        // Hide API key screen if visible
        hideApiKeyScreen();
        // Show welcome screen
        if (window.ClaraApp) {
            ClaraApp.showScreen('welcome-screen');
        }
    }

    function updateModeIndicator() {
        const indicator = document.getElementById('mode-indicator');
        if (!indicator) return;

        switch (currentMode) {
            case MODES.DEMO:
                indicator.innerHTML = '<span class="mode-badge demo-badge">🎬 Demo</span>';
                indicator.style.display = 'block';
                break;
            case MODES.LIMITED:
                const remaining = getRemainingLimitedSessions();
                indicator.innerHTML = `<span class="mode-badge limited-badge">⚡ Limited (${remaining} left)</span>`;
                indicator.style.display = 'block';
                break;
            case MODES.UNLIMITED:
                indicator.innerHTML = '<span class="mode-badge unlimited-badge">🔑 Unlimited</span>';
                indicator.style.display = 'block';
                break;
            default:
                indicator.style.display = 'none';
        }
    }

    /**
     * Show app modal
     */
    function showAppModal(options) {
        const { title, icon, message, buttons } = options;

        let modalHtml = `
            <div class="app-modal-overlay" onclick="AppMode.closeModal()"></div>
            <div class="app-modal-content">
                ${icon ? `<div class="app-modal-icon">${icon}</div>` : ''}
                <h3 class="app-modal-title">${title}</h3>
                <p class="app-modal-message">${message}</p>
                <div class="app-modal-buttons">
        `;

        buttons.forEach(btn => {
            modalHtml += `<button class="app-modal-btn ${btn.style}" onclick="${btn.action.name ? btn.action.name + '()' : ''}">${btn.text}</button>`;
        });

        modalHtml += `
                </div>
            </div>
        `;

        // Create modal container
        let modal = document.getElementById('app-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'app-modal';
            modal.className = 'app-modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = modalHtml;
        modal.style.display = 'flex';

        // Store button actions for onclick
        window._modalActions = {};
        buttons.forEach((btn, i) => {
            window._modalActions[`modalAction${i}`] = () => {
                closeModal();
                btn.action();
            };
        });

        // Update button onclicks
        const modalBtns = modal.querySelectorAll('.app-modal-btn');
        modalBtns.forEach((el, i) => {
            el.onclick = window._modalActions[`modalAction${i}`];
        });
    }

    function closeModal() {
        const modal = document.getElementById('app-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    function showToast(message) {
        // Use existing toast system or create simple one
        if (window.ClaraApp && window.ClaraApp.showToast) {
            ClaraApp.showToast(message);
        } else {
            console.log('Toast:', message);
        }
    }

    // ============ PUBLIC API ============

    return {
        MODES,
        init,
        selectMode,
        getMode,
        getApiKey,
        isDemoMode,
        isLimitedMode,
        isLimitedModeAvailable,
        canStartLimitedSession,
        getRemainingLimitedSessions,
        getTimeUntilReset,
        submitApiKey,
        clearUserApiKey,
        hasStoredApiKey,
        showModeSelection,
        hideModeSelection,
        showApiKeyScreen,
        hideApiKeyScreen,
        closeModal,
        closeRateLimitModal,
        updateModeIndicator
    };

})();

// Make available on window object
window.AppMode = AppMode;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppMode;
}
