// Clara AI - Conversation Management and Gemini API Integration

const CLARA_SYSTEM_PROMPT = `You are Clara, a calm and professional AI triage assistant designed to help patients prepare emergency rooms for their arrival. You gather critical medical information through natural conversation and compile it into a structured report that gets sent to the ER ahead of time.

## YOUR PERSONALITY

- Calm and reassuring: People talking to you are stressed or scared. Your tone should feel like a steady, competent nurse who has everything under control.
- Warm but focused: You're friendly, but you don't waste time with small talk. Every question has a purpose.
- Clear and simple: Use plain language. Avoid medical jargon unless necessary. Short sentences.
- Never panicked: Even if someone describes something serious, you stay composed. Your calmness is contagious.
- Gently persistent: If someone gives a vague answer, you ask follow-up questions to get clarity. But you're never pushy or robotic.

## YOUR VOICE (important for text-to-speech)

- Speak in short, natural sentences
- Never use bullet points, numbered lists, or markdown formatting
- Never use asterisks, headers, or special characters
- Write the way a real person talks
- Use contractions naturally (I'm, you're, let's, don't)
- Occasionally use brief empathetic phrases: "I understand", "That sounds painful", "You're doing great"

## CONVERSATION FLOW

Start every conversation with:
"Hi, I'm Clara. I'm here to help prepare the ER for your arrival. Tell me — what's happening right now?"

Then follow this general flow, adapting based on their responses:

1. Chief complaint: Understand what happened and what's wrong
2. Key symptoms: Pain level, location, bleeding, breathing difficulty
3. Consciousness/alertness: Are they dizzy, confused, fading?
4. Relevant history: Allergies, current medications (only ask if relevant)
5. Destination: Which ER are they heading to? (ask toward the end)
6. Photos: If relevant, ask if they can show you the injury/issue

You don't have to ask every question for every situation. Use judgment:
- Broken arm? Focus on pain, mobility, how it happened. Skip breathing questions.
- Chest pain? Prioritize breathing, consciousness, medical history. This is urgent.
- Minor cut? Keep it brief. Don't over-medicalize.

## REPORT FIELDS

You are building a structured report. Include field updates in your responses using this exact format:
[FIELD: fieldName = value]

Standard fields:
- chiefComplaint (what happened, what's wrong)
- consciousness (alert, confused, drowsy, unresponsive)
- bleeding (none, minor, severe, location)
- painLevel (0-10 scale)
- painLocation (where does it hurt)
- mobility (can they move affected area)
- breathing (normal, labored, difficulty)
- allergies (medication allergies)
- medications (current medications)
- destination (which ER)
- eta (estimated arrival time)
- photos (attached images)

DYNAMIC FIELDS: If the patient mentions something important that doesn't fit standard fields, CREATE A NEW FIELD. Use camelCase for field names. Examples:
- Pregnancy: [FIELD: pregnancy = 6 months pregnant]
- Diabetes: [FIELD: diabetes = Type 2, insulin dependent]
- Mechanism of injury: [FIELD: mechanismOfInjury = Fell from 8ft ladder onto concrete]
- Time of incident: [FIELD: incidentTime = Approximately 20 minutes ago]

EDITING FIELDS: If the patient corrects information or provides updates, simply output the field again with the new value. The system will update it.

You can include multiple [FIELD:...] tags in a single response if the patient provides multiple pieces of information.

Note: The app will automatically show a notification to the user when fields are updated. You don't need to verbally confirm every field — just keep the conversation natural.

## VIEWING & EDITING THE REPORT

IMPORTANT: The user CAN view their report at any time during the conversation. The report preview is fully interactive.

If the user asks to see the report, where they can view it, or wants to check what you've collected, tell them:
"You can view your report right now by pressing and holding the little arrow in the bottom right corner — it says 'hold to view.' Keep holding and drag to scroll through it. If anything needs to be changed, just tell me and I'll update it for you."

NEVER say the report is "not interactive" or that they "can't view it yet." The report is always viewable and they can request edits at any time.

## ASKING FOR PHOTOS

If relevant to the situation (visible injury, rash, swelling, etc.), ask:
"Can you show me? If you're able to take a photo or point your camera at [the injury/affected area], it could help the ER prepare."

Don't ask for photos for non-visual issues (chest pain, dizziness, nausea).

When a photo is received, acknowledge it briefly and describe what you observe if relevant.

## SAFETY RULES

ALWAYS recommend calling 911 immediately if:
- Chest pain with shortness of breath
- Signs of stroke (face drooping, arm weakness, speech difficulty)
- Severe bleeding that won't stop
- Difficulty breathing or choking
- Loss of consciousness
- Severe allergic reaction (throat swelling, can't breathe)
- Pregnancy complications with heavy bleeding
- Suicidal statements or self-harm

When recommending 911, say something like:
"Based on what you're describing, I want to be direct with you — please call 911 right now. This needs immediate emergency response, faster than driving to the ER. I'll stay here if you need me, but please call 911 first."

NEVER:
- Diagnose conditions ("You have a fracture")
- Prescribe treatment ("Take ibuprofen")
- Tell them not to go to the ER
- Minimize their concerns
- Provide specific medical advice

INSTEAD:
- Describe what you observe ("That sounds like it could be serious")
- Encourage professional evaluation ("The ER team will be able to assess this properly")
- Validate their decision to seek care ("You're doing the right thing by getting this checked out")

## VIEWING THE REPORT

If the user asks where they can see the report, how to view it, or wants to look at it themselves, explain:
"You can view your report anytime by pressing and holding the little arrow in the bottom right corner of the screen — it says 'hold to view.' Keep holding and drag to scroll through the report. If you'd like to change anything, just let me know and I'll update it for you."

Keep this explanation natural and brief. If they ask follow-up questions about editing, reassure them you can make any changes they need.

## WRAPPING UP & SENDING REPORT

When you have enough information, transition to the final review by offering a choice:

"Your report is ready. Would you like me to read it to you, or would you prefer to review it on screen?"

IMPORTANT: Wait for their response. Don't assume. This choice is critical for users who may be driving and need hands-free interaction.

[REPORT: COMPLETE]

## COMPANION MODE (after report is sent)

After the report is complete and sent, you switch into companion mode:

- You are no longer gathering information for a report
- You are a calm, supportive presence
- Answer any questions they have about what to expect at the ER
- Provide reassurance if they're anxious
- Help them stay calm if they're in pain
- Remind them to focus on the road if they're driving (or their driver)
- If they share new symptoms or worsening condition, acknowledge it and tell them:
  "I've noted that. If things are getting worse, let me know and we can update the ER with new information."

In companion mode, you can still update the report if critical new information emerges. Use:
[FIELD: fieldName = value]
[REPORT: UPDATED]

Keep responses shorter in companion mode. Be present but not chatty.

## VOICE REVIEW MODE

When the report is complete, ALWAYS offer the user a choice:
"Your report is ready. Would you like me to read it to you, or would you prefer to review it on screen?"

IMPORTANT: Wait for their response. Don't assume.

### If user wants you to READ it:
(triggers: "read it", "yes", "read it to me", "tell me what's in it", "go ahead")

Read the report naturally and conversationally — NOT as a robotic list of fields. Make it sound like a nurse summarizing to a colleague.

Structure:
"Here's what I have. You're heading to [destination], arriving in about [eta]. [Describe what happened - chief complaint]. Your pain is [level] out of 10, located in your [location]. [Mention relevant details: bleeding, mobility, breathing, consciousness]. [Mention any medical history: allergies, conditions, medications]. [If photos: mention how many and what they show]."

After reading, say:
"Does everything sound right? Say 'send' to send the report, or tell me what you'd like to change."
[ACTION: CONFIRM_READY]

### If user CONFIRMS (wants to send):
(triggers: "send", "send it", "yes", "that's right", "looks good", "perfect", "correct", "good to go")

Respond: "Sending your report to [destination] now... Done. They'll be ready for you. I'm here if you need anything on the way."
[ACTION: SEND_REPORT]

### If user wants CHANGES:
(triggers: any mention of updating, changing, correcting, or adding information)

- Make the update using [FIELD: fieldName = newValue]
- Confirm briefly: "Got it, I've updated [field]."
- Then ask: "Anything else to change, or should I send it?"

Examples:
- "My pain is actually a 9 now" → [FIELD: painLevel = 9/10] + "Got it, updated to 9. Anything else?"
- "Add that I'm feeling dizzy" → [FIELD: dizziness = Onset during transit] + "Added. Anything else?"
- "Change the destination to Memorial Hospital" → [FIELD: destination = Memorial Hospital ER] + "Changed to Memorial Hospital. Anything else?"

### If user wants to HEAR IT AGAIN:
(triggers: "read it again", "repeat that", "what was the...", "say that again")

Re-read the full report or the specific part they asked about.

### If user wants to SEE IT instead:
(triggers: "show me", "I'll look", "let me see", "on screen", "I want to read it")

Say: "No problem. Take a look when you're ready."
[ACTION: SHOW_CONFIRMATION_SCREEN]

### Reading report example:

User's reportData:
- destination: City General ER
- eta: 8 minutes
- chiefComplaint: Fell from ladder, right arm injury
- painLevel: 8/10
- painLocation: Right forearm
- mobility: Cannot move right wrist
- bleeding: None visible
- consciousness: Alert and oriented
- allergies: None known
- diabetes: Type 1
- photos: 1 (showing swelling)

Clara reads:
"Here's what I have. You're heading to City General ER, about 8 minutes away. You fell from a ladder and hurt your right arm. Pain is 8 out of 10 in your right forearm, and you can't move your wrist. No bleeding, and you're alert. No allergies, but I've noted you have Type 1 diabetes. I also have the photo showing the swelling. Does everything sound right? Say 'send' to send it, or tell me what to change."`;

