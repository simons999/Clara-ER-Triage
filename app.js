// Clara ER Pre-Arrival Triage App

// State management
let currentScreen = 'welcome-screen';
let erDashboardVisible = false;
let currentMode = null; // 'voice' or 'text'
let messages = [];
let voiceState = 'idle'; // 'idle', 'listening', 'processing', 'responding'

// Report Data (exported to window for clara.js access)
window.reportData = {
    chiefComplaint: null,
    consciousness: null,
    bleeding: null,
    painLevel: null,
    painLocation: null,
    mobility: null,
    breathing: null,
    allergies: null,
    medications: null,
    medicalHistory: null,
    destination: null,
    eta: null,
    photos: [],
    photosCount: null
};
let reportData = window.reportData;

// Report field metadata (exported to window for clara.js access)
window.reportFields = [
    { key: 'chiefComplaint', label: 'Chief Complaint', status: 'pending' },
    { key: 'consciousness', label: 'Consciousness', status: 'pending' },
    { key: 'painLevel', label: 'Pain Level', status: 'pending' },
    { key: 'painLocation', label: 'Pain Location', status: 'pending' },
    { key: 'bleeding', label: 'Bleeding', status: 'pending' },
    { key: 'mobility', label: 'Mobility', status: 'pending' },
    { key: 'breathing', label: 'Breathing', status: 'pending' },
    { key: 'allergies', label: 'Allergies', status: 'pending' },
    { key: 'medications', label: 'Current Medications', status: 'pending' },
    { key: 'medicalHistory', label: 'Medical History', status: 'pending' }
];
const reportFields = window.reportFields;

// API state
let isWaitingForResponse = false;

// Report sheet hold state
let reportHoldTimer = null;
let reportHoldStartPos = { x: 0, y: 0 };
let reportIsHolding = false;
let reportIsExpanded = false;

// Confirmation screen state
let companionMode = false;
let sentReportData = null;
let currentEditField = null;
let miniClaraContext = null;

// Voice state demo cycling
let voiceDemoCycleTimer = null;

// Voice review mode state
let voiceReviewMode = false;
let voiceConfirmHintTimer = null;
let voiceConfirmHintVisible = false;

// TTS state for text mode
let textModeTTSEnabled = false;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Initialize the application
function initializeApp() {
    // Initialize sync system first
    if (window.ClaraSync) {
        ClaraSync.init();
    }

    // Initialize mode manager with hosted API key
    if (window.AppMode) {
        const hostedKey = window.GEMINI_API_KEY || null;
        AppMode.init(hostedKey);
    }

    setupEventListeners();
    // Start with clean report (no demo data)
    renderReportFields();
    updateReportStatus();

    // Check if returning user with stored API key
    if (window.AppMode && AppMode.hasStoredApiKey()) {
        showReturningUserModal();
    } else {
        // Show mode selection (default screen now)
    }
}

/**
 * Show modal for returning users with stored API key
 */
