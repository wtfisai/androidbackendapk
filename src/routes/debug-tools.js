const router = require('express').Router();
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { authenticateApiKey } = require('../middleware/auth');
const { Activity } = require('../models/Activity');
const { DebugSession } = require('../models/DebugSession');
const execAsync = promisify(exec);

// Store active processes for real-time monitoring
const activeProcesses = new Map();

// Helper to execute and log commands
async function executeAndLog(command, sessionId) {
  const startTime = Date.now();
  try {
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
    const result = {
      command,
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exitCode: 0,
      duration: Date.now() - startTime,
      timestamp: new Date()
    };

    // Log to session
    if (sessionId) {
      await DebugSession.addLog(sessionId, result);
    }

    return result;
  } catch (error) {
    const result = {
      command,
      stdout: error.stdout ? error.stdout.toString() : '',
      stderr: error.stderr ? error.stderr.toString() : error.message,
      exitCode: error.code || 1,
      duration: Date.now() - startTime,
      timestamp: new Date(),
      error: error.message
    };

    if (sessionId) {
      await DebugSession.addLog(sessionId, result);
    }

    return result;
  }
}

// Stream output for long-running commands
function streamCommand(command, sessionId) {
  const process = spawn('sh', ['-c', command]);
  const processId = `${Date.now()}_${Math.random()}`;

  const output = {
    stdout: [],
    stderr: [],
    status: 'running',
    pid: process.pid,
    startTime: Date.now()
  };

  activeProcesses.set(processId, { process, output, sessionId });

  process.stdout.on('data', (data) => {
    output.stdout.push(data.toString());
    if (sessionId) {
      DebugSession.addStreamLog(sessionId, { type: 'stdout', data: data.toString() });
    }
  });

  process.stderr.on('data', (data) => {
    output.stderr.push(data.toString());
    if (sessionId) {
      DebugSession.addStreamLog(sessionId, { type: 'stderr', data: data.toString() });
    }
  });

  process.on('close', (code) => {
    output.status = 'completed';
    output.exitCode = code;
    output.duration = Date.now() - output.startTime;
  });

  return processId;
}

