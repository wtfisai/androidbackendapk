const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { authenticateApiKey } = require('../middleware/auth');
const { Activity } = require('../models/Activity');
const execAsync = promisify(exec);

// Helper function to check if ADB is available
async function checkAdbAvailable() {
  try {
    await execAsync('which adb');
    return true;
  } catch {
    return false;
  }
}

// GET /api/android/logcat
router.get('/logcat', authenticateApiKey, async (req, res) => {
  try {
    const {
      filter = '',
      level = 'V',
      format = 'threadtime',
      lines = 500,
      package: packageFilter,
      tag,
      clear = false
    } = req.query;

    // Clear logcat if requested
    if (clear === 'true') {
      await execAsync('logcat -c');
      return res.json({ success: true, message: 'Logcat cleared' });
    }

    // Build logcat command
    let command = `logcat -d -v ${format}`;

    // Add log level filter
    if (level !== 'V') {
      command += ` *:${level}`;
    }

    // Add tag filter
    if (tag) {
      command += ` ${tag}:*`;
    }

    // Add package filter if specified
    if (packageFilter) {
      const { stdout: pid } = await execAsync(`pidof ${packageFilter}`).catch(() => ({
        stdout: ''
      }));
      if (pid) {
        command += ` --pid=${pid.trim()}`;
      }
    }

    // Add general filter
    if (filter) {
      command += ` | grep "${filter}"`;
    }

    // Limit lines
    command += ` | tail -n ${lines}`;

    const { stdout } = await execAsync(command);

    // Parse logcat output
    const logs = stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        // Parse threadtime format: MM-DD HH:MM:SS.mmm PID TID LEVEL TAG: MESSAGE
        const match = line.match(
          /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s*(.*)$/
        );
        if (match) {
          return {
            timestamp: match[1],
            pid: parseInt(match[2]),
            tid: parseInt(match[3]),
            level: match[4],
            tag: match[5].trim(),
            message: match[6],
            raw: line
          };
        }
        return { raw: line };
      });

    // Log activity
    await Activity.log({
      type: 'android_debug',
      action: 'logcat_view',
      metadata: { filter, level, lines: logs.length }
    });

    res.json({
      logs,
      count: logs.length,
      filters: { level, format, packageFilter, tag, filter }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get logcat',
      message: error.message
    });
  }
});

// POST /api/android/bugreport
router.post('/bugreport', authenticateApiKey, async (req, res) => {
  try {
    const { includeScreenshot = false, minimal = false } = req.body;
    const timestamp = Date.now();
    const reportPath = `/tmp/bugreport_${timestamp}`;

    // Generate bugreport
    let command = 'bugreport';
    if (minimal) {
      command += ' --minimal';
    }
    command += ` ${reportPath}`;

    // Start bugreport generation (this can take a while)
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 * 50 });

    // Take screenshot if requested
    let screenshotPath = null;
    if (includeScreenshot) {
      screenshotPath = `/tmp/screenshot_${timestamp}.png`;
      await execAsync(`screencap -p ${screenshotPath}`);
    }

    // Get report file info
    const reportFiles = await fs.readdir('/tmp');
    const bugreportFile = reportFiles.find((f) => f.startsWith(`bugreport_${timestamp}`));

    if (!bugreportFile) {
      throw new Error('Bugreport file not found');
    }

    const stats = await fs.stat(path.join('/tmp', bugreportFile));

    await Activity.log({
      type: 'android_debug',
      action: 'bugreport_generated',
      metadata: {
        reportPath: `/tmp/${bugreportFile}`,
        size: stats.size,
        includeScreenshot
      }
    });

    res.json({
      success: true,
      reportPath: `/tmp/${bugreportFile}`,
      screenshotPath,
      size: stats.size,
      timestamp: new Date(timestamp),
      message: 'Bugreport generated successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate bugreport',
      message: error.message
    });
  }
});