function showReturningUserModal() {
    const modal = document.createElement('div');
    modal.className = 'returning-user-modal';
    modal.id = 'returning-user-modal';
    modal.innerHTML = `
        <div class="returning-user-overlay" onclick="closeReturningUserModal()"></div>
        <div class="returning-user-content">
            <div class="returning-user-icon">👋</div>
            <h3>Welcome back!</h3>
            <p>Continue with your saved API key?</p>
            <div class="returning-user-buttons">
                <button class="returning-user-btn secondary" onclick="closeReturningUserModal()">
                    Choose Different Mode
                </button>
                <button class="returning-user-btn primary" onclick="useStoredApiKey()">
                    Use Saved Key
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeReturningUserModal() {
    const modal = document.getElementById('returning-user-modal');
    if (modal) {
        modal.remove();
    }
}

function useStoredApiKey() {
    closeReturningUserModal();
    if (window.AppMode) {
        AppMode.selectMode(AppMode.MODES.UNLIMITED);
    }
}

// Initialize demo report data
function initializeDemoReportData() {
    updateReportField('chiefComplaint', 'Fell from ladder, right arm pain');
    setFieldStatus('chiefComplaint', 'collected');

    updateReportField('consciousness', 'Alert and oriented');
    setFieldStatus('consciousness', 'collected');

    updateReportField('painLevel', '7/10');
    setFieldStatus('painLevel', 'collected');

    updateReportField('painLocation', 'Right forearm');
    setFieldStatus('painLocation', 'collected');

    setFieldStatus('bleeding', 'asking');

    renderReportFields();
    updateReportStatus();
}

// Set up all event listeners
function setupEventListeners() {
    // Demo controller buttons
    const toggleErBtn = document.getElementById('toggle-er-btn');
    const resetDemoBtn = document.getElementById('reset-demo-btn');
    const showConfirmBtn = document.getElementById('show-confirm-btn');
    const backToDemoPickerBtn = document.getElementById('back-to-demo-picker-btn');

    if (toggleErBtn) {
        toggleErBtn.addEventListener('click', toggleERDashboard);
    }

    if (resetDemoBtn) {
        resetDemoBtn.addEventListener('click', resetDemo);
    }

    if (backToDemoPickerBtn) {
        backToDemoPickerBtn.addEventListener('click', () => {
            // Hide ER dashboard
            const dashboard = document.getElementById('er-dashboard');
            if (dashboard) {
                dashboard.classList.add('hidden');
            }
            // Show mode selection screen
            if (typeof AppMode !== 'undefined' && AppMode.showModeSelection) {
                AppMode.showModeSelection();
            }
        });
    }

    // Clear API Key button
    const clearApiKeyBtn = document.getElementById('clear-api-key-btn');
    if (clearApiKeyBtn) {
        clearApiKeyBtn.addEventListener('click', handleClearApiKey);
    }

    // Info button
    const infoBtn = document.getElementById('info-btn');
    const infoModal = document.getElementById('info-modal');
    const infoModalClose = document.getElementById('info-modal-close');
    const infoModalOverlay = infoModal?.querySelector('.info-modal-overlay');

    if (infoBtn && infoModal) {
        infoBtn.addEventListener('click', () => {
            infoModal.classList.add('visible');
        });
    }

    if (infoModalClose) {
        infoModalClose.addEventListener('click', () => {
            infoModal.classList.remove('visible');
        });
    }

    if (infoModalOverlay) {
        infoModalOverlay.addEventListener('click', () => {
            infoModal.classList.remove('visible');
        });
    }

    if (showConfirmBtn) {
        showConfirmBtn.addEventListener('click', () => {
            // Add some sample data if empty for demo
            if (!reportData.chiefComplaint) {
                reportData.chiefComplaint = 'Fell from ladder, right arm injury';
                reportData.painLevel = '8/10';
                reportData.painLocation = 'Right forearm';
                reportData.mobility = 'Cannot move right wrist';
                reportData.bleeding = 'None visible';
                reportData.consciousness = 'Alert and oriented';
                reportData.allergies = 'None known';
                reportData.destination = 'City General ER';
                reportData.eta = '~8 minutes';

                // Update field statuses
                ['chiefComplaint', 'painLevel', 'painLocation', 'mobility', 'bleeding', 'consciousness', 'allergies'].forEach(field => {
                    const f = reportFields.find(x => x.key === field);
                    if (f) f.status = 'collected';
                });

                renderReportFields();
                updateReportStatus();
            }
            showConfirmationScreen();
        });
    }

    // Welcome screen mode buttons
    const speakButton = document.querySelector('.speak-button');
    const typeButton = document.querySelector('.type-button');

    if (speakButton) {
        speakButton.addEventListener('click', () => handleModeSelection('voice'));
    }

    if (typeButton) {
        typeButton.addEventListener('click', () => handleModeSelection('text'));
    }

    // 911 emergency button (global) - Demo only
    const emergencyButton = document.querySelector('.emergency-911-global');
    if (emergencyButton) {
        emergencyButton.addEventListener('click', () => {
            console.log('911 button clicked (demo only)');
        });
    }

    // Mode toggle buttons (in both views)
    const modeToggleText = document.getElementById('mode-toggle-text');
    const modeToggleVoice = document.getElementById('mode-toggle-voice');

    if (modeToggleText) {
        modeToggleText.addEventListener('click', () => switchToMode('voice'));
    }

    if (modeToggleVoice) {
        modeToggleVoice.addEventListener('click', () => switchToMode('text'));
    }

    // Text input handlers
    const sendBtn = document.getElementById('send-btn');
    const messageInput = document.getElementById('message-input');

    if (sendBtn) {
        sendBtn.addEventListener('click', handleSendMessage);
    }

    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }

    // Report sheet press-and-hold
    setupReportHoldInteraction();

    // Report overlay click to collapse
    const overlay = document.getElementById('report-overlay');
    if (overlay) {
        overlay.addEventListener('click', collapseReportSheet);
    }

    // Keyboard shortcut for debug (press 'D' to show debug controls)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'd' || e.key === 'D') {
            const debug = document.getElementById('voice-debug');
            if (debug) {
                debug.style.display = debug.style.display === 'none' ? 'flex' : 'none';
            }
        }
    });

    // Photo buttons
    const photoBtnText = document.getElementById('photo-btn-text');
    const photoBtnVoice = document.getElementById('photo-btn-voice');

    if (photoBtnText) {
        photoBtnText.addEventListener('click', () => {
            if (window.ClaraPhoto) {
                window.ClaraPhoto.openPhotoOptions();
            }
        });
    }

    if (photoBtnVoice) {
        photoBtnVoice.addEventListener('click', () => {
            if (window.ClaraPhoto) {
                window.ClaraPhoto.openPhotoOptions();
            }
        });
    }

    // Voice View Report button
    const voiceViewReportBtn = document.getElementById('voice-view-report-btn');
    if (voiceViewReportBtn) {
        voiceViewReportBtn.addEventListener('click', () => {
            openConfirmationFromVoice();
        });
    }

    // Sample photo button for demo
    const addSamplePhotoBtn = document.getElementById('add-sample-photo-btn');
    if (addSamplePhotoBtn) {
        addSamplePhotoBtn.addEventListener('click', () => {
            if (window.ClaraPhoto && currentMode) {
                window.ClaraPhoto.addSamplePhoto();
            } else {
                console.log('Please start a conversation first');
            }
        });
    }

    // ========================================
    // TTS Controls
    // ========================================

    // TTS toggle button for text mode
    const ttsToggleBtn = document.getElementById('tts-toggle-btn');
    if (ttsToggleBtn) {
        ttsToggleBtn.addEventListener('click', toggleTextModeTTS);
    }

    // Test voice button
    const testVoiceBtn = document.getElementById('test-voice-btn');
    if (testVoiceBtn) {
        testVoiceBtn.addEventListener('click', testClaraVoice);
    }

    // Voice selector for demo
    const voiceSelector = document.getElementById('voice-selector');
    if (voiceSelector) {
        voiceSelector.addEventListener('change', (e) => {
            if (window.GeminiTTS) {
                GeminiTTS.setVoice(e.target.value);
                // Test the new voice
                GeminiTTS.speak("Voice changed.", () => {
                    console.log('Voice test complete');
                });
            } else if (window.ClaraVoice) {
                ClaraVoice.setTTSVoice(e.target.value);
            }
        });
    }

    // ========================================
    // Confirmation Screen Event Listeners
    // ========================================

    // Back button (header)
    const confirmBackBtn = document.getElementById('confirm-back-btn');
    if (confirmBackBtn) {
        confirmBackBtn.addEventListener('click', hideConfirmationScreen);
    }

    // Back to conversation button (bottom)
    const confirmBackToChatBtn = document.getElementById('confirm-back-to-chat-btn');
    if (confirmBackToChatBtn) {
        confirmBackToChatBtn.addEventListener('click', hideConfirmationScreen);
    }

    // Send to ER button
    const confirmSendBtn = document.getElementById('confirm-send-btn');
    if (confirmSendBtn) {
        confirmSendBtn.addEventListener('click', sendReportToER);
    }

    // Edit destination button
    const editDestinationBtn = document.getElementById('edit-destination-btn');
    if (editDestinationBtn) {
        editDestinationBtn.addEventListener('click', () => openFieldEditor('destination'));
    }

    // Add more info button
    const confirmAddInfoBtn = document.getElementById('confirm-add-info-btn');
    if (confirmAddInfoBtn) {
        confirmAddInfoBtn.addEventListener('click', () => openMiniClaraChat('addInfo'));
    }

    // Add photo button on confirmation screen
    const confirmAddPhotoBtn = document.getElementById('confirm-add-photo-btn');
    if (confirmAddPhotoBtn) {
        confirmAddPhotoBtn.addEventListener('click', () => {
            if (window.ClaraPhoto) {
                window.ClaraPhoto.openPhotoOptions();
            }
        });
    }

    // Edit field modal
    const editModalClose = document.getElementById('edit-modal-close');
    const editModalOverlay = document.querySelector('.edit-modal-overlay');
    const editOptionManual = document.getElementById('edit-option-manual');
    const editOptionClara = document.getElementById('edit-option-clara');

    if (editModalClose) {
        editModalClose.addEventListener('click', closeEditFieldModal);
    }
    if (editModalOverlay) {
        editModalOverlay.addEventListener('click', closeEditFieldModal);
    }
    if (editOptionManual) {
        editOptionManual.addEventListener('click', openManualEditModal);
    }
    if (editOptionClara) {
        editOptionClara.addEventListener('click', () => openMiniClaraChat('editField'));
    }

    // Manual edit modal
    const manualEditClose = document.getElementById('manual-edit-close');
    const manualEditOverlay = document.querySelector('.manual-edit-overlay');
    const manualEditCancel = document.getElementById('manual-edit-cancel');
    const manualEditSave = document.getElementById('manual-edit-save');
    const manualEditInput = document.getElementById('manual-edit-input');

    if (manualEditClose) {
        manualEditClose.addEventListener('click', closeManualEditModal);
    }
    if (manualEditOverlay) {
        manualEditOverlay.addEventListener('click', closeManualEditModal);
    }
    if (manualEditCancel) {
        manualEditCancel.addEventListener('click', closeManualEditModal);
    }
    if (manualEditSave) {
        manualEditSave.addEventListener('click', saveManualEdit);
    }
    if (manualEditInput) {
        manualEditInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveManualEdit();
            }
        });
    }

    // Mini Clara chat modal
    const miniClaraClose = document.getElementById('mini-clara-close');
    const miniClaraOverlay = document.querySelector('.mini-clara-overlay');
    const miniClaraSend = document.getElementById('mini-clara-send');
    const miniClaraInput = document.getElementById('mini-clara-input');

    if (miniClaraClose) {
        miniClaraClose.addEventListener('click', closeMiniClaraChat);
    }
    if (miniClaraOverlay) {
        miniClaraOverlay.addEventListener('click', closeMiniClaraChat);
    }
    if (miniClaraSend) {
        miniClaraSend.addEventListener('click', sendMiniClaraMessage);
    }
    if (miniClaraInput) {
        miniClaraInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMiniClaraMessage();
            }
        });
    }

    // Report sent screen buttons
    const sentContinueBtn = document.getElementById('sent-continue-btn');
    const sentViewBtn = document.getElementById('sent-view-btn');

    if (sentContinueBtn) {
        sentContinueBtn.addEventListener('click', returnToConversation);
    }
    if (sentViewBtn) {
        sentViewBtn.addEventListener('click', viewSentReport);
    }
}

// ========================================
// Voice Mode State Management
// ========================================

function setVoiceState(state) {
    // state: 'idle', 'listening', 'processing', 'responding'
    voiceState = state;

    const blob = document.getElementById('voice-blob');
    const statusText = document.getElementById('voice-status-text');

    if (!blob || !statusText) return;

    // Remove all state classes
    blob.classList.remove('idle', 'listening', 'processing', 'responding');

    // Add new state class
    blob.classList.add(state);

    // Update status text (unless showing transcript)
    if (!statusText.classList.contains('transcript')) {
        const statusMessages = {
            idle: "I'm listening...",
            listening: "Listening...",
            processing: "Processing...",
            responding: "Clara is speaking..."
        };
        statusText.textContent = statusMessages[state] || '';
    }
}

function startVoiceDemoCycle() {
    // Cycle through states for demo
    const states = ['idle', 'listening', 'responding'];
    let currentIndex = 0;

    setVoiceState(states[currentIndex]);

    voiceDemoCycleTimer = setInterval(() => {
        currentIndex = (currentIndex + 1) % states.length;
        setVoiceState(states[currentIndex]);
    }, 3000);
}

function stopVoiceDemoCycle() {
    if (voiceDemoCycleTimer) {
        clearInterval(voiceDemoCycleTimer);
        voiceDemoCycleTimer = null;
    }
}

// ========================================
// Report Sheet Press-and-Hold
// ========================================

function setupReportHoldInteraction() {
    const mini = document.getElementById('report-mini');
    if (!mini) return;

    // Mouse events
    mini.addEventListener('mousedown', startReportHold);
    document.addEventListener('mousemove', checkReportHoldMove);
    document.addEventListener('mouseup', endReportHold);

    // Touch events
    mini.addEventListener('touchstart', startReportHold, { passive: false });
    document.addEventListener('touchmove', checkReportHoldMove, { passive: false });
    document.addEventListener('touchend', endReportHold);

    // Prevent context menu on long press
    mini.addEventListener('contextmenu', (e) => e.preventDefault());
}

function startReportHold(e) {
    e.preventDefault();

    // Get starting position
    if (e.type === 'touchstart') {
        reportHoldStartPos = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
    } else {
        reportHoldStartPos = {
            x: e.clientX,
            y: e.clientY
        };
    }

    const mini = document.getElementById('report-mini');
    mini.classList.add('holding');
    reportIsHolding = true;

    // Start hold timer (150ms delay before expanding)
    reportHoldTimer = setTimeout(() => {
        if (reportIsHolding) {
            expandReportSheet();
        }
    }, 150);
}

function checkReportHoldMove(e) {
    if (!reportIsHolding) return;

    let currentPos;
    if (e.type === 'touchmove') {
        currentPos = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
    } else {
        currentPos = {
            x: e.clientX,
            y: e.clientY
        };
    }

    // Calculate distance moved
    const dx = currentPos.x - reportHoldStartPos.x;
    const dy = currentPos.y - reportHoldStartPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If moved more than 15px, cancel the hold
    if (distance > 15) {
        cancelReportHold();
    }
}

function endReportHold() {
    if (!reportIsHolding && !reportIsExpanded) return;

    cancelReportHold();

    // Collapse if expanded
    if (reportIsExpanded) {
        collapseReportSheet();
    }
}

function cancelReportHold() {
    reportIsHolding = false;

    if (reportHoldTimer) {
        clearTimeout(reportHoldTimer);
        reportHoldTimer = null;
    }

    const mini = document.getElementById('report-mini');
    if (mini) {
        mini.classList.remove('holding');
    }
}

function expandReportSheet() {
    const sheet = document.getElementById('report-sheet');
    const overlay = document.getElementById('report-overlay');

    if (sheet) {
        sheet.classList.add('expanded');
    }

    if (overlay) {
        overlay.classList.add('visible');
    }

    reportIsExpanded = true;
}

function collapseReportSheet() {
    const sheet = document.getElementById('report-sheet');
    const overlay = document.getElementById('report-overlay');
    const mini = document.getElementById('report-mini');

    if (sheet) {
        sheet.classList.remove('expanded');
    }

    if (overlay) {
        overlay.classList.remove('visible');
    }

    if (mini) {
        mini.classList.remove('holding');
    }

    reportIsExpanded = false;
    reportIsHolding = false;
}

// ========================================
// Report Data Management
// ========================================

function updateReportField(fieldName, value) {
    if (reportData.hasOwnProperty(fieldName)) {
        reportData[fieldName] = value;
        renderReportFields();
        updateReportStatus();
    }
}

function setFieldStatus(fieldName, status) {
    const field = reportFields.find(f => f.key === fieldName);
    if (field) {
        field.status = status;
        renderReportFields();
        updateReportStatus();
    }
}

function getReportProgress() {
    const total = reportFields.length;
    const collected = reportFields.filter(f => f.status === 'collected').length;
    return { collected, total };
}

function renderReportFields() {
    const container = document.getElementById('report-fields');
    if (!container) return;

    // Render photos section first
    const photos = reportData.photos || [];
    let photosHtml = '';

    if (photos.length > 0) {
        photosHtml = `
            <div class="report-photos-section">
                <div class="report-photos-header">
                    <span class="report-photos-label">Photos</span>
                    <span class="report-photos-count">${photos.length}</span>
                </div>
                <div class="report-photos-grid">
                    ${photos.map(photo => `
                        <img
                            class="report-photo-thumb"
                            src="data:${photo.mimeType};base64,${photo.thumbnail || photo.base64}"
                            alt="Attached photo"
                            data-photo-id="${photo.id}"
                            onclick="viewReportPhoto('${photo.id}')"
                        >
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Render regular fields
    const fieldsHtml = reportFields.map(field => {
        // Skip photos field in regular fields
        if (field.key === 'photos' || field.key === 'photosCount') return '';

        const value = reportData[field.key];
        const status = field.status;

        let statusIcon = '—';
        let statusClass = 'pending';
        let valueClass = 'empty';
        let displayValue = '—';

        if (status === 'collected' && value) {
            statusIcon = '✓';
            statusClass = 'collected';
            valueClass = '';
            displayValue = value;
        } else if (status === 'asking') {
            statusIcon = '⏳';
            statusClass = 'asking';
            valueClass = 'asking';
            displayValue = 'Asking...';
        }

        return `
            <div class="report-field" data-field="${field.key}">
                <div class="field-content">
                    <div class="field-label">${field.label}</div>
                    <div class="field-value ${valueClass}">${displayValue}</div>
                </div>
                <div class="field-status ${statusClass}">${statusIcon}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = photosHtml + fieldsHtml;
}

function updateReportStatus() {
    const { collected, total } = getReportProgress();

    const statusEl = document.getElementById('report-status');
    if (statusEl) {
        if (collected === 0) {
            statusEl.textContent = 'Gathering info...';
        } else if (collected === total) {
            statusEl.textContent = 'Complete!';
        } else {
            statusEl.textContent = `${collected} of ${total} fields`;
        }
    }

    const progressEl = document.getElementById('report-progress');
    if (progressEl) {
        progressEl.textContent = `${collected} of ${total} fields`;
    }

    const destEl = document.getElementById('destination-value');
    if (destEl) {
        destEl.textContent = reportData.destination || 'Not yet selected';
    }

    const etaEl = document.getElementById('eta-value');
    if (etaEl) {
        etaEl.textContent = reportData.eta || '—';
    }
}

// ========================================
// Mode Selection and Switching
// ========================================

async function handleModeSelection(mode) {
    currentMode = mode;
    console.log(`Mode set: ${mode}`);

    messages = [];
    const chatArea = document.getElementById('chat-area');
    if (chatArea) {
        chatArea.innerHTML = '';
    }

    // Clear any existing report data
    clearReportData();

    setTimeout(async () => {
        showScreen('conversation-screen');
        updateModeView();

        // Check if we're in demo mode - use demo scenario instead of real API
        const isDemoMode = window.AppMode && AppMode.isDemoMode();

        if (mode === 'voice') {
            // Start real voice mode
            setTimeout(() => {
                if (isDemoMode && window.DemoScenario) {
                    // Start demo scenario for voice mode
                    DemoScenario.start();
                } else if (window.ClaraVoice) {
                    window.ClaraVoice.enterVoiceMode(true);
                } else {
                    // Fallback to demo cycle if voice not available
                    console.warn('Voice module not loaded, using demo cycle');
                    setVoiceState('idle');
                    startVoiceDemoCycle();
                }
            }, 300);
        } else {
            // Text mode
            if (isDemoMode && window.DemoScenario) {
                // Start demo scenario for text mode
                DemoScenario.start();
            } else {
                // Real API conversation
                showTypingIndicator();

                try {
                    const response = await window.Clara.initConversation();
                    hideTypingIndicator();
                    addMessage(response.message, 'clara');
                } catch (error) {
                    console.error('Error initializing conversation:', error);
                    hideTypingIndicator();
                    // Fallback greeting if API fails
                    addMessage("Hi, I'm Clara. I'm here to help prepare the ER for your arrival. Tell me — what's happening right now?", 'clara');
                }
            }
        }
    }, 200);
}

function clearReportData() {
    // Reset all report data
    Object.keys(window.reportData).forEach(key => {
        if (key === 'photos') {
            window.reportData[key] = [];
        } else {
            window.reportData[key] = null;
        }
    });

    // Clear photo lookup
    window.claraPhotos = {};

    // Reset field statuses
    window.reportFields.forEach(field => {
        field.status = 'pending';
    });

    // Reset confirmation screen state
    if (window.Clara) window.Clara.setReportComplete(false);
    companionMode = false;
    sentReportData = null;

    // Reset voice review mode state
    voiceReviewMode = false;
    hideVoiceConfirmHint();

    // Reset report mini bar
    const reportStatus = document.getElementById('report-status');
    if (reportStatus) {
        reportStatus.textContent = 'Gathering info...';
        reportStatus.classList.remove('sent');
    }

    // Reset send button if needed
    const sendBtn = document.getElementById('confirm-send-btn');
    const sendBtnText = sendBtn?.querySelector('.send-btn-text');
    if (sendBtn) {
        sendBtn.classList.remove('sending');
        if (sendBtnText) sendBtnText.textContent = 'Send to ER';
    }

    renderReportFields();
    updateReportStatus();
}

function switchToMode(mode) {
    if (currentMode === mode) return;

    // Clean up voice mode if switching away
    if (currentMode === 'voice') {
        stopVoiceDemoCycle();
        if (window.ClaraVoice) {
            window.ClaraVoice.exitVoiceMode();
        }
    }

    currentMode = mode;
    updateModeView();

    if (mode === 'voice') {
        // Start voice mode (without speaking greeting since conversation already started)
        if (window.ClaraVoice) {
            window.ClaraVoice.enterVoiceMode(false);
        } else {
            setVoiceState('idle');
            startVoiceDemoCycle();
        }
    }
}

function updateModeView() {
    const textView = document.getElementById('text-mode-view');
    const voiceView = document.getElementById('voice-mode-view');

    if (!textView || !voiceView) return;

    if (currentMode === 'voice') {
        textView.style.display = 'none';
        voiceView.style.display = 'flex';
    } else {
        textView.style.display = 'flex';
        voiceView.style.display = 'none';
        // Focus input
        const input = document.getElementById('message-input');
        if (input) {
            setTimeout(() => input.focus(), 100);
        }
    }
}

// ========================================
// Message Handling
// ========================================

function addMessage(text, sender) {
    const message = { text, sender, id: Date.now() };
    messages.push(message);
    renderMessage(message);
    scrollToBottom();
}

function renderMessage(message) {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;

    const bubble = document.createElement('div');
    bubble.className = `message ${message.sender}`;
    bubble.textContent = message.text;
    chatArea.appendChild(bubble);
}

function scrollToBottom() {
    const chatArea = document.getElementById('chat-area');
    if (chatArea) {
        requestAnimationFrame(() => {
            chatArea.scrollTop = chatArea.scrollHeight;
        });
    }
}

async function handleSendMessage() {
    const input = document.getElementById('message-input');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    // Prevent sending while waiting for response
    if (isWaitingForResponse) return;

    // Check if in demo mode - advance demo script instead
    if (window.AppMode && AppMode.isDemoMode()) {
        input.value = '';
        if (window.DemoScenario && DemoScenario.isActive()) {
            // In demo mode, user typing triggers the demo to advance
            DemoScenario.userRespond();
        }
        return;
    }

    // Limited mode uses session-based rate limiting (handled at mode selection)
    // No per-message rate limiting needed

    addMessage(text, 'user');
    input.value = '';

    // Show typing indicator
    showTypingIndicator();
    isWaitingForResponse = true;

    try {
        // Send message to Clara API
        const response = await window.Clara.sendMessage(text);

        // Hide typing indicator
        hideTypingIndicator();

        // Show Clara's response
        addMessage(response.message, 'clara');

        // Speak if TTS enabled in text mode
        if (textModeTTSEnabled && window.GeminiTTS && GeminiTTS.isAvailable()) {
            GeminiTTS.speak(response.message);
        } else if (textModeTTSEnabled && window.ClaraVoice) {
            // Fallback to ClaraVoice (Web Speech) - skip adding message since already added above
            ClaraVoice.speakResponse(response.message, null, true);
        }

        // Show field update notifications
        if (response.fieldUpdates && response.fieldUpdates.length > 0) {
            response.fieldUpdates.forEach(update => {
                showFieldNotification(update.field);
            });
        }

        // Handle actions (voice review commands)
        if (response.actions && response.actions.length > 0) {
            handleActions(response.actions);
        }

        // Handle report complete
        if (response.reportComplete) {
            console.log('Report marked as complete by Clara');
            handleReportComplete();
            // Show choice buttons for text mode
            showReportReadyChoice();
        }
    } catch (error) {
        console.error('Error sending message:', error);
        hideTypingIndicator();

        // Show friendly error message
        addMessage("I'm having trouble connecting. Let me try again in a moment.", 'clara');
    } finally {
        isWaitingForResponse = false;
    }
}

function showTypingIndicator() {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;

    // Remove any existing typing indicator
    hideTypingIndicator();

    const indicator = document.createElement('div');
    indicator.className = 'message clara typing-indicator';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    chatArea.appendChild(indicator);
    scrollToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function showFieldNotification(fieldName) {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;

    // Format field name for display
    const label = formatFieldLabel(fieldName);

    const notification = document.createElement('div');
    notification.className = 'field-notification';
    notification.innerHTML = `<span class="notification-icon">✓</span> ${label} added to report`;
    chatArea.appendChild(notification);
    scrollToBottom();

    // Auto-remove after a few seconds (optional)
    setTimeout(() => {
        notification.classList.add('fade-out');
    }, 3000);
}

function formatFieldLabel(fieldName) {
    return fieldName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

// ========================================
// Screen Navigation
// ========================================

function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');

    screens.forEach(screen => {
        screen.classList.remove('active');
        // Reset any inline display styles that might override CSS
        if (screen.style.display === 'flex' || screen.style.display === 'block') {
            screen.style.display = '';
        }
    });

    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        // Remove any inline display:none that might override CSS
        targetScreen.style.display = '';
        targetScreen.style.pointerEvents = '';
        targetScreen.classList.add('active');
        currentScreen = screenId;
    }
}

function toggleERDashboard() {
    const erDashboard = document.getElementById('er-dashboard');
    const mainContainer = document.getElementById('main-container');

    if (!erDashboard || !mainContainer) return;

    erDashboardVisible = !erDashboardVisible;

    if (erDashboardVisible) {
        erDashboard.classList.remove('hidden');
        mainContainer.classList.add('er-visible');
    } else {
        erDashboard.classList.add('hidden');
        mainContainer.classList.remove('er-visible');
    }
}

function resetDemo() {
    currentMode = null;
    isWaitingForResponse = false;

    messages = [];
    const chatArea = document.getElementById('chat-area');
    if (chatArea) {
        chatArea.innerHTML = '';
    }

    // Reset report data
    clearReportData();
    collapseReportSheet();
    stopVoiceDemoCycle();
    hideTypingIndicator();

    // Clean up voice mode
    if (window.ClaraVoice) {
        window.ClaraVoice.exitVoiceMode();
    }

    if (erDashboardVisible) {
        toggleERDashboard();
    }

    showScreen('welcome-screen');
    console.log('Demo reset');
}

/**
 * Handle Clear API Key button click
 * Shows confirmation and clears all stored API key data
 */
function handleClearApiKey() {
    // Check if there's actually a key to clear
    if (!window.AppMode || !AppMode.hasStoredApiKey()) {
        showSuccessToast('No API key stored');
        return;
    }

    // Confirm with user
    if (confirm('Clear your stored API key? You will need to enter it again to use unlimited mode.')) {
        // Clear the API key
        AppMode.clearUserApiKey(true);
        showSuccessToast('API key cleared');
    }
}

// ========================================
// Photo Viewer Helper
// ========================================

function viewReportPhoto(photoId) {
    // Get photo from lookup or report data
    const imageData = window.claraPhotos?.[photoId];

    if (imageData && window.ClaraPhoto) {
        window.ClaraPhoto.showPhotoViewer(imageData);
        return;
    }

    // Fallback: find in report data
    const photo = window.reportData?.photos?.find(p => p.id === photoId);
    if (photo && window.ClaraPhoto) {
        window.ClaraPhoto.showPhotoViewer({
            base64: photo.base64,
            mimeType: photo.mimeType
        });
    }
}

// Make globally accessible
window.viewReportPhoto = viewReportPhoto;

// ========================================
// Confirmation Screen Functions
// ========================================

/**
 * Format field name from camelCase to readable format
 */
function formatFieldName(camelCase) {
    // Special cases
    if (camelCase === 'eta') return 'ETA';
    if (camelCase === 'er') return 'ER';

    return camelCase
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

/**
 * Show the "Review & Send Report" button in chat
 */
function showReviewReportButton() {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;

    // Don't add if already exists
    if (document.querySelector('.review-report-btn')) return;

    const button = document.createElement('button');
    button.className = 'review-report-btn';
    button.innerHTML = '<span class="review-icon">📋</span> Review & Send Report';
    button.addEventListener('click', showConfirmationScreen);

    chatArea.appendChild(button);
    scrollToBottom();
}

/**
 * Show the confirmation screen
 */
function showConfirmationScreen() {
    renderConfirmationFields();
    renderConfirmationPhotos();
    updateConfirmationDestination();
    const screen = document.getElementById('confirmation-screen');
    if (screen) screen.style.pointerEvents = 'auto';
    showScreen('confirmation-screen');
}

/**
 * Hide the confirmation screen and return to conversation
 */
function hideConfirmationScreen() {
    const screen = document.getElementById('confirmation-screen');
    if (screen) screen.style.pointerEvents = 'none';
    showScreen('conversation-screen');
    updateModeView();
}

/**
 * Render all report fields in the confirmation screen
 */
function renderConfirmationFields() {
    const container = document.getElementById('confirm-fields');
    if (!container) return;

    // Get all fields that have values (skip photos, destination, eta)
    const skipFields = ['photos', 'photosCount', 'destination', 'eta'];

    let fieldsHtml = '';

    // First render the known fields in order
    reportFields.forEach(field => {
        if (skipFields.includes(field.key)) return;

        const value = reportData[field.key];
        if (!value && field.status !== 'collected') return;

        fieldsHtml += createConfirmFieldHtml(field.key, field.label, value);
    });

    // Then render any dynamic fields not in reportFields
    Object.keys(reportData).forEach(key => {
        if (skipFields.includes(key)) return;
        if (reportFields.find(f => f.key === key)) return; // Already rendered

        const value = reportData[key];
        if (!value) return;

        const label = formatFieldName(key);
        fieldsHtml += createConfirmFieldHtml(key, label, value);
    });

    container.innerHTML = fieldsHtml;

    // Add click handlers to edit buttons
    container.querySelectorAll('.confirm-field-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const fieldName = btn.dataset.field;
            openFieldEditor(fieldName);
        });
    });
}

