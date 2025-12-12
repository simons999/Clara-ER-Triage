// Clara ER Dashboard - Hospital-side interface for incoming patients

// ========================================
// STATE MANAGEMENT
// ========================================

let incomingPatients = [];
let currentFilter = 'all';
let currentSort = 'eta';
let etaCountdownInterval = null;
let currentDetailPatientId = null;
let detailViewScrollPosition = 0;
let listScrollPosition = 0;
let dashboardInitialized = false;

// ========================================
// EVENT SYSTEM
// ========================================

const dashboardEvents = {
    listeners: {},

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    },

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    },

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
};

// ========================================
// INITIALIZATION
// ========================================

// Notification sound
let notificationSound = null;
let isDashboardMuted = false;

/**
 * Initialize the ER Dashboard
 */
function initERDashboard() {
    if (dashboardInitialized) {
        console.log('ER Dashboard already initialized');
        return;
    }
    dashboardInitialized = true;
    console.log('Initializing ER Dashboard');

    // Initialize ClaraSync if available
    if (window.ClaraSync && !ClaraSync.isInitialized()) {
        ClaraSync.init();
    }

    // Load existing patients from localStorage
    loadPatientsFromStorage();

    // Set up event listeners
    setupDashboardEventListeners();

    // Start ETA countdown
    startETACountdown();

    // Initialize notification sound
    initNotificationSound();

    // Initial render
    renderPatientList();

    // Listen for new patients via ClaraSync (cross-tab communication)
    if (window.ClaraSync) {
        ClaraSync.on(ClaraSync.EVENTS.NEW_PATIENT, handleNewPatient);
        ClaraSync.on(ClaraSync.EVENTS.PATIENT_UPDATE, handlePatientUpdate);
        ClaraSync.on(ClaraSync.EVENTS.ETA_UPDATE, handleETAUpdate);
        ClaraSync.on(ClaraSync.EVENTS.STATUS_CHANGE, handleStatusChange);
    }

    // Also listen for local events (backwards compatibility)
    dashboardEvents.on('newPatient', (patient) => {
        // Only handle if not coming from ClaraSync
        if (!window.ClaraSync) {
            addIncomingPatient(patient);
        }
    });

    // Listen for patient updates (from companion mode)
    dashboardEvents.on('patientUpdated', (data) => {
        if (currentDetailPatientId === data.patientId) {
            const patient = getPatient(data.patientId);
            if (patient) {
                renderPatientDetail(patient);
                showDashboardNotification('Report updated by patient', 'update');
            }
        }
        renderPatientList();
    });

    console.log('ER Dashboard initialized with', incomingPatients.length, 'patients');
}

/**
 * Handle new patient from ClaraSync
 */
function handleNewPatient(data) {
    const { patient, timestamp } = data;

    // Check if patient already exists (prevent duplicates)
    // Use a combination of name and chiefComplaint to detect duplicates
    const existingPatient = incomingPatients.find(p =>
        p.chiefComplaint === patient.chiefComplaint &&
        Math.abs(p.receivedAt - timestamp) < 5000 // Within 5 seconds
    );

    if (existingPatient) {
        console.log('Patient already exists, skipping duplicate');
        return;
    }

    // Add the patient
    addIncomingPatient(patient);

    // Show notification
    const patientName = patient.name || 'New patient';
    showDashboardNotification(`New patient: ${patientName}`, 'info');

    // Play notification sound
    playNotificationSound();
}

/**
 * Handle patient update from ClaraSync
 */
function handlePatientUpdate(data) {
    const { patientId, updates, timestamp } = data;

    // Find patient - try by ID first, then by most recent
    let patient = incomingPatients.find(p => p.id === patientId);

    // If no exact ID match, update most recent patient (for demo simplicity)
    if (!patient && patientId === 'current') {
        patient = incomingPatients[0];
    }

    if (!patient) {
        console.log('Patient not found for update:', patientId);
        return;
    }

    // Apply updates to full report
    Object.assign(patient.fullReport || {}, updates);

    // Also update top-level fields
    Object.keys(updates).forEach(key => {
        if (patient.hasOwnProperty(key)) {
            patient[key] = updates[key];
        }
    });

    // Recalculate warning flags
    patient.warningFlags = detectWarningFlags(patient.fullReport || patient);

    // Save
    savePatientsToStorage();

    // Re-render
    if (currentDetailPatientId === patient.id) {
        // If viewing this patient, update detail view
        renderPatientDetail(patient);
        highlightUpdatedFields(Object.keys(updates));
    }

    // Update list
    renderPatientList();

    // Show notification
    showDashboardNotification(`${patient.name}'s report updated`, 'update');
}

/**
 * Handle ETA update from ClaraSync
 */
function handleETAUpdate(data) {
    const { patientId, eta, etaTimestamp } = data;

    let patient = incomingPatients.find(p => p.id === patientId);

    // If no exact ID match, update most recent patient (for demo simplicity)
    if (!patient && patientId === 'current') {
        patient = incomingPatients[0];
    }

    if (!patient) return;

    patient.eta = parseETA(eta);
    patient.etaTimestamp = etaTimestamp;

    savePatientsToStorage();
    renderPatientList();

    if (currentDetailPatientId === patient.id) {
        updateETADisplay(patient);
    }

    showDashboardNotification(`${patient.name}'s ETA updated`, 'update');
}

/**
 * Handle status change from ClaraSync (from other tabs)
 */
function handleStatusChange(data) {
    const { patientId, status, timestamp } = data;

    const patient = incomingPatients.find(p => p.id === patientId);
    if (!patient) return;

    patient.status = status;
    savePatientsToStorage();
    renderPatientList();

    if (currentDetailPatientId === patientId) {
        updateStatusDisplay(patient);
    }
}

/**
 * Update ETA display in detail view
 */
function updateETADisplay(patient) {
    const metaItem = document.querySelector('.detail-meta-item .meta-value');
    if (metaItem) {
        metaItem.textContent = calculateETADisplay(patient);
    }
}

/**
 * Update status display in detail view
 */
function updateStatusDisplay(patient) {
    const statusSelect = document.getElementById('detail-status-select');
    if (statusSelect) {
        statusSelect.value = patient.status;
    }
    // Re-render to update pipeline
    renderPatientDetail(patient);
}

/**
 * Highlight updated fields with animation
 */
function highlightUpdatedFields(fieldNames) {
    fieldNames.forEach(fieldName => {
        // Find field elements by various selectors
        const selectors = [
            `[data-field="${fieldName}"]`,
            `.assessment-row:has(.assessment-label:contains("${formatFieldLabel(fieldName)}"))`,
            `.history-row:has(.history-label:contains("${formatFieldLabel(fieldName)}"))`
        ];

        selectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    el.classList.add('field-updated');
                    setTimeout(() => {
                        el.classList.remove('field-updated');
                    }, 3000);
                });
            } catch (e) {
                // Selector might not be supported, that's ok
            }
        });
    });
}