// GET /api/android/dumpsys/:service
router.get('/dumpsys/:service', authenticateApiKey, async (req, res) => {
  try {
    const { service } = req.params;
    const { args = '' } = req.query;

    // Whitelist of safe dumpsys services
    const safeServices = [
      'activity',
      'meminfo',
      'cpuinfo',
      'battery',
      'batterystats',
      'package',
      'wifi',
      'connectivity',
      'telephony',
      'location',
      'power',
      'alarm',
      'jobscheduler',
      'deviceidle',
      'usagestats',
      'procstats',
      'diskstats',
      'netstats',
      'notification',
      'appops',
      'gfxinfo',
      'display',
      'input',
      'window',
      'audio',
      'media.audio_policy',
      'platform_compat',
      'thermalservice',
      'vibrator',
      'sensor'
    ];

    if (!safeServices.includes(service)) {
      return res.status(400).json({
        error: 'Invalid service',
        message: `Service must be one of: ${safeServices.join(', ')}`
      });
    }

    // Build dumpsys command
    let command = `dumpsys ${service}`;
    if (args) {
      command += ` ${args}`;
    }

    const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 });

    // Parse output based on service type
    let parsedData = { raw: stdout };

    switch (service) {
      case 'battery':
        parsedData = parseBatteryDump(stdout);
        break;
      case 'meminfo':
        parsedData = parseMeminfoDump(stdout);
        break;
      case 'cpuinfo':
        parsedData = parseCpuinfoDump(stdout);
        break;
      case 'activity':
        parsedData = parseActivityDump(stdout);
        break;
      case 'package':
        parsedData = parsePackageDump(stdout);
        break;
      default:
        parsedData = { raw: stdout };
    }

    await Activity.log({
      type: 'android_debug',
      action: 'dumpsys',
      metadata: { service, args }
    });

    res.json({
      service,
      timestamp: new Date(),
      data: parsedData
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to run dumpsys',
      message: error.message
    });
  }
});

// POST /api/android/screenrecord
router.post('/screenrecord', authenticateApiKey, async (req, res) => {
  try {
    const {
      duration = 180, // max 3 minutes
      bitrate = 4000000, // 4Mbps
      size = '1280x720',
      rotate = false
    } = req.body;

    const timestamp = Date.now();
    const outputPath = `/sdcard/screenrecord_${timestamp}.mp4`;

    // Build screenrecord command
    let command = 'screenrecord';
    command += ` --time-limit ${Math.min(duration, 180)}`;
    command += ` --bit-rate ${bitrate}`;
    if (size) {
      command += ` --size ${size}`;
    }
    if (rotate) {
      command += ' --rotate';
    }
    command += ` ${outputPath}`;

    // Start recording in background
    exec(command, (error) => {
      if (error) {
        console.error('Screen recording error:', error);
      }
    });

    await Activity.log({
      type: 'android_debug',
      action: 'screenrecord_start',
      metadata: { outputPath, duration, bitrate, size }
    });

    res.json({
      success: true,
      message: 'Screen recording started',
      outputPath,
      duration,
      maxDuration: 180,
      bitrate,
      size,
      willFinishAt: new Date(Date.now() + duration * 1000)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start screen recording',
      message: error.message
    });
  }
});

// POST /api/android/screenshot
router.post('/screenshot', authenticateApiKey, async (req, res) => {
  try {
    const { display = 0 } = req.body;
    const timestamp = Date.now();
    const outputPath = `/sdcard/screenshot_${timestamp}.png`;

    // Take screenshot
    await execAsync(`screencap -p -d ${display} ${outputPath}`);

    // Get file info
    const { stdout } = await execAsync(`ls -la ${outputPath}`);
    const match = stdout.match(/\s+(\d+)\s+/);
    const size = match ? parseInt(match[1]) : 0;

    await Activity.log({
      type: 'android_debug',
      action: 'screenshot',
      metadata: { outputPath, size }
    });

    res.json({
      success: true,
      outputPath,
      size,
      timestamp: new Date(timestamp)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to take screenshot',
      message: error.message
    });
  }
});