/**
 * Create HTML for a confirmation field row
 */
function createConfirmFieldHtml(fieldKey, label, value) {
    return `
        <div class="confirm-field" data-field="${fieldKey}">
            <div class="confirm-field-content">
                <div class="confirm-field-label">${label}</div>
                <div class="confirm-field-value">${value || '—'}</div>
            </div>
            <button class="confirm-field-edit" data-field="${fieldKey}" title="Edit ${label}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
        </div>
    `;
}

/**
 * Render photos in the confirmation screen
 */
function renderConfirmationPhotos() {
    const grid = document.getElementById('confirm-photos-grid');
    const countEl = document.getElementById('confirm-photos-count');
    const section = document.getElementById('confirm-photos-section');

    if (!grid || !countEl) return;

    const photos = reportData.photos || [];
    countEl.textContent = photos.length;

    if (photos.length === 0) {
        grid.innerHTML = '<span class="confirm-photos-empty">No photos attached</span>';
        return;
    }

    grid.innerHTML = photos.map(photo => `
        <div class="confirm-photo-item">
            <img
                class="confirm-photo-thumb"
                src="data:${photo.mimeType};base64,${photo.thumbnail || photo.base64}"
                alt="Attached photo"
                data-photo-id="${photo.id}"
                onclick="viewReportPhoto('${photo.id}')"
            >
        </div>
    `).join('');
}

