// Remote Control JavaScript
const API_KEY = localStorage.getItem('apiKey') || 'diagnostic-api-key-2024';
const API_BASE = '/api/remote';

let screenCanvas = null;
let screenContext = null;
let screenInfo = null;
let isRecording = false;
let recordingSessionId = null;
let refreshInterval = null;
let fpsCounter = 0;
let lastFpsUpdate = Date.now();
let settings = {
    quality: 'medium',
    refreshRate: 10,
    showTouches: true
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    screenCanvas = document.getElementById('deviceScreen');
    screenContext = screenCanvas.getContext('2d');
    
    // Initialize screen
    await getScreenInfo();
    await loadApps();
    startScreenRefresh();
    
    // Set up canvas event listeners
    setupCanvasEvents();
    
    // Update current app periodically
    setInterval(updateCurrentApp, 5000);
    
    // Load settings
    loadSettings();
});

// Get screen information
async function getScreenInfo() {
    try {
        const response = await fetch(`${API_BASE}/screen-info`, {
            headers: { 'x-api-key': API_KEY }
        });
        screenInfo = await response.json();
        
        // Update canvas size
        screenCanvas.width = screenInfo.width;
        screenCanvas.height = screenInfo.height;
        
        // Update info display
        document.getElementById('screenResolution').textContent = `${screenInfo.width}x${screenInfo.height}`;
        document.getElementById('screenOrientation').textContent = screenInfo.orientation;
        document.getElementById('screenDensity').textContent = `${screenInfo.density} dpi`;
        
        // Adjust canvas display size
        adjustCanvasSize();
    } catch (error) {
        console.error('Error getting screen info:', error);
    }
}

// Adjust canvas display size to fit container
function adjustCanvasSize() {
    const wrapper = document.getElementById('screenWrapper');
    const maxWidth = wrapper.clientWidth - 40;
    const maxHeight = wrapper.clientHeight - 40;
    
    const screenRatio = screenInfo.width / screenInfo.height;
    const containerRatio = maxWidth / maxHeight;
    
    let displayWidth, displayHeight;
    
    if (screenRatio > containerRatio) {
        displayWidth = maxWidth;
        displayHeight = maxWidth / screenRatio;
    } else {
        displayHeight = maxHeight;
        displayWidth = maxHeight * screenRatio;
    }
    
    screenCanvas.style.width = `${displayWidth}px`;
    screenCanvas.style.height = `${displayHeight}px`;
}

// Start screen refresh
function startScreenRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    const refreshRate = settings.refreshRate * 1000 / settings.refreshRate; // Convert to ms
    refreshInterval = setInterval(refreshScreen, 1000 / settings.refreshRate);
    
    // Initial refresh
    refreshScreen();
}

// Refresh screen
async function refreshScreen() {
    try {
        const startTime = Date.now();
        
        const response = await fetch(`${API_BASE}/screenshot`, {
            headers: { 'x-api-key': API_KEY }
        });
        const data = await response.json();
        
        if (data.success && data.image) {
            // Create image from base64
            const img = new Image();
            img.onload = () => {
                screenContext.clearRect(0, 0, screenCanvas.width, screenCanvas.height);
                screenContext.drawImage(img, 0, 0, screenCanvas.width, screenCanvas.height);
                
                // Hide loading
                document.getElementById('screenLoading').style.display = 'none';
                
                // Update FPS counter
                updateFPS();
            };
            img.src = `data:image/png;base64,${data.image}`;
        }
    } catch (error) {
        console.error('Error refreshing screen:', error);
        document.getElementById('statusText').textContent = 'Disconnected';
        document.getElementById('connectionStatus').classList.remove('connected');
    }
}

// Update FPS counter
function updateFPS() {
    fpsCounter++;
    const now = Date.now();
    
    if (now - lastFpsUpdate >= 1000) {
        document.getElementById('fpsCounter').textContent = fpsCounter;
        fpsCounter = 0;
        lastFpsUpdate = now;
    }
}

// Setup canvas events
function setupCanvasEvents() {
    screenCanvas.addEventListener('click', handleCanvasClick);
    screenCanvas.addEventListener('mousedown', handleMouseDown);
    screenCanvas.addEventListener('mouseup', handleMouseUp);
    screenCanvas.addEventListener('mousemove', handleMouseMove);
    
    // Touch events for mobile
    screenCanvas.addEventListener('touchstart', handleTouchStart);
    screenCanvas.addEventListener('touchend', handleTouchEnd);
    screenCanvas.addEventListener('touchmove', handleTouchMove);
}

// Handle canvas click
async function handleCanvasClick(event) {
    const coords = getDeviceCoordinates(event);
    await sendTouch(coords.x, coords.y, 'tap');
    
    // Show touch feedback
    if (settings.showTouches) {
        showTouchFeedback(event.offsetX, event.offsetY);
    }
}

// Get device coordinates from canvas event
function getDeviceCoordinates(event) {
    const rect = screenCanvas.getBoundingClientRect();
    const scaleX = screenCanvas.width / rect.width;
    const scaleY = screenCanvas.height / rect.height;
    
    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);
    
    // Update display
    document.getElementById('touchPosition').textContent = `${x}, ${y}`;
    
    return { x, y };
}