/**
 * Set up dashboard event listeners
 */
function setupDashboardEventListeners() {
    // Filter tabs
    const filterTabs = document.querySelectorAll('.dashboard-filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const filter = tab.dataset.filter;
            setFilter(filter);
        });
    });

    // Sort dropdown
    const sortSelect = document.getElementById('dashboard-sort');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            setSort(e.target.value);
        });
    }

    // Demo buttons
    const addSampleBtn = document.getElementById('add-sample-patient-btn');
    const clearAllBtn = document.getElementById('clear-patients-btn');
    const simulateArrivalBtn = document.getElementById('simulate-arrival-btn');

    if (addSampleBtn) {
        addSampleBtn.addEventListener('click', addSamplePatient);
    }
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', clearAllPatients);
    }
    if (simulateArrivalBtn) {
        simulateArrivalBtn.addEventListener('click', simulateArrival);
    }
}

// ========================================
// PATIENT MANAGEMENT
// ========================================

/**
 * Add a new incoming patient
 * @param {object} reportData - Report data from Clara
 */
function addIncomingPatient(reportData) {
    const patient = createPatientFromReport(reportData);

    // Add to beginning of array (newest first in raw data)
    incomingPatients.unshift(patient);

    // Save to storage
    savePatientsToStorage();

    // Render with animation
    renderPatientList();

    // Animate the new card entrance
    setTimeout(() => {
        animateNewPatientCard(patient.id);
    }, 100);

    // Generate AI triage suggestion in background
    generateTriageSuggestion(patient).then(suggestion => {
        patient.aiTriageSuggestion = suggestion;
        savePatientsToStorage();
        // Re-render if viewing this patient
        if (currentDetailPatientId === patient.id) {
            updateTriageSuggestionSection(patient);
        }
    });

    console.log('Added new patient:', patient.name);
}

/**
 * Create a patient object from Clara report data
 * @param {object} reportData - Report data from Clara
 * @returns {object} - Patient object
 */
function createPatientFromReport(reportData) {
    const patient = {
        id: generateUniqueId(),
        status: 'new',
        receivedAt: Date.now(),

        // Basic info
        name: reportData.name || generatePatientName(),
        age: reportData.age || null,
        gender: reportData.gender || null,

        // Destination and ETA
        destination: reportData.destination || 'Unknown ER',
        eta: parseETA(reportData.eta),
        etaTimestamp: Date.now(),

        // Medical info
        chiefComplaint: reportData.chiefComplaint || 'Not provided',
        painLevel: reportData.painLevel || null,
        painLocation: reportData.painLocation || null,
        consciousness: reportData.consciousness || null,
        bleeding: reportData.bleeding || null,
        mobility: reportData.mobility || null,
        breathing: reportData.breathing || null,
        allergies: reportData.allergies || null,
        medications: reportData.medications || null,
        medicalHistory: reportData.medicalHistory || null,

        // Photos
        photos: reportData.photos || [],

        // Full report for detail view
        fullReport: { ...reportData },

        // Warning flags
        warningFlags: []
    };

    // Add dynamic fields
    const standardFields = ['chiefComplaint', 'painLevel', 'painLocation',
        'consciousness', 'bleeding', 'mobility', 'breathing', 'allergies',
        'medications', 'medicalHistory', 'destination', 'eta', 'photos',
        'photosCount', 'age', 'gender', 'name'];

    Object.keys(reportData).forEach(key => {
        if (!standardFields.includes(key) && reportData[key]) {
            patient[key] = reportData[key];
        }
    });

    // Detect warning flags
    patient.warningFlags = detectWarningFlags(patient);

    return patient;
}

/**
 * Update a patient's status
 * @param {string} patientId - Patient ID
 * @param {string} newStatus - New status
 */
function updatePatientStatus(patientId, newStatus) {
    const patient = incomingPatients.find(p => p.id === patientId);
    if (!patient) return;

    patient.status = newStatus;
    savePatientsToStorage();
    renderPatientList();

    console.log('Updated patient', patient.name, 'to status:', newStatus);
}

/**
 * Remove a patient from the list
 * @param {string} patientId - Patient ID
 */
function removePatient(patientId) {
    incomingPatients = incomingPatients.filter(p => p.id !== patientId);
    savePatientsToStorage();
    renderPatientList();
}

/**
 * Get a patient by ID
 * @param {string} patientId - Patient ID
 * @returns {object|null} - Patient object or null
 */
function getPatient(patientId) {
    return incomingPatients.find(p => p.id === patientId) || null;
}

// ========================================
// RENDERING
// ========================================

/**
 * Render the patient list
 */
function renderPatientList() {
    const container = document.getElementById('patient-list');
    const countEl = document.getElementById('patient-count');

    if (!container) return;

    // Get filtered and sorted patients
    let patients = filterPatients(currentFilter);
    patients = sortPatients(patients, currentSort);

    // Update count
    if (countEl) {
        const total = incomingPatients.length;
        const filtered = patients.length;
        if (currentFilter === 'all') {
            countEl.textContent = `${total} incoming patient${total !== 1 ? 's' : ''}`;
        } else {
            countEl.textContent = `${filtered} of ${total} patients`;
        }
    }

    // Render empty state or patient cards
    if (patients.length === 0) {
        container.innerHTML = renderEmptyState();
    } else {
        container.innerHTML = patients.map(p => renderPatientCard(p)).join('');

        // Add click handlers to cards
        container.querySelectorAll('.patient-card').forEach(card => {
            card.addEventListener('click', () => {
                const patientId = card.dataset.patientId;
                openPatientDetail(patientId);
            });
        });

        // Add click handlers to status buttons (prevent propagation)
        container.querySelectorAll('.patient-status-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const patientId = btn.dataset.patientId;
                cyclePatientStatus(patientId);
            });
        });
    }

    // Update filter tab active states
    updateFilterTabStates();
}

/**
 * Render a single patient card
 * @param {object} patient - Patient object
 * @returns {string} - HTML string
 */