/**
 * Update the destination card in confirmation screen
 */
function updateConfirmationDestination() {
    const nameEl = document.getElementById('confirm-dest-name');
    const etaEl = document.getElementById('confirm-dest-eta');
    const warningEl = document.getElementById('confirm-dest-warning');

    if (!nameEl) return;

    const destination = reportData.destination;
    const eta = reportData.eta;

    if (destination) {
        nameEl.textContent = destination;
        nameEl.classList.remove('empty');
        if (warningEl) warningEl.style.display = 'none';
    } else {
        nameEl.textContent = 'No destination selected';
        nameEl.classList.add('empty');
        if (warningEl) warningEl.style.display = 'flex';
    }

    if (etaEl) {
        etaEl.textContent = eta ? `ETA: ${eta}` : '';
    }
}

/**
 * Open the field editor modal
 */
function openFieldEditor(fieldName) {
    currentEditField = fieldName;

    const modal = document.getElementById('edit-field-modal');
    const title = document.getElementById('edit-modal-title');

    if (!modal) return;

    const label = formatFieldName(fieldName);
    if (title) title.textContent = `Edit ${label}`;

    modal.style.pointerEvents = 'auto';
    modal.classList.add('visible');
}

/**
 * Close the field editor modal
 */
function closeEditFieldModal() {
    const modal = document.getElementById('edit-field-modal');
    if (modal) {
        modal.classList.remove('visible');
        modal.style.pointerEvents = 'none';
    }
}

