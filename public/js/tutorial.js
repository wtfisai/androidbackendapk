// Comprehensive Multi-Page Tutorial System
class Tutorial {
    constructor() {
        this.currentSlide = 0;
        this.slides = [];
        this.isActive = false;
        this.overlay = null;
        this.helpMode = false;
        this.multiPageTutorial = false;
        
        this.init();
    }
    
    init() {
        // Check if user has completed tutorial
        const completed = localStorage.getItem('tutorialCompleted');
        if (!completed) {
            // Show tutorial on first visit to main page only
            if (this.isMainPage()) {
                setTimeout(() => this.start(), 2000);
            }
        }
        
        // Set up help mode functionality
        this.setupHelpMode();
    }
    
    isMainPage() {
        return window.location.pathname === '/' || window.location.pathname === '/index.html';
    }
    
    // Show start tutorial button (called from main page help icon)
    showStartTutorialButton() {
        if (this.isMainPage()) {
            // Show modal with start tutorial option
            const modal = document.createElement('div');
            modal.className = 'tutorial-start-modal';
            modal.innerHTML = `
                <div class="modal-overlay" onclick="this.parentElement.remove()">
                    <div class="modal-content" onclick="event.stopPropagation()">
                        <h5>Tutorial & Help</h5>
                        <p>Choose an option:</p>
                        <div class="d-grid gap-2">
                            <button class="btn btn-primary" onclick="tutorial.startComprehensiveTutorial(); this.closest('.tutorial-start-modal').remove()">
                                <i class="bi bi-play-circle"></i> Start Complete Tutorial
                            </button>
                            <button class="btn btn-outline-primary" onclick="tutorial.toggleHelpMode(); this.closest('.tutorial-start-modal').remove()">
                                <i class="bi bi-question-circle"></i> Interactive Help Mode
                            </button>
                            <button class="btn btn-outline-secondary" onclick="this.closest('.tutorial-start-modal').remove()">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            // On other pages, just toggle help mode
            this.toggleHelpMode();
        }
    }
    
    // Start comprehensive multi-page tutorial
    startComprehensiveTutorial() {
        this.multiPageTutorial = true;
        this.slides = this.getComprehensiveTutorialSlides();
        this.currentSlide = 0;
        this.isActive = true;
        this.createOverlay();
        this.showSlide();
    }
    
    // Comprehensive tutorial covering all pages
    getComprehensiveTutorialSlides() {
        return [
            // Welcome slides
            {
                title: "Welcome to Android Diagnostic Dashboard!",
                content: "This comprehensive tutorial will guide you through all features of the Android Remote Diagnostic API. You'll learn to monitor, debug, and control your Android device remotely.",
                target: null,
                position: "center",
                page: "current"
            },
            
            // Main Dashboard
            {
                title: "Main Dashboard Overview",
                content: "This is your main dashboard showing real-time system metrics. The cards display CPU cores, RAM usage, battery level, and device uptime.",
                target: ".stat-card",
                position: "bottom",
                page: "current"
            },
            {
                title: "Navigation Tabs",
                content: "These tabs provide access to different system areas: System info, Device details, Processes, Packages, Storage, Terminal, and Logs.",
                target: ".nav-tabs",
                position: "bottom",
                page: "current"
            },
            {
                title: "Quick Actions Bar",
                content: "The top navigation provides access to specialized tools. Let's explore each one starting with Files.",
                target: ".d-flex.align-items-center a",
                position: "bottom",
                page: "current"
            },
            
            // Files Page
            {
                title: "File Explorer",
                content: "Now we're in the File Explorer. Here you can manage your Android device files remotely - upload, download, copy, move, and delete files.",
                target: ".main-container",
                position: "center",
                page: "/files.html",
                redirect: true
            },
            {
                title: "System Metrics Bar",
                content: "This metrics bar appears on all pages, showing network signal, uptime, battery, RAM usage, and storage. It updates every 30 seconds.",
                target: "#metricsBar",
                position: "bottom",
                page: "/files.html"
            },
            {
                title: "File Navigation",
                content: "Use breadcrumb navigation to move between folders. The toolbar provides upload, copy, move, and delete operations for selected files.",
                target: ".path-bar, .toolbar",
                position: "bottom",
                page: "/files.html"
            },
            
            // Apps Page  
            {
                title: "Application Manager",
                content: "The Apps page lets you manage installed applications. View app details, uninstall, force stop, or clear cache for selected apps.",
                target: ".main-container",
                position: "center",
                page: "/apps.html",
                redirect: true
            },
            {
                title: "App Filtering",
                content: "Filter applications by type (System/User), status (Running/All), and sort by name, size, install date, or last update time.",
                target: ".filters-panel",
                position: "bottom",
                page: "/apps.html"
            },
            {
                title: "App Statistics",
                content: "View running apps, total storage usage, and application summary. Select multiple apps for bulk operations.",
                target: ".summary-stats",
                position: "bottom",
                page: "/apps.html"
            },
            
            // Debug Tools Page
            {
                title: "Advanced Debug Tools",
                content: "Debug Tools provides advanced system diagnostics: logcat monitoring, system services, process management, and performance profiling.",
                target: ".main-container",
                position: "center", 
                page: "/debug-tools.html",
                redirect: true
            },
            {
                title: "Debug Categories",
                content: "Explore different debug categories using the accordion. Each section provides specialized tools for system analysis and troubleshooting.",
                target: ".accordion",
                position: "bottom",
                page: "/debug-tools.html"
            },
            
            // Remote Control Page
            {
                title: "Remote Control",
                content: "The Remote Control page allows you to see and interact with your Android device screen remotely - like having the device in your hands!",
                target: ".main-container",
                position: "center",
                page: "/remote.html", 
                redirect: true
            },
            {
                title: "Device Screen Mirror",
                content: "This canvas shows your device's live screen. Click anywhere to tap, drag to swipe. Screenshots and screen recording are also available.",
                target: ".screen-panel, #deviceScreen",
                position: "right",
                page: "/remote.html"
            },
            {
                title: "Control Panel",
                content: "Use hardware buttons (Home, Back, Recent), quick actions (Power, Volume), text input, and app launcher to control your device remotely.",
                target: ".control-panel",
                position: "left", 
                page: "/remote.html"
            },
            {
                title: "Special Permissions",
                content: "Some features require special Android permissions. The system will guide you through enabling these for full remote control functionality.",
                target: ".permissions-section",
                position: "left",
                page: "/remote.html"
            },
            
            // Tutorial Complete
            {
                title: "Tutorial Complete!",
                content: "Congratulations! You've learned about all major features of the Android Diagnostic Dashboard. Use the ? icon on any page for context-specific help.",
                target: null,
                position: "center",
                page: "current",
                isLast: true
            }
        ];
    }
    
    // Regular page-specific tutorial
    getTutorialSlides() {
        const currentPath = window.location.pathname;
        
        if (currentPath === '/' || currentPath === '/index.html') {
            return [
                {
                    title: "Welcome to Android Diagnostic Dashboard!",
                    content: "Monitor and control your Android device remotely. This dashboard shows real-time system metrics and provides access to all tools.",
                    target: null,
                    position: "center"
                },
                {
                    title: "System Metrics",
                    content: "These cards show CPU cores, RAM usage, battery level, and uptime. They update automatically every 30 seconds.",
                    target: ".stat-card",
                    position: "bottom"
                },
                {
                    title: "Navigation Tabs",
                    content: "Access different system areas: System info, Device details, Processes, Packages, Storage, Terminal, and Logs.",
                    target: ".nav-tabs",
                    position: "bottom"
                },
                {
                    title: "Quick Access Tools",
                    content: "Top navigation provides access to Files, Apps, Debug Tools, and Remote Control features.",
                    target: ".d-flex.align-items-center a",
                    position: "bottom"
                }
            ];
        } else if (currentPath.includes('files.html')) {
            return [
                {
                    title: "File Explorer",
                    content: "Manage Android device files remotely. Upload, download, copy, move, and delete files with ease.",
                    target: ".main-container",
                    position: "center"
                },
                {
                    title: "System Metrics",
                    content: "Monitor device status: network signal, uptime, battery, RAM usage, and storage space.",
                    target: "#metricsBar",
                    position: "bottom"
                }
            ];
        } else if (currentPath.includes('apps.html')) {
            return [
                {
                    title: "Application Manager", 
                    content: "Manage installed applications. View details, uninstall, force stop, or clear cache for selected apps.",
                    target: ".main-container",
                    position: "center"
                },
                {
                    title: "App Filtering",
                    content: "Filter by type, status, and sort by various criteria. Use checkboxes for bulk operations.",
                    target: ".filters-panel",
                    position: "bottom"
                }
            ];
        } else if (currentPath.includes('debug-tools.html')) {
            return [
                {
                    title: "Debug Tools",
                    content: "Advanced diagnostics: logcat monitoring, system services, process management, and performance profiling.",
                    target: ".main-container", 
                    position: "center"
                },
                {
                    title: "Debug Categories",
                    content: "Explore different debug sections using the accordion interface for specialized system analysis.",
                    target: ".accordion",
                    position: "bottom"
                }
            ];
        } else if (currentPath.includes('remote.html')) {
            return [
                {
                    title: "Remote Control",
                    content: "Control your Android device remotely! See the live screen and interact using mouse or touch.",
                    target: ".main-container",
                    position: "center"
                },
                {
                    title: "Device Screen",
                    content: "Live screen mirror. Click to tap, drag to swipe. Take screenshots or record the screen.",
                    target: ".screen-panel",
                    position: "right"
                },
                {
                    title: "Control Panel", 
                    content: "Hardware buttons, quick actions, text input, and app launcher for complete remote control.",
                    target: ".control-panel",
                    position: "left"
                }
            ];
        }
        
        return [
            {
                title: "Welcome!",
                content: "Welcome to the Android Diagnostic Dashboard. Use the navigation to explore different features.",
                target: null,
                position: "center"
            }
        ];
    }
    
    start() {
        this.slides = this.getTutorialSlides();
        this.currentSlide = 0;
        this.isActive = true;
        this.createOverlay();
        this.showSlide();
    }
    
    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'tutorial-overlay';
        document.body.appendChild(this.overlay);
    }
    
    showSlide() {
        const slide = this.slides[this.currentSlide];
        
        // Check if we need to navigate to a different page
        if (slide.redirect && slide.page !== "current") {
            this.navigateToPage(slide.page);
            return;
        }
        
        this.updateOverlayContent(slide);
        this.highlightTarget(slide.target);
        this.positionModal(slide.position, slide.target);
    }
    
    navigateToPage(page) {
        // Store tutorial state
        sessionStorage.setItem('tutorialActive', 'true');
        sessionStorage.setItem('tutorialSlide', this.currentSlide.toString());
        sessionStorage.setItem('tutorialType', this.multiPageTutorial ? 'comprehensive' : 'regular');
        
        // Navigate to page
        window.location.href = page;
    }
    
    // Resume tutorial after navigation
    resumeAfterNavigation() {
        const isActive = sessionStorage.getItem('tutorialActive');
        if (isActive === 'true') {
            const slideIndex = parseInt(sessionStorage.getItem('tutorialSlide') || '0');
            const tutorialType = sessionStorage.getItem('tutorialType');
            
            // Clean up session storage
            sessionStorage.removeItem('tutorialActive');
            sessionStorage.removeItem('tutorialSlide');
            sessionStorage.removeItem('tutorialType');
            
            // Resume tutorial
            if (tutorialType === 'comprehensive') {
                this.multiPageTutorial = true;
                this.slides = this.getComprehensiveTutorialSlides();
            } else {
                this.slides = this.getTutorialSlides();
            }
            
            this.currentSlide = slideIndex;
            this.isActive = true;
            
            setTimeout(() => {
                this.createOverlay();
                this.showSlide();
            }, 1000);
        }
    }
    
    updateOverlayContent(slide) {
        const isLast = slide.isLast || this.currentSlide === this.slides.length - 1;
        
        this.overlay.innerHTML = `
            <div class="tutorial-modal">
                <div class="tutorial-header">
                    <h4 class="tutorial-title">${slide.title}</h4>
                    <button class="tutorial-close" onclick="tutorial.skip()">×</button>
                </div>
                <div class="tutorial-content">
                    <div class="tutorial-text">${slide.content}</div>
                    ${isLast ? this.getFeedbackSection() : ''}
                </div>
                <div class="tutorial-footer">
                    <div class="tutorial-nav">
                        <button class="tutorial-btn secondary" onclick="tutorial.skip()">
                            ${isLast ? 'Finish' : 'Skip Tour'}
                        </button>
                        <button class="tutorial-btn secondary" onclick="tutorial.previous()" 
                                style="display: ${this.currentSlide > 0 ? 'block' : 'none'};">
                            <i class="bi bi-arrow-left"></i> Back
                        </button>
                    </div>
                    <div class="tutorial-progress">
                        <span>${this.currentSlide + 1} / ${this.slides.length}</span>
                    </div>
                    <div class="tutorial-nav">
                        <button class="tutorial-btn primary" onclick="tutorial.next()">
                            ${isLast ? 'Finish <i class="bi bi-check"></i>' : 'Next <i class="bi bi-arrow-right"></i>'}
                        </button>
                    </div>
                </div>
            </div>
            <div class="tutorial-highlight" id="tutorialHighlight"></div>
        `;
    }
    
    getFeedbackSection() {
        const now = new Date();
        const dateStr = now.toISOString().replace('T', ':').substring(0, 16);
        
        return `
            <div class="feedback-section mt-4 p-3 border rounded">
                <h6><i class="bi bi-chat-heart"></i> Share Your Feedback</h6>
                <p class="small text-muted mb-3">Help us improve the Android Diagnostic Dashboard!</p>
                
                <div class="d-grid gap-2">
                    <button class="btn btn-outline-primary btn-sm" onclick="tutorial.sendFeedback('${dateStr}')">
                        <i class="bi bi-envelope"></i> Send Feedback via Email
                    </button>
                    
                    <div class="mt-2 text-center">
                        <p class="small mb-2">Keep us free from ads:</p>
                        <a href="https://www.paypal.com/paypalme/jswilliamstu" target="_blank" 
                           class="btn btn-warning btn-sm">
                            <i class="bi bi-cup-hot"></i> Buy me a coffee ☕
                        </a>
                    </div>
                </div>
            </div>
        `;
    }
    
    sendFeedback(dateStr) {
        const subject = `App feedback: ${dateStr}`;
        const body = `Hi,

I just completed the tutorial for the Android Diagnostic Dashboard and wanted to share feedback:

[Please share your thoughts here]

Device Info:
- Browser: ${navigator.userAgent}
- Screen: ${window.screen.width}x${window.screen.height}
- Tutorial completed: ${new Date().toISOString()}

Thank you for creating this tool!`;
        
        const mailtoLink = `mailto:jeremyw@dobeu.net?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoLink);
    }
    