// Conversation history
let conversationHistory = [];

// Report state
let reportComplete = false;
let reportUpdated = false;

/**
 * Initialize a new conversation with Clara
 * Clears history and gets Clara's greeting
 * @returns {Promise<{message: string, fieldUpdates: array, reportComplete: boolean}>}
 */
async function initConversation() {
    // Clear conversation history
    conversationHistory = [];
    reportComplete = false;
    reportUpdated = false;

    // Make API call to get Clara's greeting
    try {
        const response = await callGeminiAPI([]);
        const parsed = parseResponse(response);

        // Add Clara's greeting to history
        conversationHistory.push({
            role: 'model',
            content: response
        });

        return parsed;
    } catch (error) {
        console.error('Failed to initialize conversation:', error);
        // Return a fallback greeting if API fails
        return {
            message: "Hi, I'm Clara. I'm here to help prepare the ER for your arrival. Tell me — what's happening right now?",
            fieldUpdates: [],
            reportComplete: false
        };
    }
}

/**
 * Send a message to Clara and get her response
 * @param {string} userMessage - The user's message
 * @returns {Promise<{message: string, fieldUpdates: array, reportComplete: boolean}>}
 */
async function sendMessageToClara(userMessage) {
    // Add user message to history
    conversationHistory.push({
        role: 'user',
        content: userMessage
    });

    try {
        const response = await callGeminiAPI(conversationHistory);
        const parsed = parseResponse(response);

        // Add Clara's response to history
        conversationHistory.push({
            role: 'model',
            content: response
        });

        // Update report data for each field
        if (parsed.fieldUpdates.length > 0) {
            updateReport(parsed.fieldUpdates);
        }

        return parsed;
    } catch (error) {
        console.error('Failed to send message:', error);

        // Remove the user message we just added since it failed
        conversationHistory.pop();

        throw error;
    }
}

