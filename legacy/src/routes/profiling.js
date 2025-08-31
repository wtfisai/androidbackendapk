const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { authenticateApiKey } = require('../middleware/auth');
const { Activity, DebugTrace } = require('../models/Activity');
const execAsync = promisify(exec);

// Active profiling sessions
const profilingSessions = new Map();

// POST /api/profiling/cpu/start
router.post('/cpu/start', authenticateApiKey, async (req, res) => {
  try {
    const {
      pid,
      duration = 30,
      samplingInterval = 1000, // microseconds
      method = 'simpleperf' // or 'systrace'
    } = req.body;

    if (!pid) {
      return res.status(400).json({ error: 'PID is required' });
    }

    const sessionId = `cpu_${Date.now()}_${pid}`;
    const outputPath = `/tmp/cpu_trace_${sessionId}.data`;

    let command;
    if (method === 'simpleperf') {
      // Use simpleperf for CPU profiling
      command = `simpleperf record -p ${pid} -f ${samplingInterval} --duration ${duration} -o ${outputPath}`;
    } else {
      // Use systrace
      command = `atrace --async_start -t ${duration} -b 4096 sched freq idle`;
    }

    // Start profiling in background
    exec(command, (error, stdout, stderr) => {
      if (!error) {
        profilingSessions.set(sessionId, {
          status: 'completed',
          outputPath,
          endTime: new Date()
        });
      }
    });

    profilingSessions.set(sessionId, {
      pid,
      method,
      duration,
      samplingInterval,
      outputPath,
      startTime: new Date(),
      status: 'running'
    });

    await Activity.log({
      type: 'profiling',
      action: 'cpu_profile_start',
      metadata: { sessionId, pid, duration, method }
    });

    res.json({
      sessionId,
      status: 'started',
      pid,
      duration,
      method,
      outputPath,
      willCompleteAt: new Date(Date.now() + duration * 1000)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start CPU profiling',
      message: error.message
    });
  }
});

// GET /api/profiling/cpu/:sessionId
router.get('/cpu/:sessionId', authenticateApiKey, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = profilingSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let analysis = null;

    if (session.status === 'completed' && session.method === 'simpleperf') {
      // Analyze simpleperf output
      try {
        const { stdout } = await execAsync(
          `simpleperf report -i ${session.outputPath} --sort cpu --limit 20`
        );
        analysis = parseSimplePerfReport(stdout);
      } catch (e) {
        analysis = { error: 'Failed to parse profiling data' };
      }
    }

    res.json({
      sessionId,
      ...session,
      analysis
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get profiling session',
      message: error.message
    });
  }
});

// POST /api/profiling/memory/snapshot
router.post('/memory/snapshot', authenticateApiKey, async (req, res) => {
  try {
    const { pid, heapDump = false } = req.body;

    if (!pid) {
      return res.status(400).json({ error: 'PID is required' });
    }

    const snapshot = {
      pid,
      timestamp: new Date(),
      memory: {}
    };

    // Get memory info from /proc
    try {
      const { stdout: statusOutput } = await execAsync(`cat /proc/${pid}/status`);
      const vmRssMatch = statusOutput.match(/VmRSS:\s+(\d+)\s+kB/);
      const vmSizeMatch = statusOutput.match(/VmSize:\s+(\d+)\s+kB/);
      const vmPeakMatch = statusOutput.match(/VmPeak:\s+(\d+)\s+kB/);

      snapshot.memory = {
        rss: vmRssMatch ? parseInt(vmRssMatch[1]) : 0,
        vsize: vmSizeMatch ? parseInt(vmSizeMatch[1]) : 0,
        peak: vmPeakMatch ? parseInt(vmPeakMatch[1]) : 0
      };
    } catch (e) {
      // Process might not exist
    }

    // Get detailed memory info from dumpsys
    try {
      const { stdout } = await execAsync(`dumpsys meminfo ${pid}`);
      snapshot.detailed = parseMeminfo(stdout);
    } catch (e) {
      snapshot.detailed = null;
    }

    // Generate heap dump if requested
    if (heapDump) {
      const dumpPath = `/tmp/heapdump_${pid}_${Date.now()}.hprof`;
      try {
        await execAsync(`am dumpheap ${pid} ${dumpPath}`);
        snapshot.heapDumpPath = dumpPath;

        // Get file size
        const stats = await fs.stat(dumpPath);
        snapshot.heapDumpSize = stats.size;
      } catch (e) {
        snapshot.heapDumpError = e.message;
      }
    }

    // Store in debug trace
    if (req.body.sessionId) {
      await DebugTrace.addSnapshot(req.body.sessionId, 'memory', snapshot);
    }

    await Activity.log({
      type: 'profiling',
      action: 'memory_snapshot',
      metadata: { pid, heapDump }
    });

    res.json(snapshot);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to capture memory snapshot',
      message: error.message
    });
  }
});