// Show touch feedback
function showTouchFeedback(x, y) {
    const feedback = document.createElement('div');
    feedback.className = 'touch-feedback';
    feedback.style.left = `${x - 20}px`;
    feedback.style.top = `${y - 20}px`;
    
    document.getElementById('screenWrapper').appendChild(feedback);
    
    setTimeout(() => {
        feedback.remove();
    }, 500);
}

// Send touch event
async function sendTouch(x, y, action = 'tap', endX = null, endY = null, duration = 0) {
    try {
        const body = { x, y, action, duration };
        if (endX !== null && endY !== null) {
            body.endX = endX;
            body.endY = endY;
        }
        
        const response = await fetch(`${API_BASE}/touch`, {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        const result = await response.json();
        console.log('Touch sent:', result);
    } catch (error) {
        console.error('Error sending touch:', error);
    }
}

// Handle mouse events for drag
let isDragging = false;
let dragStart = null;

function handleMouseDown(event) {
    isDragging = true;
    dragStart = getDeviceCoordinates(event);
}

function handleMouseUp(event) {
    if (isDragging && dragStart) {
        const dragEnd = getDeviceCoordinates(event);
        const distance = Math.sqrt(
            Math.pow(dragEnd.x - dragStart.x, 2) + 
            Math.pow(dragEnd.y - dragStart.y, 2)
        );
        
        if (distance > 10) {
            // It's a swipe
            sendTouch(dragStart.x, dragStart.y, 'swipe', dragEnd.x, dragEnd.y, 300);
        }
    }
    isDragging = false;
    dragStart = null;
}

function handleMouseMove(event) {
    if (isDragging) {
        event.preventDefault();
    }
}

// Handle touch events
function handleTouchStart(event) {
    event.preventDefault();
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    screenCanvas.dispatchEvent(mouseEvent);
}

function handleTouchEnd(event) {
    event.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    screenCanvas.dispatchEvent(mouseEvent);
}

function handleTouchMove(event) {
    event.preventDefault();
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    screenCanvas.dispatchEvent(mouseEvent);
}

// Send key event
async function sendKey(keycode, longpress = false) {
    try {
        const response = await fetch(`${API_BASE}/key`, {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ keycode, longpress })
        });
        
        const result = await response.json();
        console.log('Key sent:', result);
        
        // Refresh screen after key press
        setTimeout(refreshScreen, 100);
    } catch (error) {
        console.error('Error sending key:', error);
    }
}

// Send text
async function sendText() {
    const input = document.getElementById('textInput');
    const text = input.value;
    
    if (!text) return;
    
    try {
        const response = await fetch(`${API_BASE}/type`, {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text })
        });
        
        const result = await response.json();
        console.log('Text sent:', result);
        
        // Clear input
        input.value = '';
        
        // Refresh screen
        setTimeout(refreshScreen, 100);
    } catch (error) {
        console.error('Error sending text:', error);
    }
}

// Take screenshot
async function takeScreenshot() {
    try {
        const response = await fetch(`${API_BASE}/screenshot`, {
            headers: { 'x-api-key': API_KEY }
        });
        const data = await response.json();
        
        if (data.success && data.image) {
            // Create download link
            const link = document.createElement('a');
            link.download = `screenshot_${Date.now()}.png`;
            link.href = `data:image/png;base64,${data.image}`;
            link.click();
            
            showAlert('Screenshot saved!', 'success');
        }
    } catch (error) {
        console.error('Error taking screenshot:', error);
        showAlert('Failed to take screenshot', 'danger');
    }
}

// Toggle recording
async function toggleRecording() {
    if (isRecording) {
        await stopRecording();
    } else {
        await startRecording();
    }
}

// Start recording
async function startRecording() {
    try {
        const response = await fetch(`${API_BASE}/screen-record/start`, {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                quality: settings.quality,
                timeLimit: 180 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            isRecording = true;
            recordingSessionId = data.sessionId;
            
            // Update UI
            document.getElementById('recordBtn').innerHTML = '<i class="bi bi-stop-circle"></i> Stop';
            document.getElementById('recordBtn').classList.add('btn-danger');
            document.getElementById('recordBtn').classList.remove('btn-light');
            document.getElementById('recordingIndicator').classList.add('active');
            
            showAlert('Recording started', 'success');
        }
    } catch (error) {
        console.error('Error starting recording:', error);
        showAlert('Failed to start recording', 'danger');
    }
}

// Stop recording
async function stopRecording() {
    try {
        const response = await fetch(`${API_BASE}/screen-record/stop`, {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId: recordingSessionId })
        });
        
        const data = await response.json();
        
        if (data.success && data.video) {
            isRecording = false;
            recordingSessionId = null;
            
            // Update UI
            document.getElementById('recordBtn').innerHTML = '<i class="bi bi-record-circle"></i> Record';
            document.getElementById('recordBtn').classList.remove('btn-danger');
            document.getElementById('recordBtn').classList.add('btn-light');
            document.getElementById('recordingIndicator').classList.remove('active');
            
            // Download video
            const link = document.createElement('a');
            link.download = `recording_${Date.now()}.mp4`;
            link.href = `data:video/mp4;base64,${data.video}`;
            link.click();
            
            showAlert('Recording saved!', 'success');
        }
    } catch (error) {
        console.error('Error stopping recording:', error);
        showAlert('Failed to stop recording', 'danger');
    }
}