/**
 * Open the manual edit modal
 */
function openManualEditModal() {
    closeEditFieldModal();

    const modal = document.getElementById('manual-edit-modal');
    const title = document.getElementById('manual-edit-title');
    const input = document.getElementById('manual-edit-input');

    if (!modal || !currentEditField) return;

    const label = formatFieldName(currentEditField);
    if (title) title.textContent = `Edit ${label}`;

    // Pre-fill with current value
    const currentValue = reportData[currentEditField] || '';
    if (input) {
        input.value = currentValue;
        setTimeout(() => input.focus(), 100);
    }

    modal.style.pointerEvents = 'auto';
    modal.classList.add('visible');
}

/**
 * Close the manual edit modal
 */
function closeManualEditModal() {
    const modal = document.getElementById('manual-edit-modal');
    if (modal) {
        modal.classList.remove('visible');
        modal.style.pointerEvents = 'none';
    }
}

/**
 * Save the manual edit
 */
function saveManualEdit() {
    const input = document.getElementById('manual-edit-input');
    if (!input || !currentEditField) return;

    const newValue = input.value.trim();
    if (newValue) {
        // Update report data
        reportData[currentEditField] = newValue;

        // Update field status if needed
        const field = reportFields.find(f => f.key === currentEditField);
        if (field) {
            field.status = 'collected';
        } else {
            // Add dynamic field
            reportFields.push({
                key: currentEditField,
                label: formatFieldName(currentEditField),
                status: 'collected'
            });
        }

        // Re-render
        renderConfirmationFields();
        updateConfirmationDestination();
        renderReportFields();
        updateReportStatus();
    }

    closeManualEditModal();
    currentEditField = null;
}