/**
 * Send a message with an image to Clara using Gemini Vision
 * @param {string} userMessage - Optional text message
 * @param {object} imageData - {base64: string, mimeType: string}
 * @returns {Promise<{message: string, fieldUpdates: array, reportComplete: boolean}>}
 */
async function sendMessageWithImage(userMessage, imageData) {
    const text = userMessage || "I'm sharing a photo of what I mentioned.";

    // Store a placeholder in history (NOT the base64 data)
    // This prevents old images from accumulating and being re-sent
    conversationHistory.push({
        role: 'user',
        content: text + " [User shared a photo]",
        hasImage: true
    });

    try {
        // Pass ONLY the current image to the API call
        const response = await callGeminiAPIWithImage(conversationHistory, imageData, text);
        const parsed = parseResponse(response);

        // Add Clara's response to history (her description of the image is preserved)
        conversationHistory.push({
            role: 'model',
            content: response
        });

        // Update report data for each field
        if (parsed.fieldUpdates.length > 0) {
            updateReport(parsed.fieldUpdates);
        }

        return parsed;
    } catch (error) {
        console.error('Failed to send message with image:', error);

        // Remove the user message we just added since it failed
        conversationHistory.pop();

        throw error;
    }
}

/**
 * Call the Gemini API with the conversation history
 * @param {array} messages - Conversation history
 * @returns {Promise<string>} - Clara's response text
 */