// Rotate screen
async function rotateScreen() {
    try {
        const currentOrientation = document.getElementById('screenOrientation').textContent;
        const newOrientation = currentOrientation === 'portrait' ? 'landscape' : 'portrait';
        
        const response = await fetch(`${API_BASE}/rotate`, {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ orientation: newOrientation })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Refresh screen info
            setTimeout(() => {
                getScreenInfo();
                refreshScreen();
            }, 500);
        }
    } catch (error) {
        console.error('Error rotating screen:', error);
    }
}

// Toggle notifications panel
async function toggleNotifications() {
    // Swipe down from top to show notifications
    await sendTouch(
        Math.floor(screenInfo.width / 2), 
        0, 
        'swipe', 
        Math.floor(screenInfo.width / 2), 
        Math.floor(screenInfo.height / 2), 
        300
    );
}

// Update current app
async function updateCurrentApp() {
    try {
        const response = await fetch(`${API_BASE}/current-activity`, {
            headers: { 'x-api-key': API_KEY }
        });
        const data = await response.json();
        
        document.getElementById('currentApp').textContent = 
            data.packageName !== 'unknown' ? data.packageName : 'Home Screen';
    } catch (error) {
        console.error('Error updating current app:', error);
    }
}

// Load apps
async function loadApps() {
    try {
        const response = await fetch('/api/packages', {
            headers: { 'x-api-key': API_KEY }
        });
        const data = await response.json();
        
        if (data.packages) {
            const select = document.getElementById('appSelector');
            select.innerHTML = '<option value="">Select an app...</option>';
            
            data.packages.forEach(pkg => {
                const option = document.createElement('option');
                option.value = pkg;
                option.textContent = pkg.split('.').pop(); // Show last part of package name
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading apps:', error);
    }
}

// Launch selected app
async function launchSelectedApp() {
    const select = document.getElementById('appSelector');
    const packageName = select.value;
    
    if (!packageName) {
        showAlert('Please select an app', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/launch-app`, {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ packageName })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(`Launched ${packageName}`, 'success');
            
            // Refresh screen after launch
            setTimeout(refreshScreen, 1000);
        } else {
            showAlert(`Failed to launch app: ${result.error}`, 'danger');
        }
    } catch (error) {
        console.error('Error launching app:', error);
        showAlert('Failed to launch app', 'danger');
    }
}

// Toggle fullscreen
function toggleFullscreen() {
    const wrapper = document.getElementById('screenWrapper');
    
    if (!document.fullscreenElement) {
        wrapper.requestFullscreen().catch(err => {
            console.error('Error entering fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// Toggle settings modal
function toggleSettings() {
    const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
    modal.show();
}

// Load settings
function loadSettings() {
    const saved = localStorage.getItem('remoteSettings');
    if (saved) {
        settings = JSON.parse(saved);
        
        // Apply settings to UI
        document.getElementById('screenQuality').value = settings.quality;
        document.getElementById('refreshRate').value = settings.refreshRate;
        document.getElementById('refreshRateValue').textContent = settings.refreshRate;
        document.getElementById('showTouches').checked = settings.showTouches;
    }
    
    // Set up refresh rate slider
    document.getElementById('refreshRate').addEventListener('input', (e) => {
        document.getElementById('refreshRateValue').textContent = e.target.value;
    });
}

// Save settings
async function saveSettings() {
    settings.quality = document.getElementById('screenQuality').value;
    settings.refreshRate = parseInt(document.getElementById('refreshRate').value);
    settings.showTouches = document.getElementById('showTouches').checked;
    
    // Save to localStorage
    localStorage.setItem('remoteSettings', JSON.stringify(settings));
    
    // Apply brightness
    const brightness = document.getElementById('screenBrightness').value;
    try {
        await fetch(`${API_BASE}/brightness`, {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ level: parseInt(brightness) })
        });
    } catch (error) {
        console.error('Error setting brightness:', error);
    }
    
    // Restart screen refresh with new settings
    startScreenRefresh();
    
    // Close modal
    bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
    
    showAlert('Settings saved', 'success');
}

// Show alert
function showAlert(message, type = 'info') {
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    const container = document.createElement('div');
    container.innerHTML = alertHtml;
    container.style.position = 'fixed';
    container.style.top = '80px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    
    document.body.appendChild(container);
    
    setTimeout(() => {
        container.remove();
    }, 3000);
}

// Handle window resize
window.addEventListener('resize', () => {
    if (screenInfo) {
        adjustCanvasSize();
    }
});