// GET /api/android/batterystats
router.get('/batterystats', authenticateApiKey, async (req, res) => {
  try {
    const { reset = false, enable = false, checkin = false } = req.query;

    let command = 'dumpsys batterystats';

    if (reset === 'true') {
      await execAsync('dumpsys batterystats --reset');
      return res.json({ success: true, message: 'Battery stats reset' });
    }

    if (enable === 'true') {
      await execAsync('dumpsys batterystats --enable full-wake-history');
      return res.json({ success: true, message: 'Full wake history enabled' });
    }

    if (checkin === 'true') {
      command += ' --checkin';
    }

    const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 * 20 });

    // Parse battery stats
    const stats = {
      batteryLevel: 0,
      batteryHealth: '',
      screenOnTime: 0,
      wakelocks: [],
      topApps: [],
      chargingHistory: []
    };

    // Extract battery level
    const levelMatch = stdout.match(/Battery Level: (\d+)/);
    if (levelMatch) {
      stats.batteryLevel = parseInt(levelMatch[1]);
    }

    // Extract screen on time
    const screenMatch = stdout.match(/Screen on: ([\dhms]+)/);
    if (screenMatch) {
      stats.screenOnTime = screenMatch[1];
    }

    // Extract top battery consuming apps
    const appSection = stdout.match(/Top app[\s\S]*?(?=\n\n)/);
    if (appSection) {
      const appLines = appSection[0].split('\n').slice(1, 6);
      stats.topApps = appLines
        .map((line) => {
          const match = line.match(/\s*(.+?):\s*([\d.]+)/);
          return match ? { app: match[1].trim(), usage: parseFloat(match[2]) } : null;
        })
        .filter(Boolean);
    }

    // Extract wakelocks
    const wakelockSection = stdout.match(/Wake lock[\s\S]*?(?=\n\n)/);
    if (wakelockSection) {
      const wakelockLines = wakelockSection[0].split('\n').slice(1, 6);
      stats.wakelocks = wakelockLines
        .map((line) => {
          const match = line.match(/\s*(.+?):\s*([\dhms]+)/);
          return match ? { name: match[1].trim(), duration: match[2] } : null;
        })
        .filter(Boolean);
    }

    await Activity.log({
      type: 'android_debug',
      action: 'batterystats',
      metadata: { checkin }
    });

    res.json({
      stats,
      raw: checkin === 'true' ? stdout : undefined,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get battery stats',
      message: error.message
    });
  }
});

// GET /api/android/layout-inspector
router.get('/layout-inspector', authenticateApiKey, async (req, res) => {
  try {
    const { packageName } = req.query;

    if (!packageName) {
      return res.status(400).json({ error: 'Package name is required' });
    }

    // Dump UI hierarchy
    const { stdout } = await execAsync(
      'uiautomator dump /sdcard/ui_dump.xml && cat /sdcard/ui_dump.xml'
    );

    // Parse XML to extract view hierarchy
    const views = [];
    const viewMatches = stdout.matchAll(/<node[^>]+>/g);

    for (const match of viewMatches) {
      const nodeStr = match[0];
      const bounds = nodeStr.match(/bounds="(\[[\d,]+\])(\[[\d,]+\])"/);
      const className = nodeStr.match(/class="([^"]+)"/);
      const resourceId = nodeStr.match(/resource-id="([^"]+)"/);
      const text = nodeStr.match(/text="([^"]+)"/);
      const contentDesc = nodeStr.match(/content-desc="([^"]+)"/);
      const clickable = nodeStr.includes('clickable="true"');
      const enabled = nodeStr.includes('enabled="true"');

      views.push({
        class: className ? className[1] : '',
        resourceId: resourceId ? resourceId[1] : '',
        text: text ? text[1] : '',
        contentDescription: contentDesc ? contentDesc[1] : '',
        bounds: bounds ? `${bounds[1]}${bounds[2]}` : '',
        clickable,
        enabled
      });
    }

    await Activity.log({
      type: 'android_debug',
      action: 'layout_inspector',
      metadata: { packageName, viewCount: views.length }
    });

    res.json({
      packageName,
      viewCount: views.length,
      views: views.slice(0, 100), // Limit to first 100 views
      xmlPath: '/sdcard/ui_dump.xml',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to inspect layout',
      message: error.message
    });
  }
});