// POST /api/profiling/trace/start
router.post('/trace/start', authenticateApiKey, async (req, res) => {
  try {
    const {
      categories = [
        'sched',
        'freq',
        'idle',
        'am',
        'wm',
        'gfx',
        'view',
        'webview',
        'camera',
        'hal',
        'res',
        'dalvik'
      ],
      duration = 10,
      bufferSize = 4096,
      apps = []
    } = req.body;

    const sessionId = `trace_${Date.now()}`;
    const outputPath = `/tmp/trace_${sessionId}.perfetto`;

    // Build atrace command
    let command = 'atrace';
    command += ` -t ${duration}`;
    command += ` -b ${bufferSize}`;
    command += ` ${categories.join(' ')}`;

    // Add app-specific tracing if specified
    for (const app of apps) {
      command += ` --app=${app}`;
    }

    command += ` -o ${outputPath}`;

    // Start tracing in background
    exec(command, (error) => {
      if (!error) {
        profilingSessions.set(sessionId, {
          status: 'completed',
          outputPath,
          endTime: new Date()
        });
      }
    });

    profilingSessions.set(sessionId, {
      type: 'system_trace',
      categories,
      duration,
      bufferSize,
      apps,
      outputPath,
      startTime: new Date(),
      status: 'running'
    });

    await Activity.log({
      type: 'profiling',
      action: 'trace_start',
      metadata: { sessionId, categories, duration }
    });

    res.json({
      sessionId,
      status: 'started',
      duration,
      categories,
      outputPath,
      willCompleteAt: new Date(Date.now() + duration * 1000)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start trace',
      message: error.message
    });
  }
});

