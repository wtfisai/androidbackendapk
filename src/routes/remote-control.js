const express = require('express');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { authenticateApiKey } = require('../middleware/auth');
const { Activity } = require('../models/Activity');

const router = express.Router();
const execAsync = promisify(exec);

// Store active screen recording processes
const activeStreams = new Map();

// Get device screen information
router.get('/screen-info', authenticateApiKey, async (req, res) => {
  try {
    // Get screen resolution
    const { stdout: size } = await execAsync('wm size');
    const sizeMatch = size.match(/Physical size: (\d+)x(\d+)/);
    
    // Get screen density
    const { stdout: density } = await execAsync('wm density');
    const densityMatch = density.match(/Physical density: (\d+)/);
    
    // Get display info
    const { stdout: displayInfo } = await execAsync('dumpsys display | grep "mDisplayWidth\\|mDisplayHeight\\|orientation"');
    
    const screenInfo = {
      width: sizeMatch ? parseInt(sizeMatch[1]) : 1080,
      height: sizeMatch ? parseInt(sizeMatch[2]) : 1920,
      density: densityMatch ? parseInt(densityMatch[1]) : 420,
      orientation: displayInfo.includes('orientation=1') || displayInfo.includes('orientation=3') ? 'landscape' : 'portrait',
      timestamp: new Date()
    };
    
    await Activity.log({
      type: 'remote_control',
      action: 'get_screen_info',
      metadata: screenInfo
    });
    
    res.json(screenInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Capture screenshot
router.get('/screenshot', authenticateApiKey, async (req, res) => {
  try {
    const timestamp = Date.now();
    const filename = `screenshot_${timestamp}.png`;
    const filepath = `/sdcard/${filename}`;
    
    // Take screenshot
    await execAsync(`screencap -p ${filepath}`);
    
    // Read the file
    const { stdout } = await execAsync(`base64 ${filepath}`);
    
    // Clean up
    await execAsync(`rm -f ${filepath}`);
    
    await Activity.log({
      type: 'remote_control',
      action: 'screenshot',
      metadata: { filename, timestamp }
    });
    
    res.json({
      success: true,
      image: stdout.trim(),
      timestamp: new Date(),
      format: 'base64'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simulate touch input
router.post('/touch', authenticateApiKey, async (req, res) => {
  try {
    const { x, y, action = 'tap', duration = 0 } = req.body;
    
    if (!x || !y) {
      return res.status(400).json({ error: 'X and Y coordinates required' });
    }
    
    let command;
    switch (action) {
      case 'tap':
        command = `input tap ${x} ${y}`;
        break;
      case 'swipe':
        const { endX, endY } = req.body;
        if (!endX || !endY) {
          return res.status(400).json({ error: 'End coordinates required for swipe' });
        }
        command = `input swipe ${x} ${y} ${endX} ${endY} ${duration || 300}`;
        break;
      case 'longpress':
        command = `input swipe ${x} ${y} ${x} ${y} ${duration || 1000}`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid action type' });
    }
    
    await execAsync(command);
    
    await Activity.log({
      type: 'remote_control',
      action: 'touch_input',
      metadata: { x, y, action, duration }
    });
    
    res.json({
      success: true,
      action,
      coordinates: { x, y },
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simulate key events
router.post('/key', authenticateApiKey, async (req, res) => {
  try {
    const { keycode, longpress = false } = req.body;
    
    if (!keycode) {
      return res.status(400).json({ error: 'Keycode required' });
    }
    
    // Map common key names to Android keycodes
    const keycodeMap = {
      'home': 'KEYCODE_HOME',
      'back': 'KEYCODE_BACK',
      'recent': 'KEYCODE_APP_SWITCH',
      'power': 'KEYCODE_POWER',
      'volume_up': 'KEYCODE_VOLUME_UP',
      'volume_down': 'KEYCODE_VOLUME_DOWN',
      'menu': 'KEYCODE_MENU',
      'enter': 'KEYCODE_ENTER',
      'delete': 'KEYCODE_DEL',
      'space': 'KEYCODE_SPACE'
    };
    
    const androidKeycode = keycodeMap[keycode.toLowerCase()] || keycode;
    const command = longpress 
      ? `input keyevent --longpress ${androidKeycode}`
      : `input keyevent ${androidKeycode}`;
    
    await execAsync(command);
    
    await Activity.log({
      type: 'remote_control',
      action: 'key_event',
      metadata: { keycode: androidKeycode, longpress }
    });
    
    res.json({
      success: true,
      keycode: androidKeycode,
      longpress,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Type text
router.post('/type', authenticateApiKey, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text required' });
    }
    
    // Escape special characters for shell
    const escapedText = text.replace(/'/g, "'\\''");
    await execAsync(`input text '${escapedText}'`);
    
    await Activity.log({
      type: 'remote_control',
      action: 'type_text',
      metadata: { textLength: text.length }
    });
    
    res.json({
      success: true,
      textLength: text.length,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start screen recording
router.post('/screen-record/start', authenticateApiKey, async (req, res) => {
  try {
    const { quality = 'medium', timeLimit = 180 } = req.body;
    const sessionId = `recording_${Date.now()}`;
    const filename = `${sessionId}.mp4`;
    const filepath = `/sdcard/${filename}`;
    
    // Quality presets
    const qualitySettings = {
      low: '--size 480x854 --bit-rate 1M',
      medium: '--size 720x1280 --bit-rate 2M',
      high: '--size 1080x1920 --bit-rate 4M'
    };
    
    const settings = qualitySettings[quality] || qualitySettings.medium;
    const command = `screenrecord ${settings} --time-limit ${timeLimit} ${filepath}`;
    
    // Start recording in background
    const recordProcess = spawn('sh', ['-c', command]);
    
    activeStreams.set(sessionId, {
      process: recordProcess,
      filepath,
      filename,
      startTime: Date.now(),
      quality,
      timeLimit
    });
    
    recordProcess.on('exit', () => {
      activeStreams.delete(sessionId);
    });
    
    await Activity.log({
      type: 'remote_control',
      action: 'screen_record_start',
      metadata: { sessionId, quality, timeLimit }
    });
    
    res.json({
      success: true,
      sessionId,
      filename,
      quality,
      timeLimit,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop screen recording
router.post('/screen-record/stop', authenticateApiKey, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    
    const recording = activeStreams.get(sessionId);
    if (!recording) {
      return res.status(404).json({ error: 'Recording session not found' });
    }
    
    // Stop the recording
    recording.process.kill('SIGINT');
    activeStreams.delete(sessionId);
    
    // Wait a moment for file to be written
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Read and encode the video file
    const { stdout } = await execAsync(`base64 ${recording.filepath}`);
    
    // Clean up
    await execAsync(`rm -f ${recording.filepath}`);
    
    await Activity.log({
      type: 'remote_control',
      action: 'screen_record_stop',
      metadata: { 
        sessionId, 
        duration: Date.now() - recording.startTime 
      }
    });
    
    res.json({
      success: true,
      sessionId,
      video: stdout.trim(),
      duration: Date.now() - recording.startTime,
      format: 'base64',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current activity
router.get('/current-activity', authenticateApiKey, async (req, res) => {
  try {
    // Use dumpsys window instead which doesn't require DUMP permission
    const { stdout } = await execAsync('dumpsys window windows | grep -E "mCurrentFocus|mFocusedApp" | head -1');
    const match = stdout.match(/([a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.]+)/);
    
    const activityInfo = {
      packageName: match ? match[1] : 'unknown',
      activityName: match ? match[2] : 'unknown',
      fullName: match ? match[0] : 'unknown',
      timestamp: new Date()
    };
    
    await Activity.log({
      type: 'remote_control',
      action: 'get_current_activity',
      metadata: activityInfo
    });
    
    res.json(activityInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Launch app
router.post('/launch-app', authenticateApiKey, async (req, res) => {
  try {
    const { packageName } = req.body;
    
    if (!packageName) {
      return res.status(400).json({ error: 'Package name required' });
    }
    
    // Get launch intent for the app
    const { stdout: launchIntent } = await execAsync(
      `cmd package resolve-activity --brief ${packageName} | tail -n 1`
    );
    
    if (!launchIntent || launchIntent.includes('No activity found')) {
      return res.status(404).json({ error: 'App not found or no launchable activity' });
    }
    
    // Launch the app
    await execAsync(`am start -n ${launchIntent.trim()}`);
    
    await Activity.log({
      type: 'remote_control',
      action: 'launch_app',
      metadata: { packageName, launchIntent: launchIntent.trim() }
    });
    
    res.json({
      success: true,
      packageName,
      launchIntent: launchIntent.trim(),
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Control screen brightness
router.post('/brightness', authenticateApiKey, async (req, res) => {
  try {
    const { level } = req.body;
    
    if (level === undefined || level < 0 || level > 255) {
      return res.status(400).json({ error: 'Brightness level must be between 0 and 255' });
    }
    
    await execAsync(`settings put system screen_brightness ${level}`);
    
    await Activity.log({
      type: 'remote_control',
      action: 'set_brightness',
      metadata: { level }
    });
    
    res.json({
      success: true,
      brightness: level,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rotate screen
router.post('/rotate', authenticateApiKey, async (req, res) => {
  try {
    const { orientation } = req.body;
    
    // 0: portrait, 1: landscape, 2: reverse portrait, 3: reverse landscape
    const orientationMap = {
      'portrait': 0,
      'landscape': 1,
      'reverse-portrait': 2,
      'reverse-landscape': 3,
      'auto': 'auto'
    };
    
    const rotation = orientationMap[orientation] !== undefined 
      ? orientationMap[orientation] 
      : orientation;
    
    if (rotation === 'auto') {
      await execAsync('settings put system accelerometer_rotation 1');
    } else {
      await execAsync('settings put system accelerometer_rotation 0');
      await execAsync(`settings put system user_rotation ${rotation}`);
    }
    
    await Activity.log({
      type: 'remote_control',
      action: 'rotate_screen',
      metadata: { orientation, rotation }
    });
    
    res.json({
      success: true,
      orientation,
      rotation,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;