function renderPatientCard(patient) {
    const statusBadge = renderStatusBadge(patient.status);
    const etaDisplay = calculateETADisplay(patient);
    const painDisplay = renderPainLevel(patient.painLevel);
    const photoCount = patient.photos?.length || 0;
    const warningFlags = renderWarningFlags(patient.warningFlags);

    // Truncate chief complaint
    let complaint = patient.chiefComplaint || 'Not provided';
    if (complaint.length > 60) {
        complaint = complaint.substring(0, 60) + '...';
    }

    // Patient info line
    let infoLine = patient.name;
    if (patient.gender || patient.age) {
        const parts = [];
        if (patient.gender) parts.push(patient.gender);
        if (patient.age) parts.push(patient.age);
        infoLine += ` • ${parts.join(', ')}`;
    }

    // Consciousness display
    let consciousnessDisplay = '';
    if (patient.consciousness) {
        const isNormal = patient.consciousness.toLowerCase().includes('alert');
        consciousnessDisplay = `<span class="patient-consciousness ${isNormal ? '' : 'concerning'}">${isNormal ? 'Alert' : patient.consciousness}</span>`;
    }

    return `
        <div class="patient-card status-${patient.status}" data-patient-id="${patient.id}">
            <div class="patient-card-header">
                <button class="patient-status-btn" data-patient-id="${patient.id}" title="Click to change status">
                    ${statusBadge}
                </button>
                <span class="patient-eta">${etaDisplay}</span>
            </div>
            <div class="patient-card-info">
                <span class="patient-name-line">${infoLine}</span>
            </div>
            <div class="patient-card-divider"></div>
            <div class="patient-card-complaint">${complaint}</div>
            <div class="patient-card-stats">
                ${painDisplay}
                <span class="patient-photos">${photoCount > 0 ? `📷 ${photoCount} photo${photoCount > 1 ? 's' : ''}` : 'No photos'}</span>
                ${consciousnessDisplay}
            </div>
            ${warningFlags ? `<div class="patient-card-warnings">${warningFlags}</div>` : ''}
            <div class="patient-card-action">
                <span class="view-patient-btn">View →</span>
            </div>
        </div>
    `;
}

/**
 * Render status badge
 * @param {string} status - Patient status
 * @returns {string} - HTML string
 */
function renderStatusBadge(status) {
    const badges = {
        'new': { icon: '🔴', text: 'NEW', class: 'status-new' },
        'reviewing': { icon: '🟡', text: 'REVIEWING', class: 'status-reviewing' },
        'ready': { icon: '🟢', text: 'READY', class: 'status-ready' },
        'arrived': { icon: '🔵', text: 'ARRIVED', class: 'status-arrived' }
    };

    const badge = badges[status] || badges['new'];
    return `<span class="status-badge ${badge.class}">${badge.icon} ${badge.text}</span>`;
}

/**
 * Calculate and render ETA display
 * @param {object} patient - Patient object
 * @returns {string} - ETA string
 */
function calculateETADisplay(patient) {
    if (patient.status === 'arrived') {
        return 'Arrived';
    }

    if (!patient.eta || !patient.etaTimestamp) {
        return 'ETA: --';
    }

    const elapsedMinutes = Math.floor((Date.now() - patient.etaTimestamp) / 60000);
    const remainingMinutes = patient.eta - elapsedMinutes;

    if (remainingMinutes <= 0) {
        return 'Arriving now';
    }

    return `ETA: ${remainingMinutes} min`;
}

/**
 * Render pain level with color coding
 * @param {string} painLevel - Pain level string
 * @returns {string} - HTML string
 */
function renderPainLevel(painLevel) {
    if (!painLevel) return '<span class="patient-pain">Pain: --</span>';

    const painNum = parseInt(painLevel);
    let painClass = 'pain-low';
    if (painNum >= 7) painClass = 'pain-high';
    else if (painNum >= 4) painClass = 'pain-medium';

    return `<span class="patient-pain ${painClass}">Pain: ${painLevel}</span>`;
}

/**
 * Render warning flags
 * @param {array} flags - Warning flags array
 * @returns {string} - HTML string
 */
function renderWarningFlags(flags) {
    if (!flags || flags.length === 0) return '';

    // Show max 2 flags on card
    const displayFlags = flags.slice(0, 2);
    const moreCount = flags.length - 2;

    let html = displayFlags.map(flag => `<span class="warning-flag">⚠️ ${flag}</span>`).join('');

    if (moreCount > 0) {
        html += `<span class="warning-more">+${moreCount} more</span>`;
    }

    return html;
}

/**
 * Render empty state
 * @returns {string} - HTML string
 */
function renderEmptyState() {
    if (currentFilter !== 'all') {
        return `
            <div class="dashboard-empty">
                <div class="empty-icon">📋</div>
                <h3>No ${currentFilter} patients</h3>
                <p>No patients with this status right now.</p>
            </div>
        `;
    }

    return `
        <div class="dashboard-empty">
            <div class="empty-icon">📋</div>
            <h3>No incoming patients</h3>
            <p>Patients using Clara will appear here<br>when they send their reports.</p>
        </div>
    `;
}

/**
 * Update filter tab active states
 */