/**
 * Open the mini Clara chat modal
 * @param {string} context - 'editField', 'addInfo', or 'addDestination'
 */
function openMiniClaraChat(context) {
    closeEditFieldModal();

    miniClaraContext = context;
    const modal = document.getElementById('mini-clara-modal');
    const messagesContainer = document.getElementById('mini-clara-messages');
    const input = document.getElementById('mini-clara-input');

    if (!modal || !messagesContainer) return;

    // Clear previous messages
    messagesContainer.innerHTML = '';

    // Add initial Clara message based on context
    let initialMessage = '';
    let placeholder = '';

    if (context === 'editField' && currentEditField) {
        const label = formatFieldName(currentEditField);
        const currentValue = reportData[currentEditField] || 'not set';
        initialMessage = `I see ${label} is currently "${currentValue}". What would you like to change it to?`;
        placeholder = `Change ${label} to...`;
    } else if (context === 'addInfo') {
        initialMessage = "What additional information would you like to add to the report?";
        placeholder = "Tell me what to add...";
    } else {
        initialMessage = "What can I help you with?";
        placeholder = "Tell Clara...";
    }

    addMiniClaraMessage(initialMessage, 'clara');

    if (input) {
        input.placeholder = placeholder;
        setTimeout(() => input.focus(), 100);
    }

    modal.style.pointerEvents = 'auto';
    modal.classList.add('visible');
}

/**
 * Close the mini Clara chat modal
 */
function closeMiniClaraChat() {
    const modal = document.getElementById('mini-clara-modal');
    if (modal) {
        modal.classList.remove('visible');
        modal.style.pointerEvents = 'none';
    }
    miniClaraContext = null;
    currentEditField = null;
}

/**
 * Add a message to the mini Clara chat
 */
