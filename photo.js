// Clara Photo Capture - Image upload and processing for Gemini Vision

// Photo state
let currentPhotoFile = null;
let currentPhotoPreviewUrl = null;

// Configuration
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const THUMBNAIL_SIZE = 200;

// ========================================
// PHOTO CAPTURE INITIALIZATION
// ========================================

/**
 * Initialize photo capture functionality
 * Creates hidden file input element
 */
function initPhotoCapture() {
    // Check if file input already exists
    if (document.getElementById('photo-file-input')) {
        return;
    }

    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'photo-file-input';
    fileInput.accept = 'image/*';
    fileInput.capture = 'environment'; // Use rear camera on mobile
    fileInput.style.display = 'none';

    // Handle file selection
    fileInput.addEventListener('change', handlePhotoSelect);

    document.body.appendChild(fileInput);
    console.log('Photo capture initialized');
}

// ========================================
// PHOTO OPTIONS ACTION SHEET
// ========================================

/**
 * Show photo options action sheet
 * Allows user to choose between camera and gallery
 */
function openPhotoOptions() {
    // Check if action sheet already exists
    let actionSheet = document.getElementById('photo-action-sheet');

    if (!actionSheet) {
        actionSheet = createActionSheet();
        document.getElementById('phone-frame').appendChild(actionSheet);
    }

    // Show action sheet
    actionSheet.classList.add('visible');

    // Add overlay click handler to close
    const overlay = actionSheet.querySelector('.action-sheet-overlay');
    overlay.onclick = closePhotoOptions;
}

/**
 * Create the action sheet element
 */
function createActionSheet() {
    const actionSheet = document.createElement('div');
    actionSheet.id = 'photo-action-sheet';
    actionSheet.className = 'photo-action-sheet';

    actionSheet.innerHTML = `
        <div class="action-sheet-overlay"></div>
        <div class="action-sheet-content">
            <div class="action-sheet-header">Share a Photo</div>
            <button class="action-sheet-btn" id="take-photo-btn">
                <span class="action-icon">📷</span>
                <span class="action-label">Take Photo</span>
            </button>
            <button class="action-sheet-btn" id="choose-photo-btn">
                <span class="action-icon">🖼️</span>
                <span class="action-label">Choose from Library</span>
            </button>
            <button class="action-sheet-btn cancel" id="cancel-photo-btn">
                Cancel
            </button>
        </div>
    `;

    // Set up button handlers
    actionSheet.querySelector('#take-photo-btn').onclick = () => {
        triggerPhotoCapture('camera');
    };

    actionSheet.querySelector('#choose-photo-btn').onclick = () => {
        triggerPhotoCapture('gallery');
    };

    actionSheet.querySelector('#cancel-photo-btn').onclick = closePhotoOptions;

    return actionSheet;
}

/**
 * Close the photo options action sheet
 */
function closePhotoOptions() {
    const actionSheet = document.getElementById('photo-action-sheet');
    if (actionSheet) {
        actionSheet.classList.remove('visible');
    }
}

/**
 * Trigger photo capture (camera or gallery)
 * @param {string} source - 'camera' or 'gallery'
 */
function triggerPhotoCapture(source) {
    closePhotoOptions();

    const fileInput = document.getElementById('photo-file-input');
    if (!fileInput) {
        initPhotoCapture();
    }

    const input = document.getElementById('photo-file-input');

    if (source === 'camera') {
        input.capture = 'environment';
    } else {
        input.removeAttribute('capture');
    }

    // Trigger file picker
    input.click();
}

// ========================================
// FILE HANDLING
// ========================================

/**
 * Handle photo file selection
 * @param {Event} event - File input change event
 */
function handlePhotoSelect(event) {
    const file = event.target.files[0];

    if (!file) {
        return;
    }

    // Reset input for future selections
    event.target.value = '';

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
        showPhotoError('Please share an image file (JPG, PNG, GIF, or WebP).');
        return;
    }

    // Warn about large files but try to process anyway
    if (file.size > MAX_FILE_SIZE) {
        console.log('Large file detected, will attempt to process:', file.size);
    }

    // Store current file and show preview
    currentPhotoFile = file;
    previewPhoto(file);
}

/**
 * Preview photo before sending
 * @param {File} file - The image file to preview
 */
