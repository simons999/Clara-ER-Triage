// claraSync.js — Real-time sync between Clara and ER Dashboard

const ClaraSync = (function() {

    // Event types
    const EVENTS = {
        NEW_PATIENT: 'clara:new_patient',
        PATIENT_UPDATE: 'clara:patient_update',
        REPORT_COMPLETE: 'clara:report_complete',
        STATUS_CHANGE: 'clara:status_change',
        ETA_UPDATE: 'clara:eta_update'
    };

    // Internal event bus (for same-page communication)
    const eventBus = {
        listeners: {},
        on(event, callback) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(callback);
            return () => this.off(event, callback); // Return unsubscribe function
        },
        off(event, callback) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        },
        emit(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(cb => {
                    try {
                        cb(data);
                    } catch (e) {
                        console.error('Error in event listener:', e);
                    }
                });
            }
        }
    };

    // BroadcastChannel for cross-tab communication
    let broadcastChannel = null;

    // Track if initialized
    let initialized = false;

    /**
     * Initialize the sync system
     */
    function init() {
        if (initialized) {
            console.log('ClaraSync already initialized');
            return;
        }

        // Initialize BroadcastChannel if supported
        if ('BroadcastChannel' in window) {
            try {
                broadcastChannel = new BroadcastChannel('clara_er_sync');
                broadcastChannel.onmessage = handleBroadcastMessage;
                console.log('ClaraSync: BroadcastChannel initialized');
            } catch (e) {
                console.warn('ClaraSync: BroadcastChannel failed, using localStorage fallback');
            }
        }

        // Fallback: Listen for localStorage changes (cross-tab)
        window.addEventListener('storage', handleStorageEvent);

        initialized = true;
        console.log('ClaraSync initialized');
    }

    /**
     * Handle messages from BroadcastChannel
     */
    function handleBroadcastMessage(event) {
        const { type, data, timestamp, source } = event.data;

        // Ignore messages from self (same tab)
        if (source === getTabId()) {
            return;
        }

        console.log('ClaraSync received broadcast:', type, data);

        // Relay to internal event bus
        eventBus.emit(type, data);
    }

    /**
     * Handle localStorage changes (fallback for cross-tab)
     */
    function handleStorageEvent(event) {
        if (event.key === 'clara_sync_event') {
            try {
                const { type, data, source } = JSON.parse(event.newValue);

                // Ignore messages from self
                if (source === getTabId()) {
                    return;
                }

                console.log('ClaraSync received storage event:', type, data);
                eventBus.emit(type, data);
            } catch (e) {
                console.error('Error parsing sync event:', e);
            }
        }
    }

    /**
     * Get unique tab identifier
     */
    let tabId = null;
    function getTabId() {
        if (!tabId) {
            tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        return tabId;
    }

    /**
     * Broadcast an event to all listeners
     * @param {string} type - Event type from EVENTS
     * @param {object} data - Event data
     */
    function broadcast(type, data) {
        const message = {
            type,
            data,
            timestamp: Date.now(),
            source: getTabId()
        };

        console.log('ClaraSync broadcasting:', type, data);

        // Internal event bus (same page) - always emit locally
        eventBus.emit(type, data);

        // BroadcastChannel (cross-tab)
        if (broadcastChannel) {
            try {
                broadcastChannel.postMessage(message);
            } catch (e) {
                console.warn('BroadcastChannel send failed:', e);
            }
        }

        // localStorage fallback (cross-tab)
        // Use a unique key each time to ensure 'storage' event fires
        try {
            localStorage.setItem('clara_sync_event', JSON.stringify(message));
        } catch (e) {
            console.warn('localStorage sync failed:', e);
        }
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event type
     * @param {function} callback - Handler function
     * @returns {function} Unsubscribe function
     */
    function on(event, callback) {
        return eventBus.on(event, callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event type
     * @param {function} callback - Handler function to remove
     */
    function off(event, callback) {
        eventBus.off(event, callback);
    }

    /**
     * Clean up resources
     */
    function destroy() {
        if (broadcastChannel) {
            broadcastChannel.close();
            broadcastChannel = null;
        }
        window.removeEventListener('storage', handleStorageEvent);
        eventBus.listeners = {};
        initialized = false;
        console.log('ClaraSync destroyed');
    }

    // Public API
    return {
        EVENTS,
        init,
        on,
        off,
        broadcast,
        destroy,
        isInitialized: () => initialized
    };

})();

// Make available on window object
window.ClaraSync = ClaraSync;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClaraSync;
}
