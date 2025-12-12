# Clara - Emergency Room Pre-Arrival Triage

A modern, intuitive mobile-first web application that helps patients communicate their medical emergency to the ER before arrival, improving triage efficiency and patient outcomes.

## 🩺 Overview

Clara is an intelligent ER pre-arrival assistant that allows patients or bystanders to report emergency situations through voice or text. The app collects critical medical information and prepares a structured report for the ER team, enabling faster and more informed triage upon arrival.

## ✨ Features

### Dual Input Modes
- **Voice Mode**: Always-listening interface with animated visual feedback
  - Idle state: Gentle breathing animation
  - Listening state: Active ripple effects
  - Responding state: Morphing glow animations
- **Text Mode**: Clean chat interface with message bubbles
  - Real-time conversation flow
  - Message history with smooth scrolling

### Smart Report Card
- **Press-and-hold interaction**: Hold the report bar to peek at collected information
- **Real-time field tracking**: Visual status indicators for each data point
  - ✓ Collected (green)
  - ⏳ Asking (amber)
  - — Pending (gray)
- **Organized medical data collection**:
  - Chief complaint
  - Consciousness level
  - Pain level and location
  - Bleeding status
  - Mobility assessment
  - Breathing status
  - Allergies
  - Current medications
  - Medical history

### Modern, Premium UI
- Clean, minimal design inspired by Apple Health and modern fintech apps
- Generous whitespace and subtle shadows
- Smooth animations and micro-interactions
- Professional yet approachable aesthetic
- Mobile-optimized (390px × 700px phone frame)

### Demo Features
- **ER Dashboard**: Toggle view to see how reports appear on the hospital side
- **Mode Switching**: Seamlessly switch between voice and text at any time
- **Global 911 Button**: Always accessible emergency calling (demo only)
- **Reset Demo**: Start fresh with one click

## 🚀 Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- No build tools or dependencies required - pure HTML/CSS/JavaScript

### Installation

1. **Clone or download the repository**
   ```bash
   git clone <your-repo-url>
   cd Clara-ER
   ```

2. **Open in browser**
   - Simply open `index.html` in your web browser
   - Or use a local server (recommended):
     ```bash
     # Using Python 3
     python -m http.server 8000

     # Using Python 2
     python -m SimpleHTTPServer 8000

     # Using Node.js
     npx serve
     ```
   - Then navigate to `http://localhost:8000`

### No Installation Needed!
This is a static web app with zero dependencies. Just open the HTML file and it works!

## 📁 Project Structure

```
Clara-ER/
├── index.html          # Main HTML structure
├── styles.css          # All styling and animations
├── app.js              # Application logic and interactions
├── text.svg            # Text/chat mode icon
├── speak.svg           # Voice/microphone mode icon
├── report_icon.svg     # Report card icon
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## 🎮 How to Use

### Welcome Screen
1. Choose your preferred input mode:
   - **Speak**: Activates voice mode with animated blob
   - **Type**: Opens text chat interface

### Voice Mode
- The blob animation indicates Clara's state:
  - **Gentle pulse**: Ready and listening
  - **Active ripples**: Processing your speech
  - **Flowing glow**: Clara is responding
- Press **D** key to show debug controls for testing states

### Text Mode
- Type your message and press Enter or click send
- Messages appear as chat bubbles
- Switch to voice mode anytime with the microphone icon

### Report Card
- **Press and hold** the "Your Report" bar at the bottom
- Review collected information while holding
- **Release** to dismiss
- Click the dimmed background to close immediately

### Demo Controls (Bottom Bar)
- **Toggle ER View**: See the hospital dashboard perspective
- **Reset Demo**: Return to welcome screen with fresh data

## 🛠️ Technical Details

### Technologies
- **HTML5**: Semantic structure
- **CSS3**: Modern layouts with Flexbox, CSS Grid, animations, and variables
- **Vanilla JavaScript**: No frameworks - pure JS for maximum performance
- **SVG Icons**: Scalable vector graphics for crisp visuals

### Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Key Features
- **Responsive**: Optimized for mobile (390px width)
- **Accessible**: Semantic HTML and ARIA-friendly
- **Performant**: Minimal DOM manipulation, CSS animations
- **Progressive**: Works offline (no external dependencies)

## 🎨 Design System

### Colors
- **Clara Blue**: `#20A0D8` - Primary brand color
- **Success**: `#34C759` - Collected fields
- **Warning**: `#FFD60A` - Fields being asked
- **Danger**: `#FF3B30` - 911 button

### Shadows
- Subtle, layered shadows for depth
- No harsh borders - soft, modern aesthetic

### Animations
- Smooth transitions (0.15s - 0.3s)
- Spring-like easing for natural feel
- Micro-interactions on all interactive elements

## 🔮 Future Enhancements

- [ ] Real speech-to-text integration
- [ ] Text-to-speech for Clara's responses
- [ ] Backend integration for actual ER communication
- [ ] Photo/video attachment for injuries
- [ ] GPS location sharing
- [ ] Multi-language support
- [ ] Real-time ETA calculation
- [ ] Hospital selection with availability
- [ ] Offline mode with sync

## 📝 Development Notes

### Demo Data
The app currently includes sample data for demonstration:
- 4 pre-filled report fields (Chief complaint, Consciousness, Pain level, Pain location)
- 1 field marked as "Asking" (Bleeding)
- Voice mode cycles through states automatically (3-second intervals)

### Customization
- Edit CSS variables in `styles.css` (lines 1-56) to change colors/spacing
- Modify `reportFields` array in `app.js` to add/remove report fields
- Update `reportData` object to change field names

## 🤝 Contributing

This is a demonstration project. Feel free to fork and modify for your own use!

## 📄 License

This project is provided as-is for educational and demonstration purposes.

## 👤 Author

Built with care for emergency medical communication.

---

**Note**: This is a demonstration app. The 911 button does not place actual calls. Real-world deployment would require:
- HIPAA compliance for medical data
- Secure backend infrastructure
- Hospital system integration
- Testing with medical professionals
- Regulatory approval