function previewPhoto(file) {
    // Clean up previous preview URL
    if (currentPhotoPreviewUrl) {
        URL.revokeObjectURL(currentPhotoPreviewUrl);
    }

    // Create preview URL
    currentPhotoPreviewUrl = URL.createObjectURL(file);

    // Show preview modal
    showPreviewModal(currentPhotoPreviewUrl);
}

// ========================================
// PREVIEW MODAL
// ========================================

/**
 * Show the photo preview modal
 * @param {string} imageUrl - Object URL for the image
 */
function showPreviewModal(imageUrl) {
    let modal = document.getElementById('photo-preview-modal');

    if (!modal) {
        modal = createPreviewModal();
        document.getElementById('phone-frame').appendChild(modal);
    }

    // Set preview image
    const previewImage = modal.querySelector('.preview-image');
    previewImage.src = imageUrl;

    // Show modal
    modal.classList.add('visible');

    // Pause voice mode if active
    if (window.ClaraVoice && window.ClaraApp?.getCurrentMode() === 'voice') {
        window.ClaraVoice.stopListening();
    }
}

/**
 * Create the preview modal element
 */
function createPreviewModal() {
    const modal = document.createElement('div');
    modal.id = 'photo-preview-modal';
    modal.className = 'photo-preview-modal';

    modal.innerHTML = `
        <div class="preview-overlay"></div>
        <div class="preview-content">
            <img class="preview-image" src="" alt="Photo preview">
            <p class="preview-prompt">Send this photo to Clara?</p>
            <div class="preview-actions">
                <button class="preview-btn secondary" id="retake-photo-btn">Retake</button>
                <button class="preview-btn primary" id="send-photo-btn">Send Photo</button>
            </div>
        </div>
    `;

    // Set up handlers
    modal.querySelector('.preview-overlay').onclick = cancelPhotoPreview;
    modal.querySelector('#retake-photo-btn').onclick = retakePhoto;
    modal.querySelector('#send-photo-btn').onclick = confirmSendPhoto;

    return modal;
}

/**
 * Cancel photo preview and close modal
 */
function cancelPhotoPreview() {
    hidePreviewModal();
    cleanupCurrentPhoto();
    resumeVoiceIfNeeded();
}

/**
 * Retake photo - close preview and open camera again
 */
function retakePhoto() {
    hidePreviewModal();
    cleanupCurrentPhoto();
    openPhotoOptions();
}

/**
 * Confirm and send the photo
 */
async function confirmSendPhoto() {
    if (!currentPhotoFile) {
        console.error('No photo file to send');
        hidePreviewModal();
        return;
    }

    hidePreviewModal();

    try {
        await sendPhoto(currentPhotoFile);
    } catch (error) {
        console.error('Error sending photo:', error);
        showPhotoError('I had trouble viewing that image. Could you try sending it again?');
    } finally {
        cleanupCurrentPhoto();
        resumeVoiceIfNeeded();
    }
}

/**
 * Hide the preview modal
 */
function hidePreviewModal() {
    const modal = document.getElementById('photo-preview-modal');
    if (modal) {
        modal.classList.remove('visible');
    }
}

/**
 * Clean up current photo state
 */
function cleanupCurrentPhoto() {
    if (currentPhotoPreviewUrl) {
        URL.revokeObjectURL(currentPhotoPreviewUrl);
        currentPhotoPreviewUrl = null;
    }
    currentPhotoFile = null;
}

/**
 * Resume voice mode if it was active
 */
function resumeVoiceIfNeeded() {
    if (window.ClaraVoice && window.ClaraApp?.getCurrentMode() === 'voice') {
        window.ClaraVoice.startListening();
    }
}

// ========================================
// PHOTO SENDING
// ========================================

/**
 * Send photo to Clara
 * @param {File} file - The image file to send
 */