function updateFilterTabStates() {
    const tabs = document.querySelectorAll('.dashboard-filter-tab');
    tabs.forEach(tab => {
        if (tab.dataset.filter === currentFilter) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
}

// ========================================
// FILTERING & SORTING
// ========================================

/**
 * Filter patients by status
 * @param {string} status - Status to filter by
 * @returns {array} - Filtered patients
 */
function filterPatients(status) {
    if (status === 'all') return [...incomingPatients];
    return incomingPatients.filter(p => p.status === status);
}

/**
 * Sort patients
 * @param {array} patients - Patients to sort
 * @param {string} sortBy - Sort criteria
 * @returns {array} - Sorted patients
 */
function sortPatients(patients, sortBy) {
    const sorted = [...patients];

    switch (sortBy) {
        case 'eta':
            // Soonest first, null ETAs last
            sorted.sort((a, b) => {
                const etaA = calculateETAMinutes(a);
                const etaB = calculateETAMinutes(b);
                if (etaA === null && etaB === null) return 0;
                if (etaA === null) return 1;
                if (etaB === null) return -1;
                return etaA - etaB;
            });
            break;

        case 'received':
            // Newest first
            sorted.sort((a, b) => b.receivedAt - a.receivedAt);
            break;

        case 'pain':
            // Highest pain first
            sorted.sort((a, b) => {
                const painA = parseInt(a.painLevel) || 0;
                const painB = parseInt(b.painLevel) || 0;
                return painB - painA;
            });
            break;

        case 'status':
            // Status priority: new > reviewing > ready > arrived
            const statusOrder = { 'new': 0, 'reviewing': 1, 'ready': 2, 'arrived': 3 };
            sorted.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
            break;
    }

    return sorted;
}

/**
 * Set the current filter
 * @param {string} filter - Filter value
 */
function setFilter(filter) {
    currentFilter = filter;
    renderPatientList();
}

/**
 * Set the current sort
 * @param {string} sort - Sort value
 */
function setSort(sort) {
    currentSort = sort;
    renderPatientList();
}

/**
 * Calculate remaining ETA in minutes
 * @param {object} patient - Patient object
 * @returns {number|null} - Minutes remaining or null
 */
function calculateETAMinutes(patient) {
    if (!patient.eta || !patient.etaTimestamp) return null;
    if (patient.status === 'arrived') return null;

    const elapsedMinutes = Math.floor((Date.now() - patient.etaTimestamp) / 60000);
    const remaining = patient.eta - elapsedMinutes;
    return Math.max(0, remaining);
}

// ========================================
// WARNING FLAG DETECTION
// ========================================

/**
 * Detect warning flags from report data
 * @param {object} report - Report/patient data
 * @returns {array} - Array of warning flag strings
 */
function detectWarningFlags(report) {
    const flags = [];
    const reportStr = JSON.stringify(report).toLowerCase();

    // Check for cardiac indicators
    const cardiacTerms = ['chest pain', 'heart', 'cardiac', 'palpitation', 'angina'];
    if (cardiacTerms.some(term => reportStr.includes(term))) {
        flags.push('Cardiac concern');
    }

    // Check for diabetes
    if (report.diabetes) {
        flags.push('Diabetic');
    }

    // Check for pregnancy
    if (report.pregnancy) {
        flags.push('Pregnant');
    }

    // Check for allergies (not "none" or "no known")
    if (report.allergies) {
        const allergiesLower = report.allergies.toLowerCase();
        if (!allergiesLower.includes('none') && !allergiesLower.includes('no known') && allergiesLower.length > 2) {
            flags.push(`Allergies: ${report.allergies}`);
        }
    }

    // Check for breathing issues
    if (report.breathing) {
        const breathingLower = report.breathing.toLowerCase();
        if (!breathingLower.includes('normal') && !breathingLower.includes('fine')) {
            flags.push('Breathing difficulty');
        }
    }

    // Check for high pain
    const painNum = parseInt(report.painLevel);
    if (painNum >= 9) {
        flags.push('Severe pain');
    }

    // Check for consciousness issues
    if (report.consciousness) {
        const consciousnessLower = report.consciousness.toLowerCase();
        if (!consciousnessLower.includes('alert') && !consciousnessLower.includes('normal')) {
            flags.push('Altered consciousness');
        }
    }

    // Check for stroke indicators
    const strokeTerms = ['stroke', 'face droop', 'arm weakness', 'speech', 'slurred'];
    if (strokeTerms.some(term => reportStr.includes(term))) {
        flags.push('Possible stroke');
    }

    // Check for severe bleeding
    if (report.bleeding) {
        const bleedingLower = report.bleeding.toLowerCase();
        if (bleedingLower.includes('severe') || bleedingLower.includes('heavy') || bleedingLower.includes('uncontrolled')) {
            flags.push('Severe bleeding');
        }
    }

    return flags;
}

// ========================================
// ETA COUNTDOWN
// ========================================

/**
 * Start the ETA countdown interval
 */
function startETACountdown() {
    // Clear existing interval
    if (etaCountdownInterval) {
        clearInterval(etaCountdownInterval);
    }

    // Update every 30 seconds
    etaCountdownInterval = setInterval(() => {
        // Check for patients who should be marked as arrived
        incomingPatients.forEach(patient => {
            if (patient.status !== 'arrived') {
                const remaining = calculateETAMinutes(patient);
                if (remaining !== null && remaining <= 0) {
                    // Could auto-update status or just show "Arriving now"
                    // For now, just re-render to update display
                }
            }
        });

        // Re-render to update ETA displays
        renderPatientList();
    }, 30000);
}

/**
 * Stop the ETA countdown
 */
function stopETACountdown() {
    if (etaCountdownInterval) {
        clearInterval(etaCountdownInterval);
        etaCountdownInterval = null;
    }
}

// ========================================
// PATIENT DETAIL VIEW
// ========================================

/**
 * Show patient detail view
 * @param {string} patientId - Patient ID
 */
async function showPatientDetail(patientId) {
    const patient = getPatient(patientId);
    if (!patient) return;

    console.log('Opening detail for patient:', patient.name);

    // Save current list scroll position
    const patientList = document.getElementById('patient-list');
    if (patientList) {
        listScrollPosition = patientList.parentElement.scrollTop;
    }

    // Set current detail patient
    currentDetailPatientId = patientId;

    // Generate triage suggestion if not already done
    if (!patient.aiTriageSuggestion && !patient.aiTriagePending) {
        patient.aiTriagePending = true;
        generateTriageSuggestion(patient).then(suggestion => {
            patient.aiTriageSuggestion = suggestion;
            patient.aiTriagePending = false;
            savePatientsToStorage();
            // Re-render if still viewing this patient
            if (currentDetailPatientId === patientId) {
                updateTriageSuggestionSection(patient);
            }
        });
    }

    // Show detail view
    const listView = document.querySelector('.dashboard-list-view');
    const detailView = document.getElementById('patient-detail-view');

    if (listView) listView.style.display = 'none';
    if (detailView) {
        detailView.style.display = 'flex';
        renderPatientDetail(patient);
    }
}

/**
 * Alias for showPatientDetail (for backwards compatibility)
 */
function openPatientDetail(patientId) {
    showPatientDetail(patientId);
}

/**
 * Hide patient detail view and return to list
 */
function hidePatientDetail() {
    currentDetailPatientId = null;

    const listView = document.querySelector('.dashboard-list-view');
    const detailView = document.getElementById('patient-detail-view');

    if (detailView) detailView.style.display = 'none';
    if (listView) {
        listView.style.display = 'flex';
        // Restore scroll position
        const content = listView.querySelector('.dashboard-content');
        if (content) {
            content.scrollTop = listScrollPosition;
        }
    }

    // Re-render list to reflect any changes
    renderPatientList();
}

/**
 * Render the patient detail view
 * @param {object} patient - Patient object
 */
function renderPatientDetail(patient) {
    const container = document.getElementById('patient-detail-content');
    if (!container) return;

    const receivedTime = new Date(patient.receivedAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    container.innerHTML = `
        <!-- Patient Header Card -->
        <div class="detail-header-card">
            <div class="detail-patient-info">
                <div class="detail-patient-main">
                    <h2 class="detail-patient-name">${patient.name}</h2>
                    ${renderStatusBadge(patient.status)}
                </div>
                <p class="detail-patient-demo">${formatDemographics(patient)}</p>
            </div>
            <div class="detail-patient-meta">
                <div class="detail-meta-item">
                    <span class="meta-icon">📍</span>
                    <span class="meta-value">${calculateETADisplay(patient)}</span>
                </div>
                <div class="detail-meta-item">
                    <span class="meta-icon">🕐</span>
                    <span class="meta-value">Received: ${receivedTime}</span>
                </div>
            </div>
            <div class="detail-status-workflow">
                <label>Status:</label>
                <select id="detail-status-select" class="status-select" onchange="ERDashboard.changeDetailStatus(this.value)">
                    <option value="new" ${patient.status === 'new' ? 'selected' : ''}>🔴 New</option>
                    <option value="reviewing" ${patient.status === 'reviewing' ? 'selected' : ''}>🟡 Reviewing</option>
                    <option value="ready" ${patient.status === 'ready' ? 'selected' : ''}>🟢 Ready</option>
                    <option value="arrived" ${patient.status === 'arrived' ? 'selected' : ''}>🔵 Arrived</option>
                </select>
                <div class="status-pipeline">
                    <span class="pipeline-step ${patient.status === 'new' ? 'active' : (getStatusIndex(patient.status) > 0 ? 'completed' : '')}">New</span>
                    <span class="pipeline-arrow">→</span>
                    <span class="pipeline-step ${patient.status === 'reviewing' ? 'active' : (getStatusIndex(patient.status) > 1 ? 'completed' : '')}">Reviewing</span>
                    <span class="pipeline-arrow">→</span>
                    <span class="pipeline-step ${patient.status === 'ready' ? 'active' : (getStatusIndex(patient.status) > 2 ? 'completed' : '')}">Ready</span>
                    <span class="pipeline-arrow">→</span>
                    <span class="pipeline-step ${patient.status === 'arrived' ? 'active' : ''}">Arrived</span>
                </div>
            </div>
        </div>

        <!-- Warning Flags -->
        ${renderFlagsSection(patient)}

        <!-- Chief Complaint -->
        <div class="detail-section">
            <div class="detail-section-header">
                <span class="section-icon">📋</span>
                <h3>Chief Complaint</h3>
            </div>
            <div class="detail-section-content">
                <p class="chief-complaint-text">${patient.chiefComplaint || 'Not provided'}</p>
            </div>
        </div>

        <!-- Assessment -->
        <div class="detail-section">
            <div class="detail-section-header">
                <span class="section-icon">🩺</span>
                <h3>Assessment</h3>
            </div>
            <div class="detail-section-content">
                ${renderPainBar(patient)}
                ${renderAssessmentFields(patient)}
            </div>
        </div>

        <!-- Medical History -->
        ${renderMedicalHistorySection(patient)}

        <!-- Photos -->
        ${renderPhotosSection(patient)}

        <!-- AI Triage Suggestion -->
        <div class="detail-section ai-section" id="triage-suggestion-section">
            <div class="detail-section-header">
                <span class="section-icon">🤖</span>
                <h3>AI Triage Suggestion</h3>
            </div>
            <div class="detail-section-content">
                ${patient.aiTriagePending ?
                    '<p class="triage-loading">Generating suggestions...</p>' :
                    (patient.aiTriageSuggestion ?
                        `<div class="triage-content">${formatTriageSuggestion(patient.aiTriageSuggestion)}</div>` :
                        '<p class="triage-pending">Suggestion will appear here...</p>'
                    )
                }
                <p class="triage-disclaimer">⚠️ This is an AI suggestion, not a diagnosis.</p>
            </div>
        </div>

        <!-- ER Notes -->
        <div class="detail-section notes-section">
            <div class="detail-section-header">
                <span class="section-icon">📝</span>
                <h3>ER Notes</h3>
            </div>
            <div class="detail-section-content">
                <div class="notes-input-wrapper">
                    <textarea id="note-input" class="note-input" placeholder="Add notes for this patient..." rows="2"></textarea>
                    <button class="add-note-btn" onclick="ERDashboard.addNoteFromInput()">Add Note</button>
                </div>
                <div class="notes-list" id="notes-list">
                    ${renderNotesList(patient)}
                </div>
            </div>
        </div>

        <!-- Notify Team Button -->
        <button class="notify-team-btn" onclick="ERDashboard.notifyTeam('${patient.id}')">
            <span class="notify-icon">🔔</span>
            <span>Notify Team About This Patient</span>
        </button>
    `;

    // Set up note input enter key handler
    const noteInput = document.getElementById('note-input');
    if (noteInput) {
        noteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                addNoteFromInput();
            }
        });
    }
}