// POST /api/android/settings
router.post('/settings', authenticateApiKey, async (req, res) => {
  try {
    const { namespace, key, value } = req.body;

    // Validate namespace
    const validNamespaces = ['system', 'secure', 'global'];
    if (!validNamespaces.includes(namespace)) {
      return res.status(400).json({
        error: 'Invalid namespace',
        message: `Namespace must be one of: ${validNamespaces.join(', ')}`
      });
    }

    if (!key) {
      return res.status(400).json({ error: 'Key is required' });
    }

    let result;

    if (value !== undefined) {
      // Set setting
      await execAsync(`settings put ${namespace} ${key} ${value}`);
      result = { action: 'set', namespace, key, value };
    } else {
      // Get setting
      const { stdout } = await execAsync(`settings get ${namespace} ${key}`);
      result = {
        action: 'get',
        namespace,
        key,
        value: stdout.trim() === 'null' ? null : stdout.trim()
      };
    }

    await Activity.log({
      type: 'android_debug',
      action: 'settings_change',
      metadata: result
    });

    res.json({
      success: true,
      ...result,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to access settings',
      message: error.message
    });
  }
});

// POST /api/android/intent
router.post('/intent', authenticateApiKey, async (req, res) => {
  try {
    const {
      action,
      component,
      data,
      category,
      extras = {},
      flags = [],
      user = 'current'
    } = req.body;

    if (!action && !component) {
      return res.status(400).json({
        error: 'Either action or component is required'
      });
    }

    // Build am command
    let command = 'am';

    // Determine command type
    if (action && action.startsWith('android.intent.action.')) {
      command += ' broadcast';
    } else if (component) {
      command += ' start';
    } else {
      command += ' start';
    }

    // Add user
    command += ` --user ${user}`;

    // Add action
    if (action) {
      command += ` -a ${action}`;
    }

    // Add component
    if (component) {
      command += ` -n ${component}`;
    }

    // Add data URI
    if (data) {
      command += ` -d "${data}"`;
    }

    // Add category
    if (category) {
      command += ` -c ${category}`;
    }

    // Add extras
    for (const [key, value] of Object.entries(extras)) {
      if (typeof value === 'string') {
        command += ` --es ${key} "${value}"`;
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          command += ` --ei ${key} ${value}`;
        } else {
          command += ` --ef ${key} ${value}`;
        }
      } else if (typeof value === 'boolean') {
        command += ` --ez ${key} ${value}`;
      }
    }

    // Add flags
    for (const flag of flags) {
      command += ` -f ${flag}`;
    }

    const { stdout, stderr } = await execAsync(command);

    await Activity.log({
      type: 'android_debug',
      action: 'send_intent',
      metadata: { action, component, data, extras }
    });

    res.json({
      success: true,
      command,
      output: stdout || stderr,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to send intent',
      message: error.message
    });
  }
});

// GET /api/android/devices
router.get('/devices', authenticateApiKey, async (req, res) => {
  try {
    const adbAvailable = await checkAdbAvailable();

    if (!adbAvailable) {
      return res.json({
        devices: [
          {
            id: 'local',
            status: 'device',
            product: 'termux',
            model: 'Android',
            device: 'local',
            transportId: '0'
          }
        ],
        adbAvailable: false,
        message: 'ADB not available, showing local device only'
      });
    }

    const { stdout } = await execAsync('adb devices -l');
    const lines = stdout.split('\n').slice(1); // Skip header

    const devices = lines
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split(/\s+/);
        const id = parts[0];
        const status = parts[1];

        // Parse additional device info
        const device = {};
        device.id = id;
        device.status = status;

        // Extract properties from the rest of the line
        const props = line.substring(line.indexOf(status) + status.length).trim();
        const propMatches = props.matchAll(/(\w+):([^\s]+)/g);

        for (const match of propMatches) {
          device[match[1]] = match[2];
        }

        return device;
      });

    res.json({
      devices,
      count: devices.length,
      adbAvailable: true,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list devices',
      message: error.message
    });
  }
});