    highlightTarget(target) {
        const highlight = document.getElementById('tutorialHighlight');
        if (!highlight) return;
        
        if (!target) {
            highlight.style.display = 'none';
            return;
        }
        
        const element = document.querySelector(target);
        if (!element) {
            highlight.style.display = 'none';
            return;
        }
        
        const rect = element.getBoundingClientRect();
        highlight.style.display = 'block';
        highlight.style.top = (rect.top - 10) + 'px';
        highlight.style.left = (rect.left - 10) + 'px';
        highlight.style.width = (rect.width + 20) + 'px';
        highlight.style.height = (rect.height + 20) + 'px';
    }
    
    positionModal(position, target) {
        const modal = this.overlay.querySelector('.tutorial-modal');
        if (!modal) return;
        
        // Reset positioning
        modal.style.position = 'fixed';
        modal.style.top = '';
        modal.style.left = '';
        modal.style.right = '';
        modal.style.bottom = '';
        modal.style.transform = '';
        
        if (position === 'center' || !target) {
            modal.style.top = '50%';
            modal.style.left = '50%';
            modal.style.transform = 'translate(-50%, -50%)';
            return;
        }
        
        const element = document.querySelector(target);
        if (!element) {
            modal.style.top = '50%';
            modal.style.left = '50%';
            modal.style.transform = 'translate(-50%, -50%)';
            return;
        }
        
        const rect = element.getBoundingClientRect();
        const modalRect = modal.getBoundingClientRect();
        
        switch(position) {
            case 'bottom':
                modal.style.top = (rect.bottom + 20) + 'px';
                modal.style.left = (rect.left + rect.width/2 - modalRect.width/2) + 'px';
                break;
            case 'top':
                modal.style.top = (rect.top - modalRect.height - 20) + 'px';  
                modal.style.left = (rect.left + rect.width/2 - modalRect.width/2) + 'px';
                break;
            case 'left':
                modal.style.top = (rect.top + rect.height/2 - modalRect.height/2) + 'px';
                modal.style.left = (rect.left - modalRect.width - 20) + 'px';
                break;
            case 'right':
                modal.style.top = (rect.top + rect.height/2 - modalRect.height/2) + 'px';
                modal.style.left = (rect.right + 20) + 'px';
                break;
        }
    }
    