/**
 * Get status index for pipeline display
 */
function getStatusIndex(status) {
    const order = ['new', 'reviewing', 'ready', 'arrived'];
    return order.indexOf(status);
}

/**
 * Format demographics string
 */
function formatDemographics(patient) {
    const parts = [];
    if (patient.gender) parts.push(patient.gender);
    if (patient.age) parts.push(patient.age);
    return parts.length > 0 ? parts.join(', ') : 'Demographics not provided';
}

/**
 * Render warning flags section
 */
function renderFlagsSection(patient) {
    if (!patient.warningFlags || patient.warningFlags.length === 0) {
        return '';
    }

    const flagsHtml = patient.warningFlags.map(flag =>
        `<li class="flag-item">• ${flag}</li>`
    ).join('');

    return `
        <div class="detail-section flags-section">
            <div class="detail-section-header">
                <span class="section-icon">⚠️</span>
                <h3>Flags</h3>
            </div>
            <div class="detail-section-content">
                <ul class="flags-list">${flagsHtml}</ul>
            </div>
        </div>
    `;
}

/**
 * Render pain level bar
 */
function renderPainBar(patient) {
    if (!patient.painLevel) {
        return '<div class="pain-display"><span class="pain-label">Pain</span><span class="pain-value">Not reported</span></div>';
    }

    const painNum = parseInt(patient.painLevel) || 0;
    const painPercent = (painNum / 10) * 100;
    let painClass = 'pain-low';
    if (painNum >= 7) painClass = 'pain-high';
    else if (painNum >= 4) painClass = 'pain-medium';

    const location = patient.painLocation ? ` — ${patient.painLocation}` : '';

    return `
        <div class="pain-display">
            <span class="pain-label">Pain</span>
            <div class="pain-bar-container">
                <div class="pain-bar ${painClass}" style="width: ${painPercent}%"></div>
            </div>
            <span class="pain-value ${painClass}">${patient.painLevel}${location}</span>
        </div>
    `;
}

/**
 * Render assessment fields
 */