async function sendPhoto(file) {
    // Convert to base64
    const imageData = await imageToBase64(file);

    // Add photo message to chat
    addPhotoToChat(imageData);

    // Show typing indicator
    if (window.ClaraApp) {
        window.ClaraApp.showTypingIndicator();
    }

    try {
        // Send to Clara with image
        const userMessage = "I'm sharing a photo of what I mentioned.";
        const response = await window.Clara.sendMessageWithImage(userMessage, imageData);

        // Hide typing indicator
        if (window.ClaraApp) {
            window.ClaraApp.hideTypingIndicator();
        }

        // Add Clara's response to chat
        if (window.ClaraApp) {
            window.ClaraApp.addMessage(response.message, 'clara');

            // Show field notifications
            if (response.fieldUpdates?.length > 0) {
                response.fieldUpdates.forEach(update => {
                    window.ClaraApp.showFieldNotification(update.field);
                });
            }
        }

        // Handle voice mode - speak response
        if (window.ClaraVoice && window.ClaraApp?.getCurrentMode() === 'voice') {
            window.ClaraVoice.speakResponse(response.message, () => {
                window.ClaraVoice.startListening();
            });
        }

        // Add to report data
        await addPhotoToReport(imageData, response.message);

    } catch (error) {
        if (window.ClaraApp) {
            window.ClaraApp.hideTypingIndicator();
        }
        throw error;
    }
}

/**
 * Add photo message to chat display
 * @param {object} imageData - {base64, mimeType}
 */
function addPhotoToChat(imageData) {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;

    const photoMessage = document.createElement('div');
    photoMessage.className = 'message user photo-message';

    const thumbnail = document.createElement('img');
    thumbnail.className = 'chat-photo-thumbnail';
    thumbnail.src = `data:${imageData.mimeType};base64,${imageData.base64}`;
    thumbnail.alt = 'Shared photo';
    thumbnail.onclick = () => showPhotoViewer(imageData);

    photoMessage.appendChild(thumbnail);
    chatArea.appendChild(photoMessage);

    // Scroll to bottom
    requestAnimationFrame(() => {
        chatArea.scrollTop = chatArea.scrollHeight;
    });
}

/**
 * Add photo to report data
 * @param {object} imageData - {base64, mimeType}
 * @param {string} description - Clara's description of the photo
 */
async function addPhotoToReport(imageData, description) {
    if (!window.reportData) return;

    // Initialize photos array if needed
    if (!window.reportData.photos) {
        window.reportData.photos = [];
    }

    // Create thumbnail
    const thumbnail = await createThumbnail(imageData);

    // Add photo to report
    const photoId = 'photo_' + Date.now();
    window.reportData.photos.push({
        id: photoId,
        base64: imageData.base64,
        mimeType: imageData.mimeType,
        thumbnail: thumbnail,
        description: description.substring(0, 200),
        timestamp: Date.now()
    });

    // Store photo in a lookup for viewer access
    if (!window.claraPhotos) {
        window.claraPhotos = {};
    }
    window.claraPhotos[photoId] = imageData;

    // Update photo count in report fields
    const photoCount = window.reportData.photos.length;
    const photoField = window.reportFields.find(f => f.key === 'photos');

    if (photoField) {
        photoField.status = 'collected';
        window.reportData.photosCount = `${photoCount} photo${photoCount > 1 ? 's' : ''} attached`;
    }

    // Trigger UI update
    if (typeof window.renderReportFields === 'function') {
        window.renderReportFields();
    }
    if (typeof window.updateReportStatus === 'function') {
        window.updateReportStatus();
    }
}

// ========================================
// IMAGE CONVERSION
// ========================================

/**
 * Convert image file to base64
 * @param {File} file - Image file
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
function imageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const dataUrl = reader.result;
            const base64 = dataUrl.split(',')[1];
            const mimeType = file.type;
            resolve({ base64, mimeType });
        };

        reader.onerror = () => {
            reject(new Error('Failed to read image file'));
        };

        reader.readAsDataURL(file);
    });
}

/**
 * Create a smaller thumbnail version of the image
 * @param {object} imageData - {base64, mimeType}
 * @returns {string} - Base64 thumbnail
 */
function createThumbnail(imageData) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Calculate dimensions maintaining aspect ratio
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > THUMBNAIL_SIZE) {
                    height = Math.round(height * THUMBNAIL_SIZE / width);
                    width = THUMBNAIL_SIZE;
                }
            } else {
                if (height > THUMBNAIL_SIZE) {
                    width = Math.round(width * THUMBNAIL_SIZE / height);
                    height = THUMBNAIL_SIZE;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Get thumbnail as base64
            const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            resolve(thumbnailDataUrl.split(',')[1]);
        };

        img.onerror = () => {
            // Return original if thumbnail creation fails
            resolve(imageData.base64);
        };

        img.src = `data:${imageData.mimeType};base64,${imageData.base64}`;
    });
}