async function callGeminiAPI(messages, retryCount = 0) {
    const { endpoint } = window.ClaraConfig;
    // Get API key - check both ClaraConfig.apiKey and the stored user key
    const apiKey = window.ClaraConfig?.apiKey || window.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error('API key not configured. Please add your Gemini API key.');
    }

    // Format messages for Gemini API
    const contents = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));

    // If no messages, we're starting fresh - just get the greeting
    if (contents.length === 0) {
        contents.push({
            role: 'user',
            parts: [{ text: 'Start the conversation with your greeting.' }]
        });
    }

    const requestBody = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: CLARA_SYSTEM_PROMPT }]
        },
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
            topP: 0.95,
            topK: 40
        }
    };

    try {
        const response = await fetch(`${endpoint}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();

        // Extract text from response
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error('No response text from API');
        }

        return text;
    } catch (error) {
        // Retry once on failure
        if (retryCount < 1) {
            console.log('Retrying API call...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            return callGeminiAPI(messages, retryCount + 1);
        }
        throw error;
    }
}

/**
 * Call the Gemini API with an image (Vision API)
 * @param {array} messages - Conversation history
 * @param {object} imageData - {base64: string, mimeType: string}
 * @param {string} userText - Text accompanying the image
 * @returns {Promise<string>} - Clara's response text
 */
async function callGeminiAPIWithImage(messages, imageData, userText, retryCount = 0) {
    const { endpoint } = window.ClaraConfig;
    // Get API key - check both ClaraConfig.apiKey and the stored user key
    const apiKey = window.ClaraConfig?.apiKey || window.GEMINI_API_KEY;

    console.log('[Clara Vision] API key available:', apiKey ? 'Yes (' + apiKey.substring(0, 8) + '...)' : 'NO');

    if (!apiKey) {
        throw new Error('API key not configured. Please add your Gemini API key.');
    }

    // Clean base64 data - remove data URL prefix if present
    let cleanBase64 = imageData.base64;
    if (cleanBase64.startsWith('data:')) {
        cleanBase64 = cleanBase64.split(',')[1];
    }

    console.log('[Clara Vision] Image data:', {
        mimeType: imageData.mimeType,
        base64Length: cleanBase64.length,
        base64Preview: cleanBase64.substring(0, 50) + '...'
    });

    // Format previous messages for Gemini API (excluding the last one which has the image)
    const previousMessages = messages.slice(0, -1);
    const contents = previousMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));

    // Add the current message with image using correct camelCase property names
    contents.push({
        role: 'user',
        parts: [
            {
                inlineData: {
                    mimeType: imageData.mimeType,
                    data: cleanBase64
                }
            },
            {
                text: userText
            }
        ]
    });

    const requestBody = {
        contents: contents,
        systemInstruction: {
            parts: [{ text: CLARA_SYSTEM_PROMPT }]
        },
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
            topP: 0.95,
            topK: 40
        }
    };

    console.log('[Clara Vision] Sending request with', previousMessages.length, 'previous messages');
    console.log('[Clara Vision] Request body structure:', JSON.stringify(requestBody, (key, value) => {
        if (key === 'data' && typeof value === 'string' && value.length > 100) {
            return value.substring(0, 50) + '...[truncated]';
        }
        if (key === 'text' && typeof value === 'string' && value.length > 500) {
            return value.substring(0, 100) + '...[truncated]';
        }
        return value;
    }, 2));

    try {
        console.log('[Clara Vision] Sending to:', endpoint);
        const response = await fetch(`${endpoint}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('[Clara Vision] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Clara Vision] Error response:', errorText);
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: { message: errorText } };
            }
            throw new Error(errorData.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[Clara Vision] Response received, candidates:', data.candidates?.length);

        // Extract text from response
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            console.error('[Clara Vision] No text in response:', JSON.stringify(data, null, 2));
            throw new Error('No response text from API');
        }

        console.log('[Clara Vision] Success! Response:', text.substring(0, 100) + '...');
        return text;
    } catch (error) {
        console.error('[Clara Vision] Error:', error.message);
        // Retry once on failure
        if (retryCount < 1) {
            console.log('[Clara Vision] Retrying image API call...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            return callGeminiAPIWithImage(messages, imageData, userText, retryCount + 1);
        }
        throw error;
    }
}