// GET /api/profiling/gfxinfo/:packageName
router.get('/gfxinfo/:packageName', authenticateApiKey, async (req, res) => {
  try {
    const { packageName } = req.params;
    const { reset = false } = req.query;

    if (reset === 'true') {
      await execAsync(`dumpsys gfxinfo ${packageName} reset`);
      return res.json({ success: true, message: 'Graphics info reset' });
    }

    const { stdout } = await execAsync(`dumpsys gfxinfo ${packageName}`);

    // Parse graphics info
    const gfxInfo = {
      package: packageName,
      profileData: [],
      jankyFrames: 0,
      totalFrames: 0,
      percentile90: 0,
      percentile95: 0,
      percentile99: 0
    };

    // Extract frame stats
    const statsMatch = stdout.match(/Janky frames:\s+(\d+)\s+\(([\d.]+)%\)/);
    if (statsMatch) {
      gfxInfo.jankyFrames = parseInt(statsMatch[1]);
      gfxInfo.jankyPercent = parseFloat(statsMatch[2]);
    }

    const totalMatch = stdout.match(/Total frames rendered:\s+(\d+)/);
    if (totalMatch) {
      gfxInfo.totalFrames = parseInt(totalMatch[1]);
    }

    // Extract percentiles
    const p90Match = stdout.match(/90th percentile:\s+([\d.]+)ms/);
    if (p90Match) {
      gfxInfo.percentile90 = parseFloat(p90Match[1]);
    }

    const p95Match = stdout.match(/95th percentile:\s+([\d.]+)ms/);
    if (p95Match) {
      gfxInfo.percentile95 = parseFloat(p95Match[1]);
    }

    const p99Match = stdout.match(/99th percentile:\s+([\d.]+)ms/);
    if (p99Match) {
      gfxInfo.percentile99 = parseFloat(p99Match[1]);
    }

    // Extract profile data
    const profileSection = stdout.match(/Profile data[\s\S]*?(?=\n\n)/);
    if (profileSection) {
      const lines = profileSection[0].split('\n').slice(1);
      for (const line of lines) {
        const match = line.match(/^\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
        if (match) {
          gfxInfo.profileData.push({
            draw: parseFloat(match[1]),
            prepare: parseFloat(match[2]),
            process: parseFloat(match[3]),
            execute: parseFloat(match[4])
          });
        }
      }
    }

    await Activity.log({
      type: 'profiling',
      action: 'gfxinfo',
      metadata: { packageName }
    });

    res.json(gfxInfo);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get graphics info',
      message: error.message
    });
  }
});

// GET /api/profiling/power
router.get('/power', authenticateApiKey, async (req, res) => {
  try {
    const powerData = {
      battery: {},
      wakelocks: [],
      alarms: [],
      jobScheduler: [],
      thermalStatus: {}
    };

    // Get battery info
    try {
      const { stdout } = await execAsync('dumpsys battery');
      const lines = stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(.+?):\s*(.+)$/);
        if (match) {
          const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
          const value = match[2].trim();
          powerData.battery[key] = isNaN(value) ? value : parseFloat(value);
        }
      }
    } catch (e) {
      powerData.battery = { error: e.message };
    }

    // Get wakelock info
    try {
      const { stdout } = await execAsync('dumpsys power | grep -A 5 "Wake Locks"');
      const lines = stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/PARTIAL_WAKE_LOCK\s+'([^']+)'/);
        if (match) {
          powerData.wakelocks.push(match[1]);
        }
      }
    } catch (e) {
      // Wakelocks might not be available
    }

    // Get alarm info
    try {
      const { stdout } = await execAsync('dumpsys alarm | grep -A 3 "Top Alarms"');
      const lines = stdout.split('\n');
      for (const line of lines) {
        const match = line.match(/\+(\d+)ms.*\s+(\d+)\s+alarms:\s+(.+)/);
        if (match) {
          powerData.alarms.push({
            time: parseInt(match[1]),
            count: parseInt(match[2]),
            package: match[3].trim()
          });
        }
      }
    } catch (e) {
      // Alarms might not be available
    }

    // Get thermal status
    try {
      const { stdout } = await execAsync('dumpsys thermalservice');
      const tempMatch = stdout.match(/mTemperature=(-?\d+)/);
      const statusMatch = stdout.match(/mStatus=(\d+)/);

      powerData.thermalStatus = {
        temperature: tempMatch ? parseInt(tempMatch[1]) / 10 : null,
        status: statusMatch ? parseInt(statusMatch[1]) : 0,
        statusText: ['NONE', 'LIGHT', 'MODERATE', 'SEVERE', 'CRITICAL', 'EMERGENCY', 'SHUTDOWN'][
          statusMatch ? parseInt(statusMatch[1]) : 0
        ]
      };
    } catch (e) {
      powerData.thermalStatus = { error: e.message };
    }

    await Activity.log({
      type: 'profiling',
      action: 'power_profile',
      metadata: {}
    });

    res.json({
      ...powerData,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get power profile',
      message: error.message
    });
  }
});