    next() {
        if (this.currentSlide < this.slides.length - 1) {
            this.currentSlide++;
            this.showSlide();
        } else {
            this.complete();
        }
    }
    
    previous() {
        if (this.currentSlide > 0) {
            this.currentSlide--;
            this.showSlide();
        }
    }
    
    skip() {
        this.complete();
    }
    
    complete() {
        this.isActive = false;
        this.multiPageTutorial = false;
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        
        // Mark tutorial as completed
        localStorage.setItem('tutorialCompleted', 'true');
        
        // Clear any session storage
        sessionStorage.removeItem('tutorialActive');
        sessionStorage.removeItem('tutorialSlide');
        sessionStorage.removeItem('tutorialType');
    }
    
    // Help mode functionality
    setupHelpMode() {
        // Add tooltip styles
        if (!document.getElementById('helpTooltipStyle')) {
            const style = document.createElement('style');
            style.id = 'helpTooltipStyle';
            style.textContent = `
                .help-tooltip {
                    position: fixed;
                    background: rgba(0, 0, 0, 0.9);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    max-width: 300px;
                    z-index: 10000;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .help-tooltip.show {
                    opacity: 1;
                }
                .help-mode-active {
                    cursor: help !important;
                }
                .help-mode-active * {
                    cursor: help !important;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    toggleHelpMode() {
        this.helpMode = !this.helpMode;
        
        if (this.helpMode) {
            document.body.classList.add('help-mode-active');
            this.showHelpModeNotification();
            this.attachHelpListeners();
        } else {
            document.body.classList.remove('help-mode-active');
            this.removeHelpListeners();
            this.hideTooltip();
        }
    }
    
    showHelpModeNotification() {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            z-index: 10001;
            font-size: 14px;
        `;
        notification.innerHTML = `
            <i class="bi bi-info-circle"></i> Help Mode Active
            <br><small>Hover over elements for help. Click ? again to exit.</small>
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 4000);
    }
    
    attachHelpListeners() {
        this.helpMouseEnter = (e) => this.showTooltip(e);
        this.helpMouseLeave = () => this.hideTooltip();
        this.helpMouseMove = (e) => this.updateTooltipPosition(e);
        
        document.addEventListener('mouseenter', this.helpMouseEnter, true);
        document.addEventListener('mouseleave', this.helpMouseLeave, true);
        document.addEventListener('mousemove', this.helpMouseMove);
    }
    
    removeHelpListeners() {
        if (this.helpMouseEnter) {
            document.removeEventListener('mouseenter', this.helpMouseEnter, true);
            document.removeEventListener('mouseleave', this.helpMouseLeave, true);
            document.removeEventListener('mousemove', this.helpMouseMove);
        }
    }
    
    showTooltip(e) {
        if (!this.helpMode) return;
        
        const element = e.target;
        const help = this.getElementHelp(element);
        
        if (help) {
            let tooltip = document.getElementById('helpTooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'helpTooltip';
                tooltip.className = 'help-tooltip';
                document.body.appendChild(tooltip);
            }
            
            tooltip.textContent = help;
            tooltip.classList.add('show');
            this.updateTooltipPosition(e);
        }
    }
    
    hideTooltip() {
        const tooltip = document.getElementById('helpTooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
        }
    }
    
    updateTooltipPosition(e) {
        const tooltip = document.getElementById('helpTooltip');
        if (tooltip && tooltip.classList.contains('show')) {
            tooltip.style.left = (e.clientX + 10) + 'px';
            tooltip.style.top = (e.clientY - 30) + 'px';
        }
    }
    
    getElementHelp(element) {
        const helpTexts = {
            // Navigation
            '.navbar-brand': 'Main application title and home link',
            'a[href="/"]': 'Return to main dashboard',
            'a[href="/files.html"]': 'File manager for device files',
            'a[href="/apps.html"]': 'Application manager and installer',
            'a[href="/debug-tools.html"]': 'Advanced debugging and diagnostic tools',
            'a[href="/remote.html"]': 'Remote control your device screen',
            
            // Metrics
            '#metricsBar': 'Real-time system metrics updated every 30 seconds',
            '#networkSignal': 'Mobile network signal strength',
            '#wifiSignal': 'WiFi connection status',
            '#uptimeMetric': 'System uptime since last reboot',
            '#batteryMetric': 'Battery level percentage',
            '#ramMetric': 'Memory usage percentage',
            '#storageMetric': 'Storage usage percentage',
            
            // Dashboard
            '.stat-card': 'System metric card showing real-time data',
            '.nav-tabs .nav-link': 'Switch between different system views',
            '#rootStatus': 'Device root access status',
            '#connectionStatus': 'API connection status',
            
            // Files
            '.path-bar': 'Current folder path - click any part to navigate',
            '.toolbar': 'File operation tools - upload, copy, move, delete',
            '.file-item': 'File or folder - click to select, double-click to open',
            '.breadcrumb-item': 'Path segment - click to navigate to this folder',
            
            // Apps
            '.filters-panel': 'Filter and sort applications',
            '.app-item': 'Application entry - click to select for operations',
            '.summary-stats': 'Application statistics overview',
            '.toggle-btn': 'Filter toggle - click to switch between options',
            
            // Debug Tools
            '.accordion-item': 'Debug tool category - click to expand',
            '.accordion-button': 'Click to expand debug section',
            '.debug-action': 'Execute debug command or view logs',
            
            // Remote Control
            '#deviceScreen': 'Live device screen - click to tap, drag to swipe',
            '.control-panel': 'Remote control buttons and actions',
            '.hardware-buttons': 'Device hardware button simulation',
            '.quick-actions': 'Quick device control actions',
            
            // Common buttons
            '.btn-primary': 'Primary action button',
            '.btn-outline-primary': 'Secondary action button', 
            '.btn-danger': 'Destructive action - use with caution',
            '.btn-success': 'Confirmation or positive action',
            '.btn-warning': 'Caution required for this action',
            '.form-control': 'Input field - enter data here',
            '.modal': 'Dialog window with additional options',
            
            // Icons
            '.bi-house': 'Home/Dashboard',
            '.bi-folder': 'Files and folders',
            '.bi-grid-3x3-gap': 'Applications',
            '.bi-bug': 'Debug tools',
            '.bi-phone-vibrate': 'Remote control',
            '.bi-question-circle': 'Help and tutorial',
            '.bi-gear': 'Settings',
            '.bi-download': 'Download',
            '.bi-upload': 'Upload',
            '.bi-trash': 'Delete',
            '.bi-copy': 'Copy',
            '.bi-arrow-clockwise': 'Refresh'
        };
        
        // Check element and parent selectors
        for (const [selector, text] of Object.entries(helpTexts)) {
            if (element.matches && element.matches(selector)) {
                return text;
            }
            if (element.closest && element.closest(selector)) {
                return text;
            }
        }
        
        // Check by class names
        const classList = Array.from(element.classList || []);
        for (const className of classList) {
            if (className.startsWith('bi-')) {
                return `Icon: ${className.replace('bi-', '').replace('-', ' ')}`;
            }
        }
        
        // Check by element type
        switch (element.tagName?.toLowerCase()) {
            case 'button':
                return element.title || 'Click to perform action';
            case 'input':
                return element.placeholder || 'Input field';
            case 'select':
                return 'Dropdown selection';
            case 'a':
                return element.title || 'Navigation link';
            default:
                return null;
        }
    }
}

// Initialize tutorial system
const tutorial = new Tutorial();

// Check for tutorial resume after navigation
if (sessionStorage.getItem('tutorialActive') === 'true') {
    tutorial.resumeAfterNavigation();
}

// Export for global access
window.tutorial = tutorial;