// ========================================
// PHOTO VIEWER (Full Size)
// ========================================

/**
 * Show full-size photo viewer
 * @param {object} imageData - {base64, mimeType}
 */
function showPhotoViewer(imageData) {
    let viewer = document.getElementById('photo-viewer-modal');

    if (!viewer) {
        viewer = createPhotoViewer();
        document.getElementById('phone-frame').appendChild(viewer);
    }

    // Set image
    const img = viewer.querySelector('.viewer-image');
    img.src = `data:${imageData.mimeType};base64,${imageData.base64}`;

    // Show viewer
    viewer.classList.add('visible');
}

/**
 * Create the photo viewer modal
 */
function createPhotoViewer() {
    const viewer = document.createElement('div');
    viewer.id = 'photo-viewer-modal';
    viewer.className = 'photo-viewer-modal';

    viewer.innerHTML = `
        <div class="viewer-overlay"></div>
        <div class="viewer-content">
            <button class="viewer-close-btn">×</button>
            <img class="viewer-image" src="" alt="Full size photo">
        </div>
    `;

    // Close handlers
    viewer.querySelector('.viewer-overlay').onclick = hidePhotoViewer;
    viewer.querySelector('.viewer-close-btn').onclick = hidePhotoViewer;

    return viewer;
}

/**
 * Hide photo viewer
 */
function hidePhotoViewer() {
    const viewer = document.getElementById('photo-viewer-modal');
    if (viewer) {
        viewer.classList.remove('visible');
    }
}

// ========================================
// ERROR HANDLING
// ========================================

/**
 * Show photo error message
 * @param {string} message - Error message
 */
function showPhotoError(message) {
    console.error('Photo error:', message);

    // Show in chat as Clara message
    if (window.ClaraApp) {
        window.ClaraApp.addMessage(message, 'clara');
    }

    // Also speak in voice mode
    if (window.ClaraVoice && window.ClaraApp?.getCurrentMode() === 'voice') {
        window.ClaraVoice.speakResponse(message);
    }
}

// ========================================
// DEMO HELPER
// ========================================

/**
 * Add a sample demo photo
 * Uses a simple placeholder for demo purposes
 */
async function addSamplePhoto() {
    // Create a simple placeholder image using canvas
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');

    // Draw a simple injury placeholder
    ctx.fillStyle = '#f5e6d3';
    ctx.fillRect(0, 0, 400, 300);

    // Draw arm shape
    ctx.fillStyle = '#e8d4c4';
    ctx.beginPath();
    ctx.ellipse(200, 150, 150, 80, 0, 0, 2 * Math.PI);
    ctx.fill();

    // Draw swelling indication
    ctx.fillStyle = '#d4a5a5';
    ctx.beginPath();
    ctx.ellipse(220, 140, 60, 40, 0.2, 0, 2 * Math.PI);
    ctx.fill();

    // Draw bruise indication
    ctx.fillStyle = '#b088b0';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(230, 150, 40, 25, 0.1, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Add label
    ctx.fillStyle = '#666';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sample Injury Photo (Demo)', 200, 280);

    // Convert canvas to blob then to file
    return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
            const file = new File([blob], 'sample-injury.jpg', { type: 'image/jpeg' });

            try {
                await sendPhoto(file);
                resolve(true);
            } catch (error) {
                console.error('Failed to send sample photo:', error);
                resolve(false);
            }
        }, 'image/jpeg', 0.9);
    });
}

// ========================================
// INITIALIZATION
// ========================================

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initPhotoCapture();
});

// ========================================
// EXPORTS
// ========================================

window.ClaraPhoto = {
    // Initialization
    initPhotoCapture,

    // Photo options
    openPhotoOptions,
    closePhotoOptions,

    // Photo handling
    handlePhotoSelect,
    sendPhoto,

    // Preview
    showPreviewModal,
    hidePreviewModal,

    // Viewer
    showPhotoViewer,
    hidePhotoViewer,

    // Utilities
    imageToBase64,
    createThumbnail,

    // Demo
    addSamplePhoto,

    // State
    getCurrentPhoto: () => currentPhotoFile
};