// GET /api/profiling/network
router.get('/network', authenticateApiKey, async (req, res) => {
  try {
    const { packageName } = req.query;

    const networkStats = {
      interfaces: {},
      uid: null,
      appStats: null
    };

    // Get network interface stats
    try {
      const { stdout } = await execAsync('cat /proc/net/dev');
      const lines = stdout.split('\n').slice(2);

      for (const line of lines) {
        if (line.trim()) {
          const parts = line.trim().split(/\s+/);
          const iface = parts[0].replace(':', '');

          networkStats.interfaces[iface] = {
            rxBytes: parseInt(parts[1]),
            rxPackets: parseInt(parts[2]),
            txBytes: parseInt(parts[9]),
            txPackets: parseInt(parts[10])
          };
        }
      }
    } catch (e) {
      networkStats.interfaces = { error: e.message };
    }

    // Get app-specific network stats if package specified
    if (packageName) {
      try {
        // Get UID for package
        const { stdout: uidOutput } = await execAsync(
          `dumpsys package ${packageName} | grep userId=`
        );
        const uidMatch = uidOutput.match(/userId=(\d+)/);

        if (uidMatch) {
          const uid = uidMatch[1];
          networkStats.uid = uid;

          // Get network stats for UID
          const { stdout: statsOutput } = await execAsync(
            `cat /proc/net/xt_qtaguid/stats | grep " ${uid} "`
          );
          const statsLines = statsOutput.split('\n').filter((l) => l.trim());

          let totalRx = 0;
          let totalTx = 0;

          for (const line of statsLines) {
            const parts = line.split(/\s+/);
            totalRx += parseInt(parts[5]) || 0;
            totalTx += parseInt(parts[7]) || 0;
          }

          networkStats.appStats = {
            package: packageName,
            uid,
            rxBytes: totalRx,
            txBytes: totalTx
          };
        }
      } catch (e) {
        networkStats.appStats = { error: e.message };
      }
    }

    await Activity.log({
      type: 'profiling',
      action: 'network_stats',
      metadata: { packageName }
    });

    res.json({
      ...networkStats,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get network stats',
      message: error.message
    });
  }
});

// Helper function to parse simpleperf report
function parseSimplePerfReport(output) {
  const report = {
    samples: 0,
    events: [],
    topFunctions: []
  };

  // Extract sample count
  const sampleMatch = output.match(/Total:\s+(\d+)\s+samples/);
  if (sampleMatch) {
    report.samples = parseInt(sampleMatch[1]);
  }

  // Parse function list
  const lines = output.split('\n');
  let inFunctionList = false;

  for (const line of lines) {
    if (line.includes('Overhead') && line.includes('Symbol')) {
      inFunctionList = true;
      continue;
    }

    if (inFunctionList) {
      const match = line.match(/^\s*([\d.]+)%\s+(.+)/);
      if (match) {
        report.topFunctions.push({
          overhead: parseFloat(match[1]),
          symbol: match[2].trim()
        });
      }
    }
  }

  return report;
}

// Helper function to parse meminfo
function parseMeminfo(output) {
  const meminfo = {
    summary: {},
    details: {}
  };

  // Extract summary values
  const pssMatch = output.match(/TOTAL\s+(\d+)/);
  if (pssMatch) {
    meminfo.summary.totalPss = parseInt(pssMatch[1]);
  }

  // Extract detailed categories
  const categories = ['Native Heap', 'Dalvik Heap', 'Stack', 'Ashmem', 'Other dev'];
  for (const category of categories) {
    const regex = new RegExp(`${category}\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)`);
    const match = output.match(regex);
    if (match) {
      meminfo.details[category.toLowerCase().replace(/\s+/g, '_')] = {
        pss: parseInt(match[1]),
        privateDirty: parseInt(match[2]),
        privateClean: parseInt(match[3]),
        sharedDirty: parseInt(match[4])
      };
    }
  }

  return meminfo;
}

module.exports = router;