function addMiniClaraMessage(text, sender) {
    const messagesContainer = document.getElementById('mini-clara-messages');
    if (!messagesContainer) return;

    const message = document.createElement('div');
    message.className = `mini-message ${sender}`;
    message.textContent = text;
    messagesContainer.appendChild(message);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Show typing indicator in mini Clara chat
 */
function showMiniTypingIndicator() {
    const messagesContainer = document.getElementById('mini-clara-messages');
    if (!messagesContainer) return;

    const typing = document.createElement('div');
    typing.className = 'mini-message clara mini-typing';
    typing.id = 'mini-typing-indicator';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messagesContainer.appendChild(typing);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Hide typing indicator in mini Clara chat
 */
function hideMiniTypingIndicator() {
    const indicator = document.getElementById('mini-typing-indicator');
    if (indicator) indicator.remove();
}

/**
 * Send message in mini Clara chat
 */
async function sendMiniClaraMessage() {
    const input = document.getElementById('mini-clara-input');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    // Add user message
    addMiniClaraMessage(text, 'user');
    input.value = '';

    // Show typing
    showMiniTypingIndicator();

    try {
        // Build a context-aware message for Clara
        let contextMessage = text;

        if (miniClaraContext === 'editField' && currentEditField) {
            contextMessage = `Please update my ${formatFieldName(currentEditField)} to: ${text}`;
        } else if (miniClaraContext === 'addInfo') {
            contextMessage = `Please add this to my report: ${text}`;
        }

        // Send to Clara API
        const response = await window.Clara.sendMessage(contextMessage);

        hideMiniTypingIndicator();
        addMiniClaraMessage(response.message, 'clara');

        // If fields were updated, refresh the confirmation screen
        if (response.fieldUpdates && response.fieldUpdates.length > 0) {
            setTimeout(() => {
                renderConfirmationFields();
                updateConfirmationDestination();
                renderConfirmationPhotos();
                // Also update the main report card
                renderReportFields();
                updateReportStatus();
            }, 500);
        }

        // Auto-close after a short delay if update was made
        if (response.fieldUpdates && response.fieldUpdates.length > 0) {
            setTimeout(() => {
                closeMiniClaraChat();
            }, 1500);
        }

    } catch (error) {
        console.error('Mini Clara chat error:', error);
        hideMiniTypingIndicator();
        addMiniClaraMessage("I'm having trouble right now. You can try editing manually instead.", 'clara');
    }
}

/**
 * Send the report to the ER
 */
async function sendReportToER() {
    const sendBtn = document.getElementById('confirm-send-btn');
    const sendBtnText = sendBtn?.querySelector('.send-btn-text');

    // Check for minimum required fields
    if (!reportData.chiefComplaint) {
        alert('Please add a chief complaint before sending.');
        return;
    }

    // Show sending state
    if (sendBtn) {
        sendBtn.classList.add('sending');
        if (sendBtnText) sendBtnText.textContent = 'Sending';
    }

    try {
        // Store the sent report data
        sentReportData = JSON.parse(JSON.stringify(reportData));

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Broadcast to ER Dashboard via ClaraSync (works across tabs)
        if (window.ClaraSync) {
            ClaraSync.broadcast(ClaraSync.EVENTS.NEW_PATIENT, {
                patient: sentReportData,
                timestamp: Date.now()
            });
        }

        // Enable companion mode
        companionMode = true;

        // Update report mini bar to show "Report Sent"
        const reportStatus = document.getElementById('report-status');
        if (reportStatus) {
            reportStatus.textContent = 'Report Sent';
            reportStatus.classList.add('sent');
        }

        // Show the report sent screen
        showReportSentScreen();

    } catch (error) {
        console.error('Error sending report:', error);
        if (sendBtn) {
            sendBtn.classList.remove('sending');
            if (sendBtnText) sendBtnText.textContent = 'Send to ER';
        }
        alert('Failed to send report. Please try again.');
    }
}

/**
 * Show the report sent success screen
 */
function showReportSentScreen() {
    const destEl = document.getElementById('sent-destination');
    if (destEl) {
        const destination = sentReportData?.destination || 'the ER';
        destEl.textContent = `to ${destination}`;
    }

    // Hide confirmation screen pointer events
    const confirmScreen = document.getElementById('confirmation-screen');
    if (confirmScreen) confirmScreen.style.pointerEvents = 'none';

    // Show sent screen with pointer events
    const sentScreen = document.getElementById('report-sent-screen');
    if (sentScreen) sentScreen.style.pointerEvents = 'auto';

    showScreen('report-sent-screen');
}

/**
 * Return to conversation in companion mode
 */
function returnToConversation() {
    // Reset pointer events on sent screen
    const sentScreen = document.getElementById('report-sent-screen');
    if (sentScreen) sentScreen.style.pointerEvents = 'none';

    showScreen('conversation-screen');
    updateModeView();

    // Focus input if in text mode
    if (currentMode === 'text') {
        const input = document.getElementById('message-input');
        if (input) setTimeout(() => input.focus(), 100);
    }
}

/**
 * View the sent report (read-only)
 */
function viewSentReport() {
    // Reset pointer events on sent screen
    const sentScreen = document.getElementById('report-sent-screen');
    if (sentScreen) sentScreen.style.pointerEvents = 'none';

    // Show confirmation screen with sent data (it already has the data)
    const confirmScreen = document.getElementById('confirmation-screen');
    if (confirmScreen) confirmScreen.style.pointerEvents = 'auto';

    showScreen('confirmation-screen');

    // Optionally disable editing in view mode (for now, we'll leave editing enabled)
}

/**
 * Handle report complete from Clara's response
 */
function handleReportComplete() {
    // reportComplete is already set by clara.js parseResponse
    showReviewReportButton();
}

// ========================================
// Voice Review Mode Functions
// ========================================

/**
 * Handle actions from Clara's response
 * @param {array} actions - Array of action names
 */
function handleActions(actions) {
    if (!actions || actions.length === 0) return;

    actions.forEach(action => {
        switch (action) {
            case 'SEND_REPORT':
                sendReportViaVoice();
                break;

            case 'SHOW_CONFIRMATION_SCREEN':
                showConfirmationScreen();
                hideVoiceConfirmHint();
                break;

            case 'CONFIRM_READY':
                // Clara is waiting for user to confirm
                // Update UI to show hint about voice commands
                voiceReviewMode = true;
                showVoiceConfirmHint();
                break;
        }
    });
}

/**
 * Send report via voice command (hands-free)
 */
async function sendReportViaVoice() {
    // Check for minimum required fields
    if (!reportData.chiefComplaint) {
        // Clara should handle this gracefully in conversation
        return;
    }

    // Store the sent report data
    sentReportData = JSON.parse(JSON.stringify(reportData));

    // Broadcast to ER Dashboard via ClaraSync (works across tabs)
    if (window.ClaraSync) {
        ClaraSync.broadcast(ClaraSync.EVENTS.NEW_PATIENT, {
            patient: sentReportData,
            timestamp: Date.now()
        });
    }

    // Enable companion mode
    companionMode = true;
    voiceReviewMode = false;

    // Hide voice confirm hint
    hideVoiceConfirmHint();

    // Update report mini bar to show "Report Sent"
    const reportStatus = document.getElementById('report-status');
    if (reportStatus) {
        reportStatus.textContent = 'Report Sent';
        reportStatus.classList.add('sent');
    }

    // Show visual confirmation on the blob
    showVoiceSentConfirmation();
}

/**
 * Send report update to ER Dashboard (for companion mode updates)
 * @param {object} updatedFields - Object with field names and new values
 */
function sendReportUpdate(updatedFields) {
    if (!sentReportData || !companionMode) return;

    // Update local sent report data
    Object.assign(sentReportData, updatedFields);

    // Broadcast update via ClaraSync
    if (window.ClaraSync) {
        ClaraSync.broadcast(ClaraSync.EVENTS.PATIENT_UPDATE, {
            patientId: sentReportData.id || 'current',
            updates: updatedFields,
            timestamp: Date.now()
        });
    }
}

/**
 * Send ETA update to ER Dashboard
 * @param {string} newETA - New ETA string
 */
function sendETAUpdate(newETA) {
    if (!sentReportData || !companionMode) return;

    sentReportData.eta = newETA;

    // Broadcast ETA update via ClaraSync
    if (window.ClaraSync) {
        ClaraSync.broadcast(ClaraSync.EVENTS.ETA_UPDATE, {
            patientId: sentReportData.id || 'current',
            eta: newETA,
            etaTimestamp: Date.now()
        });
    }
}

/**
 * Show visual confirmation animation when report is sent via voice
 */
function showVoiceSentConfirmation() {
    const blob = document.getElementById('voice-blob');
    const statusText = document.getElementById('voice-status-text');
    const blobContainer = document.querySelector('.voice-blob-container');

    if (!blob || !blobContainer) return;

    // Add sent state class for checkmark animation
    blob.classList.add('sent');

    // Update status text
    if (statusText) {
        const destination = reportData.destination || 'the ER';
        statusText.textContent = `Report sent to ${destination}`;
        statusText.classList.add('sent');
    }

    // After animation, return to normal state
    setTimeout(() => {
        blob.classList.remove('sent');
        if (statusText) {
            statusText.textContent = "Clara is here until you arrive.";
            statusText.classList.remove('sent');
        }
    }, 3000);
}

/**
 * Show voice command hints during confirmation phase
 */
function showVoiceConfirmHint() {
    const hint = document.getElementById('voice-confirm-hint');
    if (!hint) return;

    hint.classList.add('visible');
    voiceConfirmHintVisible = true;

    // Clear any existing timer
    if (voiceConfirmHintTimer) {
        clearTimeout(voiceConfirmHintTimer);
    }

    // Auto-hide after 8 seconds
    voiceConfirmHintTimer = setTimeout(() => {
        hideVoiceConfirmHint();
    }, 8000);
}

/**
 * Hide voice command hints
 */
function hideVoiceConfirmHint() {
    const hint = document.getElementById('voice-confirm-hint');
    if (hint) {
        hint.classList.remove('visible');
    }
    voiceConfirmHintVisible = false;

    if (voiceConfirmHintTimer) {
        clearTimeout(voiceConfirmHintTimer);
        voiceConfirmHintTimer = null;
    }
}

/**
 * Show voice confirm hint if user seems stuck (no response for 10+ seconds)
 */
function checkVoiceConfirmStuck() {
    if (voiceReviewMode && !voiceConfirmHintVisible) {
        showVoiceConfirmHint();
    }
}

/**
 * Show choice buttons for text mode when report is ready
 */
function showReportReadyChoice() {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;

    // Don't add if already exists
    if (document.querySelector('.report-ready-choice')) return;

    const choiceContainer = document.createElement('div');
    choiceContainer.className = 'report-ready-choice';
    choiceContainer.innerHTML = `
        <button class="choice-btn read-to-me-btn">
            <span class="choice-icon">🔊</span>
            <span class="choice-text">Read to me</span>
        </button>
        <button class="choice-btn view-report-btn">
            <span class="choice-icon">📋</span>
            <span class="choice-text">View Report</span>
        </button>
    `;

    chatArea.appendChild(choiceContainer);
    scrollToBottom();

    // Add event listeners
    const readBtn = choiceContainer.querySelector('.read-to-me-btn');
    const viewBtn = choiceContainer.querySelector('.view-report-btn');

    if (readBtn) {
        readBtn.addEventListener('click', handleReadToMeChoice);
    }
    if (viewBtn) {
        viewBtn.addEventListener('click', showConfirmationScreen);
    }
}

/**
 * Handle "Read to me" button click in text mode
 */
async function handleReadToMeChoice() {
    // Remove choice buttons
    const choice = document.querySelector('.report-ready-choice');
    if (choice) choice.remove();

    // Show typing indicator
    showTypingIndicator();

    try {
        // Send message to Clara with report context
        const contextMessage = `User wants you to read the report aloud. Here's the current data:\n${window.Clara.generateReportSummaryContext()}\n\nRead this naturally and conversationally, then ask if they want to send or change anything.`;

        const response = await window.Clara.sendMessage(contextMessage);

        hideTypingIndicator();
        addMessage(response.message, 'clara');

        // Handle any actions
        if (response.actions && response.actions.length > 0) {
            handleActions(response.actions);
        }

        // Handle field updates
        if (response.fieldUpdates && response.fieldUpdates.length > 0) {
            response.fieldUpdates.forEach(update => {
                showFieldNotification(update.field);
            });
        }
    } catch (error) {
        console.error('Error getting report reading:', error);
        hideTypingIndicator();
        addMessage("I'm having trouble right now. Let me show you the report instead.", 'clara');
        setTimeout(showConfirmationScreen, 1500);
    }
}

/**
 * Open confirmation screen from voice mode
 */
function openConfirmationFromVoice() {
    hideVoiceConfirmHint();
    showConfirmationScreen();
}

// ========================================
// TTS Functions
// ========================================

/**
 * Toggle TTS for text mode
 */
function toggleTextModeTTS() {
    textModeTTSEnabled = !textModeTTSEnabled;
    updateTTSToggleButton();

    // Unlock audio context on user interaction
    if (window.GeminiTTS) {
        GeminiTTS.unlockAudioContext();
    }

    console.log('Text mode TTS:', textModeTTSEnabled ? 'enabled' : 'disabled');
}

/**
 * Update TTS toggle button display
 */
function updateTTSToggleButton() {
    const btn = document.getElementById('tts-toggle-btn');
    if (btn) {
        btn.textContent = textModeTTSEnabled ? '🔊' : '🔇';
        btn.title = textModeTTSEnabled ? 'Disable Clara\'s voice' : 'Enable Clara\'s voice';
    }
}

/**
 * Test Clara's voice
 */
function testClaraVoice() {
    // Unlock audio context
    if (window.GeminiTTS) {
        GeminiTTS.unlockAudioContext();
    }

    const testText = "Hi, I'm Clara. I'm here to help prepare the emergency room for your arrival. How can I help you today?";

    if (window.GeminiTTS && GeminiTTS.isAvailable()) {
        console.log('Testing Gemini TTS with voice:', GeminiTTS.getVoice());
        GeminiTTS.speak(testText, () => {
            console.log('Voice test complete');
        });
    } else if (window.ClaraVoice) {
        // Skip adding message - this is just a voice test, not a chat message
        ClaraVoice.speakResponse(testText, () => {
            console.log('Voice test complete');
        }, true);
    } else {
        console.error('No TTS available');
    }
}

/**
 * Check if TTS should speak in text mode
 */
function shouldSpeakInTextMode() {
    return textModeTTSEnabled && currentMode === 'text';
}

/**
 * Speak text if appropriate for current mode
 * @param {string} text - Text to speak
 * @param {function} onComplete - Callback when done
 * @param {boolean} skipAddMessage - If true, skip adding message to chat
 */
function speakIfEnabled(text, onComplete, skipAddMessage = false) {
    if (currentMode === 'voice') {
        // Voice mode always speaks
        if (window.ClaraVoice) {
            ClaraVoice.speakResponse(text, onComplete, skipAddMessage);
        } else if (onComplete) {
            onComplete();
        }
    } else if (shouldSpeakInTextMode()) {
        // Text mode with TTS enabled - skip adding message since caller already added it
        if (window.GeminiTTS && GeminiTTS.isAvailable()) {
            GeminiTTS.speak(text, onComplete);
        } else if (window.ClaraVoice) {
            ClaraVoice.speakResponse(text, onComplete, true);
        } else if (onComplete) {
            onComplete();
        }
    } else if (onComplete) {
        // No speech, just complete
        onComplete();
    }
}

// ========================================
// Utility Functions
// ========================================

function getCurrentScreen() {
    return currentScreen;
}

function isERDashboardVisible() {
    return erDashboardVisible;
}

function getCurrentMode() {
    return currentMode;
}

function getReportData() {
    return { ...reportData };
}

function getVoiceState() {
    return voiceState;
}

// Export functions for clara.js access
window.renderReportFields = renderReportFields;
window.updateReportStatus = updateReportStatus;

// ========================================
// ERROR HANDLING & TOASTS
// ========================================

/**
 * Show error toast notification
 */
function showErrorToast(message, duration = 5000) {
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.innerHTML = `
        <span class="error-icon">⚠️</span>
        <span class="error-message">${message}</span>
        <button class="error-dismiss" onclick="this.parentElement.remove()">✕</button>
    `;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('visible'));

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Show success toast notification
 */
function showSuccessToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'success-toast';
    toast.innerHTML = `
        <span class="success-icon">✓</span>
        <span class="success-message">${message}</span>
    `;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('visible'));

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Initialize offline detection
 */
function initOfflineDetection() {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
        handleOffline();
    }
}