// 1. Logcat with advanced filtering
router.post('/logcat/start', authenticateApiKey, async (req, res) => {
  try {
    const {
      filter = '',
      level = 'V',
      format = 'threadtime',
      buffer = 'main',
      packageFilter,
      tag,
      regex,
      sessionId
    } = req.body;

    let command = `logcat -v ${format} -b ${buffer}`;

    if (level !== 'V') {
      command += ` *:${level}`;
    }

    if (tag) {
      command += ` ${tag}:*`;
    }

    if (packageFilter) {
      const { stdout: pid } = await execAsync(`pidof ${packageFilter}`).catch(() => ({
        stdout: ''
      }));
      if (pid) {
        command += ` --pid=${pid.trim()}`;
      }
    }

    if (regex) {
      command += ` | grep -E "${regex}"`;
    } else if (filter) {
      command += ` | grep "${filter}"`;
    }

    const processId = streamCommand(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'logcat_start',
      metadata: { processId, filter, level, buffer }
    });

    res.json({
      success: true,
      processId,
      command,
      message: 'Logcat streaming started'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Network Inspector
router.get('/network/inspect', authenticateApiKey, async (req, res) => {
  try {
    const { sessionId } = req.query;

    // Get network statistics
    const netstat = await executeAndLog(
      'netstat -tunlp 2>/dev/null | grep -v "^Active\\|^Proto"',
      sessionId
    );
    const iptables = await executeAndLog(
      'iptables -L -v -n 2>/dev/null || echo "iptables not available"',
      sessionId
    );
    const tcpdump = await executeAndLog(
      'timeout 5 tcpdump -i any -c 10 -nn 2>/dev/null || echo "tcpdump not available"',
      sessionId
    );

    const connections = netstat.stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split(/\s+/);
        return {
          protocol: parts[0],
          local: parts[3],
          remote: parts[4],
          state: parts[5],
          program: parts[6] || 'unknown'
        };
      });

    await Activity.log({
      type: 'debug_tools',
      action: 'network_inspect',
      metadata: { connections: connections.length }
    });

    res.json({
      connections,
      iptables: iptables.stdout,
      tcpdump: tcpdump.stdout,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Database Inspector
router.get('/database/list', authenticateApiKey, async (req, res) => {
  try {
    const { packageName, sessionId } = req.query;
    const basePath = packageName ? `/data/data/${packageName}` : '/data/data/com.termux/files/home';

    const command = `find ${basePath} -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3" 2>/dev/null | head -20`;
    const result = await executeAndLog(command, sessionId);

    const databases = result.stdout
      .split('\n')
      .filter((db) => db.trim())
      .map((dbPath) => ({
        path: dbPath,
        name: path.basename(dbPath),
        size: 0 // Will be populated if accessible
      }));

    // Try to get sizes
    for (const db of databases) {
      try {
        const statResult = await executeAndLog(`stat -c %s "${db.path}" 2>/dev/null`, sessionId);
        db.size = parseInt(statResult.stdout) || 0;
      } catch {}
    }

    await Activity.log({
      type: 'debug_tools',
      action: 'database_list',
      metadata: { count: databases.length, packageName }
    });

    res.json({ databases });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Layout Inspector (UI hierarchy)
router.get('/layout/hierarchy', authenticateApiKey, async (req, res) => {
  try {
    const { sessionId } = req.query;

    const result = await executeAndLog('dumpsys activity top | head -100', sessionId);
    const windowResult = await executeAndLog(
      'dumpsys window windows | grep -E "Window #|mCurrentFocus" | head -20',
      sessionId
    );

    await Activity.log({
      type: 'debug_tools',
      action: 'layout_hierarchy',
      metadata: {}
    });

    res.json({
      activityInfo: result.stdout,
      windowInfo: windowResult.stdout,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. CPU Profiler
router.post('/profiler/cpu/start', authenticateApiKey, async (req, res) => {
  try {
    const { duration = 10, sessionId } = req.body;

    const command = `top -b -n ${duration} -d 1 | head -50`;
    const processId = streamCommand(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'cpu_profiler_start',
      metadata: { duration, processId }
    });

    res.json({
      success: true,
      processId,
      message: `CPU profiling started for ${duration} seconds`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Memory Profiler
router.get('/profiler/memory', authenticateApiKey, async (req, res) => {
  try {
    const { packageName, sessionId } = req.query;

    let command = 'dumpsys meminfo';
    if (packageName) {
      command += ` ${packageName}`;
    } else {
      command += ' | head -100';
    }

    const result = await executeAndLog(command, sessionId);
    const procMeminfo = await executeAndLog('cat /proc/meminfo | head -20', sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'memory_profiler',
      metadata: { packageName }
    });

    res.json({
      meminfo: result.stdout,
      systemMemory: procMeminfo.stdout,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Power Profiler
router.get('/profiler/power', authenticateApiKey, async (req, res) => {
  try {
    const { sessionId } = req.query;

    const batteryStats = await executeAndLog('dumpsys battery', sessionId);
    const powerProfile = await executeAndLog('dumpsys power | head -100', sessionId);
    const wakelocks = await executeAndLog('dumpsys power | grep -A5 "Wake Locks"', sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'power_profiler',
      metadata: {}
    });

    res.json({
      battery: batteryStats.stdout,
      powerProfile: powerProfile.stdout,
      wakelocks: wakelocks.stdout,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. System Trace
router.post('/trace/start', authenticateApiKey, async (req, res) => {
  try {
    const { duration = 10, categories = 'sched freq idle', sessionId } = req.body;
    const tracePath = `/data/local/tmp/trace_${Date.now()}.txt`;

    const command = `timeout ${duration} strace -o ${tracePath} -f -tt -T -s 100 -p 1 2>&1 || echo "Trace completed"`;
    const processId = streamCommand(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'system_trace_start',
      metadata: { duration, categories, tracePath, processId }
    });

    res.json({
      success: true,
      processId,
      tracePath,
      message: `System trace started for ${duration} seconds`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. ADB Device Management
router.get('/adb/devices', authenticateApiKey, async (req, res) => {
  try {
    const { sessionId } = req.query;

    const devices = await executeAndLog(
      'adb devices -l 2>/dev/null || echo "ADB not available"',
      sessionId
    );
    const version = await executeAndLog(
      'adb version 2>/dev/null || echo "ADB not available"',
      sessionId
    );

    const deviceList = devices.stdout
      .split('\n')
      .filter((line) => line.includes('device') && !line.startsWith('List'))
      .map((line) => {
        const parts = line.split(/\s+/);
        return {
          id: parts[0],
          status: parts[1],
          properties: parts.slice(2).join(' ')
        };
      });

    await Activity.log({
      type: 'debug_tools',
      action: 'adb_devices',
      metadata: { count: deviceList.length }
    });

    res.json({
      devices: deviceList,
      version: version.stdout,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Package Manager
router.post('/pm/grant', authenticateApiKey, async (req, res) => {
  try {
    const { packageName, permission, sessionId } = req.body;

    if (!packageName || !permission) {
      return res.status(400).json({ error: 'Package name and permission required' });
    }

    const command = `pm grant ${packageName} ${permission}`;
    const result = await executeAndLog(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'permission_grant',
      metadata: { packageName, permission }
    });

    res.json({
      success: result.exitCode === 0,
      output: result.stdout || result.stderr,
      command
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Settings Manager
router.post('/settings/modify', authenticateApiKey, async (req, res) => {
  try {
    const { namespace = 'system', key, value, sessionId } = req.body;

    if (!key) {
      return res.status(400).json({ error: 'Settings key required' });
    }

    let command;
    if (value !== undefined) {
      command = `settings put ${namespace} ${key} ${value}`;
    } else {
      command = `settings get ${namespace} ${key}`;
    }

    const result = await executeAndLog(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'settings_modify',
      metadata: { namespace, key, value }
    });

    res.json({
      success: result.exitCode === 0,
      output: result.stdout.trim(),
      command
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 12. Screen Recording
router.post('/screen/record', authenticateApiKey, async (req, res) => {
  try {
    const { duration = 30, bitrate = 4000000, sessionId } = req.body;
    const filename = `screenrecord_${Date.now()}.mp4`;
    const filepath = `/data/local/tmp/${filename}`;

    const command = `timeout ${duration} screenrecord --bit-rate ${bitrate} ${filepath}`;
    const processId = streamCommand(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'screen_record',
      metadata: { duration, bitrate, filepath, processId }
    });

    res.json({
      success: true,
      processId,
      filepath,
      filename,
      message: `Recording for ${duration} seconds`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 13. Bug Report Generator
router.post('/bugreport/generate', authenticateApiKey, async (req, res) => {
  try {
    const { type = 'full', sessionId } = req.body;
    const filename = `bugreport_${Date.now()}.txt`;
    const filepath = `/data/local/tmp/${filename}`;

    let command;
    if (type === 'full') {
      command = `bugreport > ${filepath} 2>&1`;
    } else {
      command = `dumpsys > ${filepath} 2>&1`;
    }

    const processId = streamCommand(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'bugreport_generate',
      metadata: { type, filepath, processId }
    });

    res.json({
      success: true,
      processId,
      filepath,
      filename,
      message: 'Bug report generation started'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 14. Dumpsys Service Inspector
router.get('/dumpsys/:service', authenticateApiKey, async (req, res) => {
  try {
    const { service } = req.params;
    const { args = '', sessionId } = req.query;

    const command = `dumpsys ${service} ${args} | head -500`;
    const result = await executeAndLog(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'dumpsys_inspect',
      metadata: { service, args }
    });

    res.json({
      service,
      output: result.stdout,
      exitCode: result.exitCode,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 15. Battery Stats
router.get('/battery/stats', authenticateApiKey, async (req, res) => {
  try {
    const { reset = false, sessionId } = req.query;

    if (reset === 'true') {
      await executeAndLog('dumpsys batterystats --reset', sessionId);
      return res.json({ success: true, message: 'Battery stats reset' });
    }

    const stats = await executeAndLog('dumpsys batterystats --checkin', sessionId);
    const current = await executeAndLog('dumpsys battery', sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'battery_stats',
      metadata: { reset }
    });

    res.json({
      stats: stats.stdout,
      current: current.stdout,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 16. Port Forwarding
router.post('/adb/forward', authenticateApiKey, async (req, res) => {
  try {
    const { localPort, remotePort, remove = false, sessionId } = req.body;

    if (!localPort || !remotePort) {
      return res.status(400).json({ error: 'Local and remote ports required' });
    }

    let command;
    if (remove) {
      command = `adb forward --remove tcp:${localPort}`;
    } else {
      command = `adb forward tcp:${localPort} tcp:${remotePort}`;
    }

    const result = await executeAndLog(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'port_forward',
      metadata: { localPort, remotePort, remove }
    });

    res.json({
      success: result.exitCode === 0,
      command,
      output: result.stdout || result.stderr
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 17. UI Automator
router.post('/uiautomator/dump', authenticateApiKey, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const filepath = `/data/local/tmp/ui_dump_${Date.now()}.xml`;

    const command = `uiautomator dump ${filepath} 2>&1`;
    const result = await executeAndLog(command, sessionId);

    let uiHierarchy = '';
    if (result.exitCode === 0) {
      const readResult = await executeAndLog(`cat ${filepath} | head -1000`, sessionId);
      uiHierarchy = readResult.stdout;
    }

    await Activity.log({
      type: 'debug_tools',
      action: 'uiautomator_dump',
      metadata: { filepath }
    });

    res.json({
      success: result.exitCode === 0,
      filepath,
      uiHierarchy,
      output: result.stdout
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 18. Monkey Testing
router.post('/monkey/start', authenticateApiKey, async (req, res) => {
  try {
    const {
      packageName,
      eventCount = 500,
      throttle = 100,
      seed,
      categories = [],
      sessionId
    } = req.body;

    if (!packageName) {
      return res.status(400).json({ error: 'Package name required' });
    }

    let command = `monkey -p ${packageName} --throttle ${throttle}`;

    if (seed) {
      command += ` -s ${seed}`;
    }

    categories.forEach((cat) => {
      command += ` -c ${cat}`;
    });

    command += ` ${eventCount}`;

    const processId = streamCommand(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'monkey_test',
      metadata: { packageName, eventCount, throttle, processId }
    });

    res.json({
      success: true,
      processId,
      command,
      message: `Monkey testing started with ${eventCount} events`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 19. Instrumentation Test Runner
router.post('/instrument/run', authenticateApiKey, async (req, res) => {
  try {
    const {
      testPackage,
      testClass,
      testMethod,
      runner = 'androidx.test.runner.AndroidJUnitRunner',
      sessionId
    } = req.body;

    if (!testPackage) {
      return res.status(400).json({ error: 'Test package required' });
    }

    let command = 'am instrument -w';

    if (testClass) {
      command += ` -e class ${testClass}`;
      if (testMethod) {
        command += `#${testMethod}`;
      }
    }

    command += ` ${testPackage}/${runner}`;

    const processId = streamCommand(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'instrument_test',
      metadata: { testPackage, testClass, testMethod, processId }
    });

    res.json({
      success: true,
      processId,
      command,
      message: 'Instrumentation test started'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 20. Get Active Process Output
router.get('/process/:processId', authenticateApiKey, async (req, res) => {
  try {
    const { processId } = req.params;
    const processInfo = activeProcesses.get(processId);

    if (!processInfo) {
      return res.status(404).json({ error: 'Process not found' });
    }

    res.json({
      processId,
      status: processInfo.output.status,
      stdout: processInfo.output.stdout.join(''),
      stderr: processInfo.output.stderr.join(''),
      pid: processInfo.output.pid,
      duration: processInfo.output.duration || Date.now() - processInfo.output.startTime,
      exitCode: processInfo.output.exitCode
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 21. Stop Active Process
router.post('/process/:processId/stop', authenticateApiKey, async (req, res) => {
  try {
    const { processId } = req.params;
    const processInfo = activeProcesses.get(processId);

    if (!processInfo) {
      return res.status(404).json({ error: 'Process not found' });
    }

    processInfo.process.kill('SIGTERM');
    processInfo.output.status = 'terminated';

    await Activity.log({
      type: 'debug_tools',
      action: 'process_stop',
      metadata: { processId }
    });

    res.json({
      success: true,
      processId,
      message: 'Process terminated'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 22. List Available Debug Services
router.get('/services/list', authenticateApiKey, async (req, res) => {
  try {
    const { sessionId } = req.query;

    const result = await executeAndLog('dumpsys -l', sessionId);
    const services = result.stdout
      .split('\n')
      .filter((s) => s.trim())
      .sort();

    await Activity.log({
      type: 'debug_tools',
      action: 'list_services',
      metadata: { count: services.length }
    });

    res.json({
      services,
      count: services.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 23. Perfetto Trace
router.post('/perfetto/trace', authenticateApiKey, async (req, res) => {
  try {
    const { duration = 10, bufferSize = 10, categories = ['sched', 'freq'], sessionId } = req.body;

    const configFile = `/data/local/tmp/perfetto_config_${Date.now()}.txt`;
    const traceFile = `/data/local/tmp/perfetto_trace_${Date.now()}.pftrace`;

    const config = `
buffers {
  size_kb: ${bufferSize * 1024}
}
data_sources {
  config {
    name: "linux.ftrace"
    ftrace_config {
      ftrace_events: "${categories.join('/*')}"
    }
  }
}
duration_ms: ${duration * 1000}
`;

    await fs.writeFile(configFile, config);

    const command = `perfetto -c ${configFile} -o ${traceFile}`;
    const processId = streamCommand(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'perfetto_trace',
      metadata: { duration, categories, traceFile, processId }
    });

    res.json({
      success: true,
      processId,
      traceFile,
      configFile,
      message: `Perfetto trace started for ${duration} seconds`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 24. App Install
router.post('/adb/install', authenticateApiKey, async (req, res) => {
  try {
    const { apkPath, options = [], sessionId } = req.body;

    if (!apkPath) {
      return res.status(400).json({ error: 'APK path required' });
    }

    let command = 'adb install';
    options.forEach((opt) => {
      command += ` ${opt}`;
    });
    command += ` ${apkPath}`;

    const processId = streamCommand(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'app_install',
      metadata: { apkPath, options, processId }
    });

    res.json({
      success: true,
      processId,
      command,
      message: 'App installation started'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 25. Developer Options Toggle
router.post('/developer/option', authenticateApiKey, async (req, res) => {
  try {
    const { option, value, sessionId } = req.body;

    const optionsMap = {
      show_touches: 'settings put system show_touches',
      pointer_location: 'settings put system pointer_location',
      show_surface_updates: 'settings put system show_surface_updates',
      show_layout_bounds: 'setprop debug.layout',
      force_rtl: 'settings put global force_rtl_layout_all_locales',
      animator_duration: 'settings put global animator_duration_scale',
      transition_animation: 'settings put global transition_animation_scale',
      window_animation: 'settings put global window_animation_scale'
    };

    if (!optionsMap[option]) {
      return res.status(400).json({ error: 'Unknown developer option' });
    }

    const command = `${optionsMap[option]} ${value}`;
    const result = await executeAndLog(command, sessionId);

    await Activity.log({
      type: 'debug_tools',
      action: 'developer_option',
      metadata: { option, value }
    });

    res.json({
      success: result.exitCode === 0,
      option,
      value,
      command,
      output: result.stdout || result.stderr
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 26. Export All Debug Data
router.post('/export/all', authenticateApiKey, async (req, res) => {
  try {
    const {
      includeLogcat = true,
      includeSystemInfo = true,
      includeNetworkData = true,
      includeMemoryInfo = true,
      includeProcessInfo = true,
      includeBatteryStats = true,
      includePackages = true,
      includeDumpsys = [],
      sessionId,
      format = 'txt'
    } = req.body;

    const timestamp = new Date().toISOString();
    const exportData = {
      timestamp,
      device: {},
      sections: []
    };

    // Helper to add section
    const addSection = (title, data) => {
      exportData.sections.push({
        title,
        timestamp: new Date().toISOString(),
        data
      });
    };

    // Device Info
    const deviceInfo = await executeAndLog(
      'getprop | grep -E "ro.product|ro.build|dalvik.vm"',
      sessionId
    );
    exportData.device = {
      properties: deviceInfo.stdout,
      api_level: (await executeAndLog('getprop ro.build.version.sdk', sessionId)).stdout.trim(),
      model: (await executeAndLog('getprop ro.product.model', sessionId)).stdout.trim()
    };

    // Logcat
    if (includeLogcat) {
      const logcat = await executeAndLog('logcat -d -v threadtime | tail -1000', sessionId);
      addSection('LOGCAT (Last 1000 lines)', logcat.stdout);
    }

    // System Information
    if (includeSystemInfo) {
      const uptime = await executeAndLog('uptime', sessionId);
      const df = await executeAndLog('df -h', sessionId);
      const mount = await executeAndLog('mount', sessionId);
      const cpuinfo = await executeAndLog('cat /proc/cpuinfo | head -50', sessionId);

      addSection(
        'SYSTEM INFORMATION',
        `
=== UPTIME ===
${uptime.stdout}

=== DISK USAGE ===
${df.stdout}

=== MOUNTED FILESYSTEMS ===
${mount.stdout}

=== CPU INFO ===
${cpuinfo.stdout}
`
      );
    }

    // Network Data
    if (includeNetworkData) {
      const netstat = await executeAndLog('netstat -tunlp 2>/dev/null', sessionId);
      const ifconfig = await executeAndLog('ifconfig 2>/dev/null || ip addr', sessionId);
      const route = await executeAndLog('ip route 2>/dev/null || route -n', sessionId);
      const arp = await executeAndLog('arp -a 2>/dev/null || ip neigh', sessionId);
      const ss = await executeAndLog('ss -tunap 2>/dev/null | head -100', sessionId);
      const tcpdump = await executeAndLog(
        'timeout 3 tcpdump -i any -c 20 -nn -q 2>/dev/null || echo "tcpdump not available"',
        sessionId
      );

      addSection(
        'NETWORK DATA',
        `
=== NETWORK CONNECTIONS ===
${netstat.stdout}

=== NETWORK INTERFACES ===
${ifconfig.stdout}

=== ROUTING TABLE ===
${route.stdout}

=== ARP TABLE ===
${arp.stdout}

=== SOCKET STATISTICS ===
${ss.stdout}

=== PACKET CAPTURE (20 packets) ===
${tcpdump.stdout}
`
      );
    }

    // Memory Information
    if (includeMemoryInfo) {
      const meminfo = await executeAndLog('cat /proc/meminfo', sessionId);
      const vmstat = await executeAndLog('vmstat 1 5', sessionId);
      const free = await executeAndLog('free -h', sessionId);
      const dumpsysMeminfo = await executeAndLog('dumpsys meminfo | head -200', sessionId);

      addSection(
        'MEMORY INFORMATION',
        `
=== MEMORY INFO ===
${meminfo.stdout}

=== VMSTAT ===
${vmstat.stdout}

=== FREE MEMORY ===
${free.stdout}

=== DUMPSYS MEMINFO ===
${dumpsysMeminfo.stdout}
`
      );
    }

    // Process Information
    if (includeProcessInfo) {
      const ps = await executeAndLog('ps aux | head -100', sessionId);
      const top = await executeAndLog('top -b -n 1 | head -100', sessionId);
      const lsof = await executeAndLog(
        'lsof 2>/dev/null | head -100 || echo "lsof not available"',
        sessionId
      );

      addSection(
        'PROCESS INFORMATION',
        `
=== PROCESS LIST ===
${ps.stdout}

=== TOP PROCESSES ===
${top.stdout}

=== OPEN FILES ===
${lsof.stdout}
`
      );
    }

    // Battery Stats
    if (includeBatteryStats) {
      const battery = await executeAndLog('dumpsys battery', sessionId);
      const batteryStats = await executeAndLog(
        'dumpsys batterystats --checkin | head -200',
        sessionId
      );
      const powerProfile = await executeAndLog('dumpsys power | head -100', sessionId);

      addSection(
        'BATTERY & POWER',
        `
=== BATTERY STATUS ===
${battery.stdout}

=== BATTERY STATISTICS ===
${batteryStats.stdout}

=== POWER PROFILE ===
${powerProfile.stdout}
`
      );
    }

    // Package Information
    if (includePackages) {
      const packages = await executeAndLog('pm list packages -f | head -100', sessionId);
      const permissions = await executeAndLog('pm list permissions -g -d | head -100', sessionId);

      addSection(
        'PACKAGE INFORMATION',
        `
=== INSTALLED PACKAGES (First 100) ===
${packages.stdout}

=== DANGEROUS PERMISSIONS ===
${permissions.stdout}
`
      );
    }

    // Custom Dumpsys Services
    for (const service of includeDumpsys) {
      const serviceData = await executeAndLog(`dumpsys ${service} | head -500`, sessionId);
      addSection(`DUMPSYS: ${service.toUpperCase()}`, serviceData.stdout);
    }

    // Get active debug sessions
    const sessions = await DebugSession.getAll();
    if (sessions && sessions.length > 0) {
      const sessionLogs = sessions.map((s) => ({
        id: s._id,
        startTime: s.startTime,
        status: s.status,
        logCount: s.logs?.length || 0
      }));
      addSection('DEBUG SESSIONS', JSON.stringify(sessionLogs, null, 2));
    }

    // Format output
    let output = '';
    if (format === 'txt') {
      output = `
================================================================================
                    ANDROID DEBUG DATA EXPORT
                    ${timestamp}
================================================================================

DEVICE INFORMATION:
${JSON.stringify(exportData.device, null, 2)}

`;

      for (const section of exportData.sections) {
        output += `
================================================================================
${section.title}
Time: ${section.timestamp}
================================================================================
${section.data}

`;
      }

      output += `
================================================================================
                    END OF EXPORT
================================================================================
`;
    } else {
      output = JSON.stringify(exportData, null, 2);
    }

    // Save to file
    const filename = `debug_export_${Date.now()}.${format}`;
    const filepath = `/data/local/tmp/${filename}`;
    await fs.writeFile(filepath, output, 'utf8');

    await Activity.log({
      type: 'debug_tools',
      action: 'export_all',
      metadata: {
        filename,
        size: output.length,
        sections: exportData.sections.length
      }
    });

    res.json({
      success: true,
      filename,
      filepath,
      size: output.length,
      sections: exportData.sections.map((s) => s.title),
      downloadUrl: `/api/debug-tools/export/download/${filename}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 27. Download Exported File
router.get('/export/download/:filename', authenticateApiKey, async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = `/data/local/tmp/${filename}`;

    // Check if file exists
    try {
      await fs.access(filepath);
    } catch {
      return res.status(404).json({ error: 'Export file not found' });
    }

    const content = await fs.readFile(filepath, 'utf8');

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 28. Export Network Packets (PCAP format)
router.post('/export/packets', authenticateApiKey, async (req, res) => {
  try {
    const {
      duration = 10,
      interface = 'any',
      filter = '',
      maxPackets = 1000,
      sessionId
    } = req.body;

    const filename = `packets_${Date.now()}.txt`;
    const filepath = `/data/local/tmp/${filename}`;

    let command = `timeout ${duration} tcpdump -i ${interface} -c ${maxPackets} -nn -tttt -vvv`;
    if (filter) {
      command += ` '${filter}'`;
    }
    command += ` > ${filepath} 2>&1`;

    const result = await executeAndLog(command, sessionId);

    // Read captured data
    let capturedData = '';
    try {
      const readResult = await executeAndLog(`cat ${filepath}`, sessionId);
      capturedData = readResult.stdout;
    } catch {}

    await Activity.log({
      type: 'debug_tools',
      action: 'export_packets',
      metadata: { duration, interface, filter, filename }
    });

    res.json({
      success: result.exitCode === 0,
      filename,
      filepath,
      packetCount: capturedData.split('\n').filter((l) => l.trim()).length,
      downloadUrl: `/api/debug-tools/export/download/${filename}`,
      preview: capturedData.split('\n').slice(0, 10).join('\n')
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UI Automator dump endpoint
router.post('/uiautomator/dump', authenticateApiKey, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const timestamp = Date.now();
    const filepath = `/sdcard/window_dump_${timestamp}.xml`;

    // Run uiautomator dump command
    const result = await executeAndLog(`uiautomator dump ${filepath}`, sessionId);

    // Try to read the dumped file
    let uiHierarchy = '';
    try {
      const readResult = await executeAndLog(`cat ${filepath}`, sessionId);
      uiHierarchy = readResult.stdout;
    } catch (e) {
      // File might not be accessible
      console.error('Could not read UI dump file:', e.message);
    }

    await Activity.log({
      type: 'debug_tools',
      action: 'ui_dump',
      metadata: { filepath, sessionId }
    });

    res.json({
      success: result.exitCode === 0,
      filepath,
      uiHierarchy: uiHierarchy.substring(0, 2000), // Send first 2000 chars
      timestamp: new Date().toISOString(),
      output: result.stdout
    });
  } catch (error) {
    console.error('UI dump error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to dump UI',
      message: error.message
    });
  }
});

// Clean up old processes periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, info] of activeProcesses.entries()) {
    if (info.output.status === 'completed' && now - info.output.startTime > 300000) {
      // 5 minutes
      activeProcesses.delete(id);
    }
  }
}, 60000); // Check every minute

module.exports = router;
