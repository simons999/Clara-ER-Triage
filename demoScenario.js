// demoScenario.js — Pre-scripted demo scenarios for Clara

const DemoScenario = (function() {

    // Demo conversation script - Arm Injury Scenario
    const scenarios = {
        armInjury: {
            name: "Arm Injury",
            description: "Fall from ladder with suspected arm fracture",
            steps: [
                {
                    type: 'clara',
                    message: "Hi, I'm Clara. I'm here to help prepare the ER for your arrival. Tell me — what's happening right now?",
                    delay: 500,
                    fields: {}
                },
                {
                    type: 'user',
                    message: "I fell off a ladder and my arm is really hurt"
                },
                {
                    type: 'clara',
                    message: "I'm sorry that happened. Let's get the ER ready for you. Can you tell me where exactly it hurts, and what does your arm look like?",
                    delay: 1500,
                    fields: { chiefComplaint: "Fall from ladder, arm injury" }
                },
                {
                    type: 'user',
                    message: "My right forearm, it's super swollen and I can't move my wrist. Pain is like 8 out of 10"
                },
                {
                    type: 'clara',
                    message: "That sounds really painful. The swelling and limited movement are important details. Can you show me your arm? A photo would help the ER prepare.",
                    delay: 1800,
                    fields: {
                        painLevel: "8/10",
                        painLocation: "Right forearm",
                        mobility: "Cannot move wrist"
                    }
                },
                {
                    type: 'user',
                    message: "[Shares photo of swollen arm]",
                    isPhoto: true
                },
                {
                    type: 'clara',
                    message: "Thank you, I can see significant swelling around your forearm. I've added that to your report. Do you have any allergies to medications, or any medical conditions I should note?",
                    delay: 1500,
                    fields: {
                        photosCount: "1 photo attached"
                    }
                },
                {
                    type: 'user',
                    message: "No allergies, but I have type 1 diabetes"
                },
                {
                    type: 'clara',
                    message: "Got it, that's important for them to know. Are you alert and feeling okay otherwise? Any dizziness or trouble breathing?",
                    delay: 1200,
                    fields: {
                        allergies: "None known",
                        medicalHistory: "Type 1 diabetes"
                    }
                },
                {
                    type: 'user',
                    message: "Yeah I'm alert, just in a lot of pain. Breathing is fine"
                },
                {
                    type: 'clara',
                    message: "Good to hear. Which ER are you heading to, and about how far away are you?",
                    delay: 1000,
                    fields: {
                        consciousness: "Alert and oriented",
                        breathing: "Normal"
                    }
                },
                {
                    type: 'user',
                    message: "City General, about 8 minutes away"
                },
                {
                    type: 'clara',
                    message: "Perfect. Your report is ready for City General ER. Would you like me to read it back to you, or would you prefer to review it on screen before I send it?",
                    delay: 1200,
                    fields: {
                        destination: "City General ER",
                        eta: "8 minutes"
                    },
                    showReviewPrompt: true
                },
                {
                    type: 'user',
                    message: "Just send it"
                },
                {
                    type: 'clara',
                    message: "Sending your report to City General now... Done! They'll have everything ready when you arrive. I'll stay here if you have any questions on the way.",
                    delay: 1500,
                    action: 'SEND_REPORT'
                },
                {
                    type: 'clara',
                    message: "How are you feeling? Focus on getting there safely — the ER knows you're coming.",
                    delay: 3000,
                    isCompanionMode: true
                }
            ]
        }
    };

    // State
    let currentScenario = null;
    let currentStepIndex = 0;
    let isRunning = false;
    let autoPlayEnabled = false;
    let onStepComplete = null;

    /**
     * Initialize demo scenario
     */
    function init() {
        currentScenario = scenarios.armInjury;
        currentStepIndex = 0;
        isRunning = false;
        console.log('DemoScenario initialized:', currentScenario.name);
    }

    /**
     * Start the demo scenario
     */
    function start() {
        if (!currentScenario) {
            init();
        }
        currentStepIndex = 0;
        isRunning = true;
        playNextStep();
    }

    /**
     * Play the next step in the scenario
     */
    function playNextStep() {
        if (!isRunning || currentStepIndex >= currentScenario.steps.length) {
            console.log('Demo scenario complete');
            showDemoComplete();
            return;
        }

        const step = currentScenario.steps[currentStepIndex];
        currentStepIndex++;

        if (step.type === 'clara') {
            playClaraStep(step);
        } else if (step.type === 'user') {
            playUserStep(step);
        }
    }

    /**
     * Play Clara's response step
     */
    function playClaraStep(step) {
        // Show typing indicator
        if (window.ClaraApp) {
            ClaraApp.showTypingIndicator();
        }

        setTimeout(() => {
            // Hide typing indicator
            if (window.ClaraApp) {
                ClaraApp.hideTypingIndicator();
            }

            // Add message to chat
            if (window.ClaraApp) {
                ClaraApp.addMessage(step.message, 'clara');
            }

            // Update report fields
            if (step.fields && Object.keys(step.fields).length > 0) {
                Object.entries(step.fields).forEach(([field, value]) => {
                    if (window.ClaraApp) {
                        ClaraApp.updateReportField(field, value);
                        ClaraApp.setFieldStatus(field, 'collected');

                        // Show notification after small delay
                        setTimeout(() => {
                            ClaraApp.showFieldNotification(field);
                        }, 300);
                    }
                });

                // Re-render report
                if (window.renderReportFields) {
                    renderReportFields();
                }
                if (window.updateReportStatus) {
                    updateReportStatus();
                }
            }

            // Handle special actions
            if (step.action === 'SEND_REPORT') {
                sendDemoReportToER();
            }

            // Speak if in voice mode
            const currentMode = window.ClaraApp?.getCurrentMode();
            if (currentMode === 'voice' && window.GeminiTTS) {
                GeminiTTS.speak(step.message, () => {
                    showDemoPromptOrContinue(step);
                });
            } else {
                // Text mode - show prompt after delay
                setTimeout(() => {
                    showDemoPromptOrContinue(step);
                }, 1000);
            }

        }, step.delay || 1000);
    }

    /**
     * Show demo prompt or auto-continue
     */
    function showDemoPromptOrContinue(step) {
        if (autoPlayEnabled) {
            setTimeout(playNextStep, 1500);
        } else {
            // Check if next step is user or end
            if (currentStepIndex < currentScenario.steps.length) {
                const nextStep = currentScenario.steps[currentStepIndex];
                if (nextStep.type === 'user') {
                    showDemoUserPrompt(nextStep);
                } else {
                    showDemoContinueButton();
                }
            }
        }
    }

    /**
     * Play user's step (show prompt for user to continue)
     */
    function playUserStep(step) {
        if (autoPlayEnabled) {
            // Auto-play: show user message automatically
            setTimeout(() => {
                addUserMessage(step);
                setTimeout(playNextStep, 800);
            }, 1500);
        } else {
            // Manual: show prompt
            showDemoUserPrompt(step);
        }
    }

    /**
     * Add user message to chat
     */
    function addUserMessage(step) {
        if (step.isPhoto) {
            // Add photo placeholder
            addDemoPhotoMessage();
        } else if (window.ClaraApp) {
            ClaraApp.addMessage(step.message, 'user');
        }
    }

    /**
     * Show demo prompt for user response in the left panel (or in-phone on small screens)
     */
    function showDemoUserPrompt(step) {
        const panel = document.getElementById('demo-options-panel');
        const panelContent = document.getElementById('demo-panel-content');
        const oldPromptArea = document.getElementById('demo-prompt-area');

        // Check if the panel is visible (not hidden by CSS media query)
        const panelIsVisible = panel && window.getComputedStyle(panel).display !== 'none';

        if (panelIsVisible && panelContent) {
            // Show in left panel
            panel.classList.add('visible');

            panelContent.innerHTML = `
                <div class="demo-option-card" onclick="DemoScenario.userRespond()">
                    <div class="demo-option-label">Click to send:</div>
                    <div class="demo-option-text">"${step.message}"</div>
                    <div class="demo-option-hint">↗ Click to continue</div>
                </div>
                <div class="demo-controls">
                    <button class="demo-auto-btn" onclick="DemoScenario.toggleAutoPlay(); event.stopPropagation();">
                        ${autoPlayEnabled ? '⏸ Pause' : '▶ Auto-play'}
                    </button>
                </div>
            `;

            // Hide old in-phone prompt
            if (oldPromptArea) {
                oldPromptArea.classList.remove('visible');
            }
        } else if (oldPromptArea) {
            // Fallback to in-phone prompt for small screens
            oldPromptArea.innerHTML = `
                <div class="demo-prompt">
                    <div class="demo-prompt-label">Demo: Tap to send</div>
                    <div class="demo-prompt-text">"${step.message}"</div>
                    <div class="demo-prompt-buttons">
                        <button class="demo-next-btn" onclick="DemoScenario.userRespond()">
                            Send →
                        </button>
                        <button class="demo-auto-btn" onclick="DemoScenario.toggleAutoPlay()">
                            ${autoPlayEnabled ? '⏸ Pause' : '▶ Auto'}
                        </button>
                    </div>
                </div>
            `;
            oldPromptArea.classList.add('visible');
        }
    }

    /**
     * Show continue button between Clara steps
     */
    function showDemoContinueButton() {
        const panel = document.getElementById('demo-options-panel');
        const panelContent = document.getElementById('demo-panel-content');
        const oldPromptArea = document.getElementById('demo-prompt-area');

        // Check if the panel is visible (not hidden by CSS media query)
        const panelIsVisible = panel && window.getComputedStyle(panel).display !== 'none';

        if (panelIsVisible && panelContent) {
            panel.classList.add('visible');

            panelContent.innerHTML = `
                <div class="demo-option-card" onclick="DemoScenario.playNextStep()">
                    <div class="demo-option-text">Continue Demo</div>
                    <div class="demo-option-hint">↗ Click to continue</div>
                </div>
                <div class="demo-controls">
                    <button class="demo-auto-btn" onclick="DemoScenario.toggleAutoPlay(); event.stopPropagation();">
                        ${autoPlayEnabled ? '⏸ Pause' : '▶ Auto-play'}
                    </button>
                </div>
            `;

            if (oldPromptArea) {
                oldPromptArea.classList.remove('visible');
            }
        } else if (oldPromptArea) {
            // Fallback to in-phone prompt for small screens
            oldPromptArea.innerHTML = `
                <div class="demo-prompt">
                    <div class="demo-prompt-buttons">
                        <button class="demo-next-btn" onclick="DemoScenario.playNextStep()">
                            Continue Demo →
                        </button>
                        <button class="demo-auto-btn" onclick="DemoScenario.toggleAutoPlay()">
                            ${autoPlayEnabled ? '⏸ Pause' : '▶ Auto'}
                        </button>
                    </div>
                </div>
            `;
            oldPromptArea.classList.add('visible');
        }
    }

    /**
     * Hide demo prompt
     */
    function hideDemoPrompt() {
        const panel = document.getElementById('demo-options-panel');
        if (panel) {
            panel.classList.remove('visible');
        }
        // Also hide old prompt area
        const oldPromptArea = document.getElementById('demo-prompt-area');
        if (oldPromptArea) {
            oldPromptArea.classList.remove('visible');
        }
    }

    /**
     * User responds (advances demo)
     */
    function userRespond() {
        hideDemoPrompt();

        // Get the current user step (we already incremented, so go back one)
        const step = currentScenario.steps[currentStepIndex - 1];

        if (step && step.type === 'user') {
            addUserMessage(step);
        }

        // Continue to next step
        setTimeout(playNextStep, 500);
    }

    /**
     * Toggle auto-play mode
     */
    function toggleAutoPlay() {
        autoPlayEnabled = !autoPlayEnabled;

        // Update all auto-play button texts
        const autoBtns = document.querySelectorAll('.demo-auto-btn');
        autoBtns.forEach(btn => {
            btn.textContent = autoPlayEnabled ? '⏸ Pause' : '▶ Auto-play';
        });

        if (autoPlayEnabled) {
            // Start auto-playing
            hideDemoPrompt();
            playNextStep();
        }

        console.log('Auto-play:', autoPlayEnabled);
    }

    /**
     * Add demo photo message
     */
    function addDemoPhotoMessage() {
        const chatArea = document.getElementById('chat-area');
        if (!chatArea) return;

        const photoHtml = `
            <div class="message user photo-message">
                <div class="demo-photo-placeholder">
                    <span class="demo-photo-icon">📷</span>
                    <span class="demo-photo-text">Photo shared</span>
                </div>
            </div>
        `;
        chatArea.insertAdjacentHTML('beforeend', photoHtml);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    /**
     * Send demo report to ER dashboard
     */
    function sendDemoReportToER() {
        const demoPatient = {
            id: 'demo-' + Date.now(),
            status: 'new',
            receivedAt: Date.now(),
            name: 'Sarah M.',
            age: 34,
            gender: 'Female',
            destination: 'City General ER',
            eta: 8,
            etaTimestamp: Date.now(),
            chiefComplaint: 'Fall from ladder, arm injury',
            painLevel: '8/10',
            painLocation: 'Right forearm',
            mobility: 'Cannot move wrist',
            bleeding: 'None visible',
            consciousness: 'Alert and oriented',
            breathing: 'Normal',
            allergies: 'None known',
            medicalHistory: 'Type 1 diabetes',
            photos: [{ id: 'demo-photo', description: 'Visible swelling right forearm' }],
            warningFlags: ['Diabetic', 'High pain (8/10)'],
            fullReport: {
                chiefComplaint: 'Fall from ladder, arm injury',
                painLevel: '8/10',
                painLocation: 'Right forearm',
                mobility: 'Cannot move wrist',
                consciousness: 'Alert and oriented',
                breathing: 'Normal',
                allergies: 'None known',
                medicalHistory: 'Type 1 diabetes'
            },
            isDemo: true
        };

        // Broadcast to ER Dashboard
        if (window.ClaraSync) {
            ClaraSync.broadcast(ClaraSync.EVENTS.NEW_PATIENT, {
                patient: demoPatient,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Show demo complete modal
     */
    function showDemoComplete() {
        isRunning = false;
        hideDemoPrompt();

        // Show completion modal
        if (window.AppMode) {
            AppMode.showModeSelection();

            setTimeout(() => {
                const modal = document.createElement('div');
                modal.className = 'demo-complete-modal';
                modal.innerHTML = `
                    <div class="demo-complete-overlay" onclick="this.parentElement.remove()"></div>
                    <div class="demo-complete-content">
                        <div class="demo-complete-icon">🎉</div>
                        <h3 class="demo-complete-title">Demo Complete!</h3>
                        <p class="demo-complete-message">You've seen how Clara helps patients prepare the ER for their arrival. Want to try it for real?</p>
                        <div class="demo-complete-buttons">
                            <button class="demo-complete-btn secondary" onclick="DemoScenario.restart(); this.closest('.demo-complete-modal').remove();">
                                Restart Demo
                            </button>
                            <button class="demo-complete-btn primary" onclick="AppMode.selectMode('unlimited'); this.closest('.demo-complete-modal').remove();">
                                Use Your API Key
                            </button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }, 500);
        }
    }

    /**
     * Restart the demo
     */
    function restart() {
        reset();
        start();
    }

    /**
     * Reset demo state
     */
    function reset() {
        currentStepIndex = 0;
        isRunning = false;
        autoPlayEnabled = false;
        hideDemoPrompt();

        // Clear chat
        const chatArea = document.getElementById('chat-area');
        if (chatArea) {
            chatArea.innerHTML = '';
        }

        // Clear report data
        if (window.ClaraApp) {
            ClaraApp.clearReportData();
        }

        // Clear demo patients from ER dashboard
        if (window.ERDashboard) {
            const patients = ERDashboard.getPatients();
            patients.forEach(p => {
                if (p.isDemo) {
                    ERDashboard.removePatient(p.id);
                }
            });
        }

        // Hide the demo panel
        const panel = document.getElementById('demo-options-panel');
        if (panel) {
            panel.classList.remove('visible');
        }

        console.log('Demo reset');
    }

    /**
     * Set auto-play
     */
    function setAutoPlay(enabled) {
        autoPlayEnabled = enabled;
    }

    /**
     * Check if demo is running
     */
    function isActive() {
        return isRunning;
    }

    /**
     * Get current step index
     */
    function getCurrentStep() {
        return currentStepIndex;
    }

    /**
     * Get total steps
     */
    function getTotalSteps() {
        return currentScenario ? currentScenario.steps.length : 0;
    }

    // Public API
    return {
        init,
        start,
        playNextStep,
        userRespond,
        toggleAutoPlay,
        restart,
        reset,
        setAutoPlay,
        isActive,
        getCurrentStep,
        getTotalSteps
    };

})();

// Make available on window object
window.DemoScenario = DemoScenario;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DemoScenario;
}