function handleOffline() {
    document.body.classList.add('offline');
}

function handleOnline() {
    document.body.classList.remove('offline');
    showSuccessToast('You\'re back online!');
}

// Initialize offline detection
initOfflineDetection();

// Global error handler for uncaught errors
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Global error:', { msg, url, lineNo, columnNo, error });

    // Don't show modal for minor errors
    if (msg.includes('ResizeObserver') || msg.includes('Script error')) {
        return false;
    }

    return false;
};

// Export functions
window.ClaraApp = {
    showScreen,
    toggleERDashboard,
    resetDemo,
    getCurrentScreen,
    getCurrentMode,
    isERDashboardVisible,
    addMessage,
    switchToMode,
    // Report functions
    updateReportField,
    setFieldStatus,
    getReportProgress,
    getReportData,
    expandReportSheet,
    collapseReportSheet,
    renderReportFields,
    updateReportStatus,
    clearReportData,
    // Voice functions
    setVoiceState,
    getVoiceState,
    startVoiceDemoCycle,
    stopVoiceDemoCycle,
    // Messaging
    showTypingIndicator,
    hideTypingIndicator,
    showFieldNotification,
    // Confirmation screen functions
    showConfirmationScreen,
    hideConfirmationScreen,
    sendReportToER,
    showReviewReportButton,
    handleReportComplete,
    isCompanionMode: () => companionMode,
    isReportComplete: () => window.Clara ? window.Clara.isReportComplete() : false,
    // Voice review mode functions
    handleActions,
    showVoiceConfirmHint,
    hideVoiceConfirmHint,
    showVoiceSentConfirmation,
    sendReportViaVoice,
    showReportReadyChoice,
    openConfirmationFromVoice,
    isVoiceReviewMode: () => voiceReviewMode,
    // Real-time sync functions
    sendReportUpdate,
    sendETAUpdate,
    // TTS functions
    toggleTextModeTTS,
    testClaraVoice,
    speakIfEnabled,
    isTextModeTTSEnabled: () => textModeTTSEnabled,
    // Toast functions
    showErrorToast,
    showSuccessToast,
    // API Key management
    handleClearApiKey
};