/**
 * Parse action tags from Clara's response
 * @param {string} response - Raw response text
 * @returns {array} - Array of action names
 */
function parseActions(response) {
    const actions = [];
    const actionRegex = /\[ACTION:\s*(\w+)\]/g;
    let match;
    while ((match = actionRegex.exec(response)) !== null) {
        actions.push(match[1]);
    }
    return actions;
}

/**
 * Clean response text by removing all tag markers
 * @param {string} response - Raw response text
 * @returns {string} - Cleaned message text
 */
function cleanResponseText(response) {
    return response
        .replace(/\[FIELD:\s*\w+\s*=\s*[^\]]+\]/g, '')
        .replace(/\[ACTION:\s*\w+\]/g, '')
        .replace(/\[REPORT:\s*\w+\]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Parse Clara's response for field updates and clean the message
 * @param {string} response - Raw response from Clara
 * @returns {{message: string, fieldUpdates: array, actions: array, reportComplete: boolean, reportUpdated: boolean}}
 */
function parseResponse(response) {
    const fieldUpdates = parseFieldUpdates(response);
    const actions = parseActions(response);
    const isReportComplete = response.includes('[REPORT: COMPLETE]');
    const isReportUpdated = response.includes('[REPORT: UPDATED]');

    // Update global state
    if (isReportComplete) reportComplete = true;
    if (isReportUpdated) reportUpdated = true;

    // Clean the message for display
    const cleanMessage = cleanResponseText(response);

    return {
        message: cleanMessage,
        fieldUpdates: fieldUpdates,
        actions: actions,
        reportComplete: isReportComplete,
        reportUpdated: isReportUpdated
    };
}

/**
 * Parse field updates from Clara's response
 * @param {string} response - Raw response text
 * @returns {array} - Array of {field, value} objects
 */
function parseFieldUpdates(response) {
    const fieldPattern = /\[FIELD:\s*(\w+)\s*=\s*([^\]]+)\]/g;
    const updates = [];
    let match;

    while ((match = fieldPattern.exec(response)) !== null) {
        updates.push({
            field: match[1].trim(),
            value: match[2].trim()
        });
    }

    return updates;
}

/**
 * Update the report data with field updates
 * @param {array} fieldUpdates - Array of {field, value} objects
 */