function renderAssessmentFields(patient) {
    const fields = [
        { label: 'Mobility', value: patient.mobility },
        { label: 'Bleeding', value: patient.bleeding },
        { label: 'Breathing', value: patient.breathing },
        { label: 'Consciousness', value: patient.consciousness }
    ];

    const filledFields = fields.filter(f => f.value);
    if (filledFields.length === 0) {
        return '<p class="no-data">No assessment data provided</p>';
    }

    return `
        <div class="assessment-fields">
            ${filledFields.map(f => `
                <div class="assessment-row">
                    <span class="assessment-label">${f.label}</span>
                    <span class="assessment-value">${f.value}</span>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Render medical history section
 */
function renderMedicalHistorySection(patient) {
    const fields = [
        { label: 'Allergies', value: patient.allergies },
        { label: 'Medications', value: patient.medications },
        { label: 'Conditions', value: patient.medicalHistory }
    ];

    // Add dynamic fields (diabetes, pregnancy, etc.)
    const standardFields = ['chiefComplaint', 'painLevel', 'painLocation',
        'consciousness', 'bleeding', 'mobility', 'breathing', 'allergies',
        'medications', 'medicalHistory', 'destination', 'eta', 'photos',
        'photosCount', 'age', 'gender', 'name', 'id', 'status', 'receivedAt',
        'etaTimestamp', 'fullReport', 'warningFlags', 'aiTriageSuggestion',
        'aiTriagePending', 'erNotes'];

    Object.keys(patient).forEach(key => {
        if (!standardFields.includes(key) && patient[key]) {
            fields.push({
                label: formatFieldLabel(key),
                value: patient[key]
            });
        }
    });

    const filledFields = fields.filter(f => f.value);
    if (filledFields.length === 0) {
        return '';
    }

    return `
        <div class="detail-section">
            <div class="detail-section-header">
                <span class="section-icon">💊</span>
                <h3>Medical History</h3>
            </div>
            <div class="detail-section-content">
                <div class="history-fields">
                    ${filledFields.map(f => `
                        <div class="history-row">
                            <span class="history-label">${f.label}</span>
                            <span class="history-value">${f.value}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

/**
 * Format field label from camelCase
 */
function formatFieldLabel(fieldName) {
    return fieldName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

/**
 * Render photos section
 */
function renderPhotosSection(patient) {
    const photos = patient.photos || [];
    const photoCount = photos.length;

    if (photoCount === 0) {
        return `
            <div class="detail-section">
                <div class="detail-section-header">
                    <span class="section-icon">📷</span>
                    <h3>Photos</h3>
                </div>
                <div class="detail-section-content">
                    <p class="no-data">No photos attached</p>
                </div>
            </div>
        `;
    }

    const photosHtml = photos.map((photo, index) => `
        <div class="photo-item" onclick="ERDashboard.openPhotoModal('${patient.id}', ${index})">
            <div class="photo-thumbnail">
                ${photo.data ?
                    `<img src="${photo.data}" alt="Patient photo ${index + 1}">` :
                    `<div class="photo-placeholder">📷</div>`
                }
            </div>
            <div class="photo-description">
                <p class="photo-text">${photo.description || 'No description'}</p>
                <span class="photo-attribution">— Clara AI</span>
            </div>
        </div>
    `).join('');

    return `
        <div class="detail-section">
            <div class="detail-section-header">
                <span class="section-icon">📷</span>
                <h3>Photos (${photoCount})</h3>
            </div>
            <div class="detail-section-content">
                <div class="photos-grid">${photosHtml}</div>
            </div>
        </div>
    `;
}

/**
 * Format triage suggestion for display
 */
function formatTriageSuggestion(suggestion) {
    if (!suggestion) return '';

    // Convert markdown-style bullets to HTML
    return suggestion
        .split('\n')
        .map(line => {
            line = line.trim();
            if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
                return `<li>${line.substring(1).trim()}</li>`;
            }
            return line ? `<p>${line}</p>` : '';
        })
        .join('')
        .replace(/<li>/g, '<ul><li>')
        .replace(/<\/li>(?!<li>)/g, '</li></ul>')
        .replace(/<\/ul><ul>/g, '');
}

/**
 * Update just the triage suggestion section
 */
function updateTriageSuggestionSection(patient) {
    const section = document.getElementById('triage-suggestion-section');
    if (!section) return;

    const content = section.querySelector('.detail-section-content');
    if (content) {
        content.innerHTML = `
            ${patient.aiTriageSuggestion ?
                `<div class="triage-content">${formatTriageSuggestion(patient.aiTriageSuggestion)}</div>` :
                '<p class="triage-pending">Could not generate suggestions.</p>'
            }
            <p class="triage-disclaimer">⚠️ This is an AI suggestion, not a diagnosis.</p>
        `;
    }
}

/**
 * Render notes list
 */
function renderNotesList(patient) {
    const notes = patient.erNotes || [];

    if (notes.length === 0) {
        return '<p class="no-notes">No notes yet.</p>';
    }

    return notes.map((note, index) => {
        const time = new Date(note.timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        return `
            <div class="note-item">
                <div class="note-header">
                    <span class="note-number">Note ${index + 1}</span>
                    <span class="note-time">${time}</span>
                </div>
                <p class="note-text">${note.text}</p>
            </div>
        `;
    }).join('');
}

/**
 * Add note from input field
 */
function addNoteFromInput() {
    const input = document.getElementById('note-input');
    if (!input || !input.value.trim()) return;

    const noteText = input.value.trim();
    input.value = '';

    addPatientNote(currentDetailPatientId, noteText);
}

/**
 * Add a note to a patient
 */
function addPatientNote(patientId, noteText) {
    const patient = getPatient(patientId);
    if (!patient) return;

    if (!patient.erNotes) {
        patient.erNotes = [];
    }

    patient.erNotes.push({
        text: noteText,
        timestamp: Date.now()
    });

    savePatientsToStorage();

    // Update notes display
    const notesList = document.getElementById('notes-list');
    if (notesList) {
        notesList.innerHTML = renderNotesList(patient);
    }

    showDashboardToast('Note added');
}

/**
 * Change patient status from detail view
 */
function changeDetailStatus(newStatus) {
    if (!currentDetailPatientId) return;
    updatePatientStatus(currentDetailPatientId, newStatus);

    // Re-render to update status display
    const patient = getPatient(currentDetailPatientId);
    if (patient) {
        renderPatientDetail(patient);
    }
}

/**
 * Notify team about patient
 */
function notifyTeam(patientId) {
    const patient = getPatient(patientId);
    if (!patient) return;

    showDashboardToast(`Team notified about ${patient.name}`);
}

/**
 * Open photo modal
 */
function openPhotoModal(patientId, photoIndex) {
    const patient = getPatient(patientId);
    if (!patient || !patient.photos || !patient.photos[photoIndex]) return;

    const photo = patient.photos[photoIndex];
    const modal = document.getElementById('photo-modal');
    const img = document.getElementById('photo-modal-img');
    const description = document.getElementById('photo-modal-description');
    const counter = document.getElementById('photo-modal-counter');

    if (!modal || !img) return;

    img.src = photo.data || '';
    if (description) description.textContent = photo.description || '';
    if (counter) counter.textContent = `${photoIndex + 1} of ${patient.photos.length}`;

    // Store current photo index for navigation
    modal.dataset.patientId = patientId;
    modal.dataset.photoIndex = photoIndex;

    modal.classList.add('visible');
}

/**
 * Close photo modal
 */
function closePhotoModal() {
    const modal = document.getElementById('photo-modal');
    if (modal) {
        modal.classList.remove('visible');
    }
}

/**
 * Navigate photos in modal
 */
function navigatePhoto(direction) {
    const modal = document.getElementById('photo-modal');
    if (!modal) return;

    const patientId = modal.dataset.patientId;
    const currentIndex = parseInt(modal.dataset.photoIndex) || 0;
    const patient = getPatient(patientId);

    if (!patient || !patient.photos) return;

    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = patient.photos.length - 1;
    if (newIndex >= patient.photos.length) newIndex = 0;

    openPhotoModal(patientId, newIndex);
}

/**
 * Show dashboard toast notification
 */
function showDashboardToast(message) {
    // Remove existing toast
    const existingToast = document.querySelector('.dashboard-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'dashboard-toast';
    toast.textContent = message;

    const dashboard = document.getElementById('er-dashboard');
    if (dashboard) {
        dashboard.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('visible'), 10);

        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

/**
 * Cycle patient status to next state
 * @param {string} patientId - Patient ID
 */
function cyclePatientStatus(patientId) {
    const patient = getPatient(patientId);
    if (!patient) return;

    const statusOrder = ['new', 'reviewing', 'ready', 'arrived'];
    const currentIndex = statusOrder.indexOf(patient.status);
    const nextIndex = (currentIndex + 1) % statusOrder.length;
    const newStatus = statusOrder[nextIndex];

    updatePatientStatus(patientId, newStatus);
}

// ========================================
// AI TRIAGE SUGGESTION
// ========================================

/**
 * Generate AI triage suggestion for a patient
 * @param {object} patient - Patient object
 * @returns {Promise<string>} - Suggestion text
 */
async function generateTriageSuggestion(patient) {
    const report = patient.fullReport || patient;

    const prompt = `You are an ER triage assistant AI. Based on this patient report, provide 2-4 brief preparation suggestions for the ER staff. Focus on:
- What tests/imaging might be needed
- What specialists might need to be consulted
- Any specific preparations based on medical history
- What to watch for

Patient Report:
Chief Complaint: ${report.chiefComplaint || 'Not provided'}
Pain Level: ${report.painLevel || 'Not reported'}
Pain Location: ${report.painLocation || 'Not specified'}
Consciousness: ${report.consciousness || 'Not reported'}
Bleeding: ${report.bleeding || 'Not reported'}
Mobility: ${report.mobility || 'Not reported'}
Breathing: ${report.breathing || 'Not reported'}
Allergies: ${report.allergies || 'None known'}
Medications: ${report.medications || 'None'}
Medical History: ${report.medicalHistory || 'None provided'}
${report.diabetes ? `Diabetes: ${report.diabetes}` : ''}
${report.pregnancy ? `Pregnancy: ${report.pregnancy}` : ''}
Photos: ${patient.photos?.length || 0} attached

Respond with a brief bullet list only (use • for bullets). No diagnosis, no treatment advice. Just preparation suggestions. Keep it concise (3-5 lines max).`;

    try {
        // Check if Gemini API is available
        if (!window.GEMINI_API_KEY) {
            return '• Unable to generate suggestions - API not configured\n• Please review patient information manually';
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${window.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 300
                }
            })
        });

        if (!response.ok) {
            throw new Error('API request failed');
        }

        const data = await response.json();
        const suggestion = data.candidates?.[0]?.content?.parts?.[0]?.text;

        return suggestion || '• Unable to generate suggestions at this time';
    } catch (error) {
        console.error('Error generating triage suggestion:', error);
        return '• Error generating suggestions\n• Please assess patient manually based on report data';
    }
}

// ========================================
// STORAGE
// ========================================

/**
 * Save patients to localStorage
 */
function savePatientsToStorage() {
    try {
        // Don't save photo data to storage (too large)
        const patientsToSave = incomingPatients.map(p => ({
            ...p,
            photos: p.photos?.map(photo => ({
                id: photo.id,
                description: photo.description
                // Exclude base64 data
            })) || []
        }));
        localStorage.setItem('claraER_patients', JSON.stringify(patientsToSave));
    } catch (e) {
        console.error('Failed to save patients to storage:', e);
    }
}

/**
 * Load patients from localStorage
 */
function loadPatientsFromStorage() {
    try {
        const stored = localStorage.getItem('claraER_patients');
        if (stored) {
            incomingPatients = JSON.parse(stored);
            console.log('Loaded', incomingPatients.length, 'patients from storage');
        }
    } catch (e) {
        console.error('Failed to load patients from storage:', e);
        incomingPatients = [];
    }
}

// ========================================
// DEMO HELPERS
// ========================================

/**
 * Add a sample patient for demo
 */
function addSamplePatient() {
    const sampleReports = [
        {
            chiefComplaint: 'Fell from ladder, right arm injury',
            painLevel: '8/10',
            painLocation: 'Right forearm',
            consciousness: 'Alert and oriented',
            bleeding: 'None visible',
            mobility: 'Cannot move right wrist',
            breathing: 'Normal',
            allergies: 'None known',
            destination: 'City General ER',
            eta: '8 minutes',
            photos: []
        },
        {
            chiefComplaint: 'Chest discomfort, shortness of breath',
            painLevel: '6/10',
            painLocation: 'Center of chest',
            consciousness: 'Alert',
            bleeding: 'None',
            mobility: 'Normal',
            breathing: 'Labored',
            allergies: 'Penicillin',
            medications: 'Metoprolol, Aspirin',
            destination: 'City General ER',
            eta: '5 minutes',
            photos: []
        },
        {
            chiefComplaint: 'Laceration on left hand from kitchen knife',
            painLevel: '4/10',
            painLocation: 'Left palm',
            consciousness: 'Alert and oriented',
            bleeding: 'Moderate, controlled with pressure',
            mobility: 'Limited in affected hand',
            breathing: 'Normal',
            allergies: 'None',
            destination: 'City General ER',
            eta: '12 minutes',
            photos: []
        },
        {
            chiefComplaint: 'Severe headache, sensitivity to light',
            painLevel: '9/10',
            painLocation: 'Entire head',
            consciousness: 'Alert but confused',
            bleeding: 'None',
            mobility: 'Can walk but unsteady',
            breathing: 'Normal',
            allergies: 'Sulfa drugs',
            destination: 'City General ER',
            eta: '10 minutes',
            photos: []
        },
        {
            chiefComplaint: 'Twisted ankle while running',
            painLevel: '5/10',
            painLocation: 'Right ankle',
            consciousness: 'Alert',
            bleeding: 'None',
            mobility: 'Cannot bear weight',
            breathing: 'Normal',
            allergies: 'None known',
            destination: 'City General ER',
            eta: '15 minutes',
            diabetes: 'Type 2',
            photos: []
        }
    ];

    // Pick a random sample
    const sample = sampleReports[Math.floor(Math.random() * sampleReports.length)];

    // Add random name
    sample.name = generatePatientName();
    sample.age = Math.floor(Math.random() * 50) + 18;
    sample.gender = Math.random() > 0.5 ? 'Male' : 'Female';

    addIncomingPatient(sample);
}

/**
 * Clear all patients
 */
function clearAllPatients() {
    if (confirm('Remove all patients from the dashboard?')) {
        incomingPatients = [];
        savePatientsToStorage();
        renderPatientList();
    }
}

/**
 * Simulate patient arrival
 */
function simulateArrival() {
    // Find first non-arrived patient
    const patient = incomingPatients.find(p => p.status !== 'arrived');
    if (patient) {
        updatePatientStatus(patient.id, 'arrived');
    } else {
        console.log('No patients to mark as arrived');
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Generate a unique ID
 * @returns {string} - Unique ID
 */
function generateUniqueId() {
    return 'patient_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate a random patient name
 * @returns {string} - Patient name
 */
function generatePatientName() {
    const firstNames = ['Sarah', 'John', 'Emma', 'Michael', 'Lisa', 'David', 'Maria', 'James', 'Emily', 'Robert', 'Jennifer', 'William', 'Jessica', 'Daniel', 'Ashley'];
    const lastInitials = ['M', 'D', 'R', 'S', 'T', 'W', 'B', 'J', 'K', 'L', 'P', 'C'];
    return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastInitials[Math.floor(Math.random() * lastInitials.length)]}.`;
}

/**
 * Parse ETA string or number to minutes
 * @param {string|number} etaValue - ETA string (e.g., "8 minutes", "~8 min") or number
 * @returns {number|null} - Minutes or null
 */
function parseETA(etaValue) {
    if (etaValue === null || etaValue === undefined) return null;
    // If it's already a number, return it
    if (typeof etaValue === 'number') return etaValue;
    // If it's a string, parse the number from it
    if (typeof etaValue === 'string') {
        const match = etaValue.match(/(\d+)/);
        return match ? parseInt(match[1]) : null;
    }
    return null;
}

// ========================================
// NOTIFICATION SOUND
// ========================================

/**
 * Initialize notification sound
 */
function initNotificationSound() {
    // Create audio element with a simple notification sound (base64 encoded short beep)
    notificationSound = new Audio();
    // Simple notification tone - a short beep
    notificationSound.src = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU1vT2+AgICAgICAgICAgICAgICA' +
        'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
        'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
    notificationSound.volume = 0.3;
}

/**
 * Play notification sound
 */
function playNotificationSound() {
    if (notificationSound && !isDashboardMuted) {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(() => {
            // Autoplay might be blocked, that's okay
        });
    }
}

/**
 * Toggle dashboard mute
 */
function toggleDashboardMute() {
    isDashboardMuted = !isDashboardMuted;
    updateMuteButton();
}

/**
 * Update mute button display
 */
function updateMuteButton() {
    const muteBtn = document.getElementById('dashboard-mute-btn');
    if (muteBtn) {
        muteBtn.textContent = isDashboardMuted ? '🔕' : '🔔';
        muteBtn.title = isDashboardMuted ? 'Unmute notifications' : 'Mute notifications';
    }
}

// ========================================
// DASHBOARD NOTIFICATIONS
// ========================================

/**
 * Show dashboard notification toast
 * @param {string} message - Notification message
 * @param {string} type - 'info', 'update', 'warning', 'success'
 */
function showDashboardNotification(message, type = 'info') {
    let container = document.getElementById('dashboard-notifications');

    // Create container if it doesn't exist
    if (!container) {
        container = document.createElement('div');
        container.id = 'dashboard-notifications';
        const dashboard = document.getElementById('er-dashboard');
        if (dashboard) {
            dashboard.appendChild(container);
        } else {
            return;
        }
    }

    const toast = document.createElement('div');
    toast.className = `dashboard-notification dashboard-notification-${type}`;
    toast.innerHTML = `
        <span class="notification-icon">${getNotificationIcon(type)}</span>
        <span class="notification-message">${message}</span>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.add('notification-visible');
    });

    // Remove after delay
    setTimeout(() => {
        toast.classList.remove('notification-visible');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Get icon for notification type
 */
function getNotificationIcon(type) {
    switch (type) {
        case 'info': return '🔔';
        case 'update': return '📝';
        case 'warning': return '⚠️';
        case 'success': return '✅';
        default: return 'ℹ️';
    }
}

// ========================================
// NEW PATIENT ANIMATION
// ========================================

/**
 * Animate new patient card entrance
 * @param {string} patientId - Patient ID
 */
function animateNewPatientCard(patientId) {
    const card = document.querySelector(`[data-patient-id="${patientId}"]`);
    if (!card) return;

    // Add animation class
    card.classList.add('patient-card-new');

    // Remove after animation completes
    setTimeout(() => {
        card.classList.remove('patient-card-new');
    }, 2000);
}

// ========================================
// EXPORTS
// ========================================

window.ERDashboard = {
    // Initialization
    init: initERDashboard,

    // Patient management
    addPatient: addIncomingPatient,
    updateStatus: updatePatientStatus,
    removePatient,
    getPatient,
    getPatients: () => [...incomingPatients],

    // Rendering
    render: renderPatientList,

    // Filter/Sort
    setFilter,
    setSort,

    // Detail view
    showDetail: showPatientDetail,
    hideDetail: hidePatientDetail,
    changeDetailStatus,
    addNote: addPatientNote,
    addNoteFromInput,
    notifyTeam,

    // Photo modal
    openPhotoModal,
    closePhotoModal,
    navigatePhoto,

    // Demo helpers
    addSamplePatient,
    clearAllPatients,
    simulateArrival,

    // Events
    events: dashboardEvents,

    // Utilities
    detectWarningFlags,
    parseETA,
    showToast: showDashboardToast,
    showNotification: showDashboardNotification,

    // Sound
    toggleMute: toggleDashboardMute,
    isMuted: () => isDashboardMuted
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize immediately - no delay needed
    initERDashboard();
});