// Helper functions for parsing dumpsys output
function parseBatteryDump(output) {
  const battery = {};

  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*(.+?):\s*(.+)$/);
    if (match) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      const value = match[2].trim();
      battery[key] = isNaN(value) ? value : parseFloat(value);
    }
  }

  return battery;
}

function parseMeminfoDump(output) {
  const meminfo = {
    summary: {},
    processes: [],
    totalPss: 0,
    totalRam: ''
  };

  // Extract total RAM
  const totalMatch = output.match(/Total RAM:\s*([^\n]+)/);
  if (totalMatch) {
    meminfo.totalRam = totalMatch[1].trim();
  }

  // Extract process memory usage
  const processSection = output.match(/\*\* MEMINFO[\s\S]*?(?=\n\n)/);
  if (processSection) {
    const lines = processSection[0].split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*(\d+)\s+kB:\s+(.+?)\s+\(pid\s+(\d+)/);
      if (match) {
        meminfo.processes.push({
          pss: parseInt(match[1]),
          name: match[2].trim(),
          pid: parseInt(match[3])
        });
        meminfo.totalPss += parseInt(match[1]);
      }
    }
  }

  // Sort processes by memory usage
  meminfo.processes.sort((a, b) => b.pss - a.pss);

  return meminfo;
}

function parseCpuinfoDump(output) {
  const cpuinfo = {
    loadAverage: [],
    cpuUsage: [],
    topProcesses: []
  };

  // Extract load average
  const loadMatch = output.match(/Load:\s*([\d.]+)\s*\/\s*([\d.]+)\s*\/\s*([\d.]+)/);
  if (loadMatch) {
    cpuinfo.loadAverage = [
      parseFloat(loadMatch[1]),
      parseFloat(loadMatch[2]),
      parseFloat(loadMatch[3])
    ];
  }

  // Extract CPU usage per process
  const lines = output.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([\d.]+)%\s+(\d+)\/(.+?):\s+(.+)$/);
    if (match) {
      cpuinfo.topProcesses.push({
        cpu: parseFloat(match[1]),
        pid: parseInt(match[2]),
        name: match[3].trim(),
        label: match[4].trim()
      });
    }
  }

  // Sort by CPU usage
  cpuinfo.topProcesses.sort((a, b) => b.cpu - a.cpu);

  return cpuinfo;
}

function parseActivityDump(output) {
  const activity = {
    focusedActivity: '',
    resumedActivity: '',
    recentTasks: [],
    runningServices: []
  };

  // Extract focused activity
  const focusMatch = output.match(/mFocusedActivity:\s*(.+)/);
  if (focusMatch) {
    activity.focusedActivity = focusMatch[1].trim();
  }

  // Extract resumed activity
  const resumedMatch = output.match(/mResumedActivity:\s*(.+)/);
  if (resumedMatch) {
    activity.resumedActivity = resumedMatch[1].trim();
  }

  // Extract recent tasks
  const tasksSection = output.match(/Recent tasks:[\s\S]*?(?=\n\n)/);
  if (tasksSection) {
    const taskLines = tasksSection[0].split('\n').slice(1, 6);
    activity.recentTasks = taskLines
      .map((line) => {
        const match = line.match(/\*\s+(.+)/);
        return match ? match[1].trim() : null;
      })
      .filter(Boolean);
  }

  return activity;
}

function parsePackageDump(output) {
  const packages = {
    installedPackages: [],
    permissions: [],
    features: []
  };

  // Extract package list
  const packageSection = output.match(/Packages:[\s\S]*?(?=\n\n)/);
  if (packageSection) {
    const packageLines = packageSection[0].split('\n');
    for (const line of packageLines) {
      const match = line.match(/Package\s+\[([^\]]+)\]/);
      if (match) {
        packages.installedPackages.push(match[1]);
      }
    }
  }

  // Extract features
  const featureSection = output.match(/Features:[\s\S]*?(?=\n\n)/);
  if (featureSection) {
    const featureLines = featureSection[0].split('\n');
    for (const line of featureLines) {
      const match = line.match(/Feature:\s+(.+)/);
      if (match) {
        packages.features.push(match[1].trim());
      }
    }
  }

  return packages;
}

module.exports = router;