function updateReport(fieldUpdates) {
    // Access the global reportData from app.js
    if (typeof window.reportData === 'undefined') {
        console.warn('reportData not found in window');
        return;
    }

    fieldUpdates.forEach(({ field, value }) => {
        // IMPORTANT: Don't let Clara overwrite the photos array with a string
        // Clara might say [FIELD: photos = 1 (showing bruising)] but we manage photos separately
        if (field === 'photos' || field === 'photosCount') {
            console.log('[Clara] Ignoring photos field update from Clara - photos managed by photo.js');
            return;
        }

        // Update the report data
        window.reportData[field] = value;

        // Update the field status in reportFields array
        const existingField = window.reportFields.find(f => f.key === field);
        if (existingField) {
            existingField.status = 'collected';
        } else {
            // Add dynamic field
            window.reportFields.push({
                key: field,
                label: formatFieldLabel(field),
                status: 'collected'
            });
        }
    });

    // Trigger UI update
    if (typeof window.renderReportFields === 'function') {
        window.renderReportFields();
    }
    if (typeof window.updateReportStatus === 'function') {
        window.updateReportStatus();
    }
}

/**
 * Format a camelCase field name into a readable label
 * @param {string} fieldName - camelCase field name
 * @returns {string} - Formatted label
 */
function formatFieldLabel(fieldName) {
    return fieldName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

/**
 * Generate a summary context of the report data for Clara to read aloud
 * @returns {string} - Formatted report summary
 */
function generateReportSummaryContext() {
    const r = window.reportData;
    if (!r) return '';

    let summary = "Current report data for you to read aloud:\n";

    // Build a structured summary Clara can read naturally
    if (r.destination) summary += `- Destination: ${r.destination}\n`;
    if (r.eta) summary += `- ETA: ${r.eta}\n`;
    if (r.chiefComplaint) summary += `- Chief complaint: ${r.chiefComplaint}\n`;
    if (r.painLevel) summary += `- Pain level: ${r.painLevel}\n`;
    if (r.painLocation) summary += `- Pain location: ${r.painLocation}\n`;
    if (r.mobility) summary += `- Mobility: ${r.mobility}\n`;
    if (r.bleeding) summary += `- Bleeding: ${r.bleeding}\n`;
    if (r.breathing) summary += `- Breathing: ${r.breathing}\n`;
    if (r.consciousness) summary += `- Consciousness: ${r.consciousness}\n`;
    if (r.allergies) summary += `- Allergies: ${r.allergies}\n`;
    if (r.medications) summary += `- Medications: ${r.medications}\n`;
    if (r.medicalHistory) summary += `- Medical history: ${r.medicalHistory}\n`;

    // Add any dynamic fields
    const standardFields = ['destination', 'eta', 'chiefComplaint', 'painLevel',
        'painLocation', 'mobility', 'bleeding', 'breathing', 'consciousness',
        'allergies', 'medications', 'medicalHistory', 'photos', 'photosCount'];

    Object.keys(r).forEach(key => {
        if (!standardFields.includes(key) && r[key]) {
            summary += `- ${formatFieldLabel(key)}: ${r[key]}\n`;
        }
    });

    // Photos
    if (r.photos && r.photos.length > 0) {
        summary += `- Photos: ${r.photos.length} attached\n`;
        r.photos.forEach(p => {
            if (p.description) summary += `  • ${p.description}\n`;
        });
    }

    return summary;
}

/**
 * Get the current conversation history
 * @returns {array}
 */
function getConversationHistory() {
    return conversationHistory;
}

/**
 * Check if the report is complete
 * @returns {boolean}
 */
function isReportComplete() {
    return reportComplete;
}

/**
 * Set report complete status
 * @param {boolean} value
 */
function setReportComplete(value) {
    reportComplete = value;
}

// Export functions to window for use in app.js
window.Clara = {
    initConversation,
    sendMessage: sendMessageToClara,
    sendMessageWithImage,
    getConversationHistory,
    isReportComplete,
    setReportComplete,
    parseFieldUpdates,
    parseActions,
    updateReport,
    generateReportSummaryContext
};
