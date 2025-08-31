const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const { authenticateApiKey } = require('../middleware/auth');
const { DebugTrace, Activity } = require('../models/Activity');
const execAsync = promisify(exec);

// Active debug sessions
const activeSessions = new Map();

// Helper to get process info
async function getProcessDetails(pid) {
  try {
    const commands = [
      `cat /proc/${pid}/cmdline | tr '\\0' ' '`,
      `cat /proc/${pid}/status | grep -E 'Name|State|VmSize|VmRSS|Threads'`,
      `ls -la /proc/${pid}/fd 2>/dev/null | wc -l`
    ];

    const results = await Promise.all(
      commands.map((cmd) => execAsync(cmd).catch((e) => ({ stdout: '', stderr: e.message })))
    );

    const cmdline = results[0].stdout.trim();
    const statusLines = results[1].stdout.trim().split('\n');
    const fdCount = parseInt(results[2].stdout.trim()) || 0;

    const status = {};
    statusLines.forEach((line) => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length) {
        status[key.trim()] = valueParts.join(':').trim();
      }
    });

    return {
      pid,
      name: status.Name || 'unknown',
      state: status.State || 'unknown',
      cmdline,
      memory: {
        virtual: status.VmSize || '0',
        resident: status.VmRSS || '0'
      },
      threads: parseInt(status.Threads) || 1,
      openFiles: fdCount
    };
  } catch (error) {
    return null;
  }
}

// Helper to attach strace to a process
async function attachStrace(pid, sessionId) {
  const outputFile = `/tmp/strace_${sessionId}.log`;

  try {
    // Start strace in background
    const straceCmd = `strace -p ${pid} -f -t -e trace=all -o ${outputFile} 2>&1 &`;
    const { stdout } = await execAsync(straceCmd);

    // Get the strace PID
    const { stdout: stracePid } = await execAsync(`pgrep -f "strace -p ${pid}"`);

    return {
      success: true,
      stracePid: stracePid.trim(),
      outputFile
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Helper to parse strace output
async function parseStraceOutput(outputFile, limit = 100) {
  try {
    const { stdout } = await execAsync(`tail -n ${limit} ${outputFile} 2>/dev/null`);
    const lines = stdout.split('\n').filter((l) => l.trim());

    const traces = lines.map((line) => {
      const match = line.match(/^(\d+:\d+:\d+)\s+(\w+)\((.*?)\)\s*=\s*(.+)$/);
      if (match) {
        return {
          timestamp: match[1],
          syscall: match[2],
          args: match[3],
          result: match[4]
        };
      }
      return { raw: line };
    });

    return traces;
  } catch (error) {
    return [];
  }
}

// POST /api/debug/start
router.post('/start', authenticateApiKey, async (req, res) => {
  const { pid, packageName, options = {} } = req.body;

  if (!pid) {
    return res.status(400).json({ error: 'PID is required' });
  }

  try {
    // Get process details
    const processInfo = await getProcessDetails(pid);
    if (!processInfo) {
      return res.status(404).json({ error: 'Process not found' });
    }

    // Create debug session
    const session = await DebugTrace.startSession({
      pid,
      name: processInfo.name,
      packageName: packageName || processInfo.cmdline,
      metadata: {
        ...processInfo,
        options
      }
    });

    // Start monitoring based on options
    const monitoring = {
      strace: false,
      logcat: false,
      memory: false,
      cpu: false
    };

    if (options.strace !== false) {
      const straceResult = await attachStrace(pid, session.sessionId);
      monitoring.strace = straceResult.success;
      if (straceResult.success) {
        activeSessions.set(session.sessionId, {
          ...session,
          stracePid: straceResult.stracePid,
          straceOutput: straceResult.outputFile
        });
      }
    }

    if (options.logcat && packageName) {
      // Start filtered logcat
      const logcatCmd = `logcat --pid=${pid} -v time > /tmp/logcat_${session.sessionId}.log 2>&1 &`;
      try {
        await execAsync(logcatCmd);
        monitoring.logcat = true;
      } catch (e) {
        monitoring.logcat = false;
      }
    }

    // Set up periodic monitoring
    if (options.memory || options.cpu) {
      const monitoringInterval = setInterval(async () => {
        const activeSession = activeSessions.get(session.sessionId);
        if (!activeSession || activeSession.status === 'stopped') {
          clearInterval(monitoringInterval);
          return;
        }

        // Collect snapshots
        if (options.memory) {
          try {
            const { stdout } = await execAsync(
              `cat /proc/${pid}/status | grep -E 'VmSize|VmRSS|VmPeak'`
            );
            await DebugTrace.addSnapshot(session.sessionId, 'memory', {
              raw: stdout,
              parsed: stdout.split('\n').reduce((acc, line) => {
                const [key, value] = line.split(':');
                if (key && value) {
                  acc[key.trim()] = value.trim();
                }
                return acc;
              }, {})
            });
          } catch (e) {
            // Process might have ended
          }
        }

        if (options.cpu) {
          try {
            const { stdout } = await execAsync(`top -b -n 1 -p ${pid} | tail -1`);
            const cpuMatch = stdout.match(/\s+(\d+\.?\d*)\s+/);
            if (cpuMatch) {
              await DebugTrace.addSnapshot(session.sessionId, 'cpu', {
                usage: parseFloat(cpuMatch[1])
              });
            }
          } catch (e) {
            // Process might have ended
          }
        }
      }, options.interval || 5000);

      activeSessions.set(session.sessionId, {
        ...activeSessions.get(session.sessionId),
        monitoringInterval
      });
    }

    // Log activity
    await Activity.log({
      type: 'debug_session',
      action: 'start_debug',
      metadata: {
        sessionId: session.sessionId,
        pid,
        monitoring
      }
    });

    res.json({
      sessionId: session.sessionId,
      process: processInfo,
      monitoring,
      message: 'Debug session started successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start debug session',
      message: error.message
    });
  }
});

// POST /api/debug/stop
router.post('/stop', authenticateApiKey, async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const session = activeSessions.get(sessionId);

    if (session) {
      // Stop strace if running
      if (session.stracePid) {
        try {
          await execAsync(`kill ${session.stracePid}`);
        } catch (e) {
          // Strace might have already stopped
        }
      }

      // Stop monitoring interval
      if (session.monitoringInterval) {
        clearInterval(session.monitoringInterval);
      }

      // Clean up log files after reading final data
      if (session.straceOutput) {
        const traces = await parseStraceOutput(session.straceOutput, 1000);
        for (const trace of traces.slice(0, 100)) {
          await DebugTrace.addTrace(sessionId, {
            type: 'syscall',
            ...trace
          });
        }

        // Clean up
        try {
          await execAsync(`rm -f ${session.straceOutput}`);
        } catch (e) {
          // File might not exist
        }
      }

      activeSessions.delete(sessionId);
    }

    // Update session status in database
    await DebugTrace.endSession(sessionId);

    // Log activity
    await Activity.log({
      type: 'debug_session',
      action: 'stop_debug',
      metadata: { sessionId }
    });

    res.json({
      success: true,
      sessionId,
      message: 'Debug session stopped'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to stop debug session',
      message: error.message
    });
  }
});

// GET /api/debug/session/:sessionId
router.get('/session/:sessionId', authenticateApiKey, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await DebugTrace.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get live traces if session is active
    const activeSession = activeSessions.get(sessionId);
    if (activeSession && activeSession.straceOutput) {
      const liveTraces = await parseStraceOutput(activeSession.straceOutput, 50);
      session.liveTraces = liveTraces;
    }

    res.json(session);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get session data',
      message: error.message
    });
  }
});

// GET /api/debug/sessions
router.get('/sessions', authenticateApiKey, async (req, res) => {
  try {
    const { active, limit = 50 } = req.query;

    let sessions;
    if (active === 'true') {
      sessions = await DebugTrace.getActiveSessions();
    } else {
      sessions = await DebugTrace.getAllSessions(parseInt(limit));
    }

    // Add live status
    const sessionsWithStatus = sessions.map((session) => ({
      ...session,
      isLive: activeSessions.has(session.sessionId)
    }));

    res.json({
      sessions: sessionsWithStatus,
      count: sessionsWithStatus.length,
      activeSessions: activeSessions.size
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get sessions',
      message: error.message
    });
  }
});

// POST /api/debug/trace
router.post('/trace', authenticateApiKey, async (req, res) => {
  const { sessionId, traceData } = req.body;

  if (!sessionId || !traceData) {
    return res.status(400).json({
      error: 'Session ID and trace data are required'
    });
  }

  try {
    await DebugTrace.addTrace(sessionId, traceData);

    res.json({
      success: true,
      message: 'Trace added successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to add trace',
      message: error.message
    });
  }
});

// POST /api/debug/attach-gdb
router.post('/attach-gdb', authenticateApiKey, async (req, res) => {
  const { pid, commands = [] } = req.body;

  if (!pid) {
    return res.status(400).json({ error: 'PID is required' });
  }

  try {
    // Create GDB commands file
    const gdbCmdsFile = `/tmp/gdb_commands_${Date.now()}.txt`;
    const gdbCommands = [
      'set pagination off',
      'info registers',
      'info threads',
      'backtrace',
      ...commands,
      'detach',
      'quit'
    ].join('\n');

    await execAsync(`echo "${gdbCommands}" > ${gdbCmdsFile}`);

    // Run GDB
    const { stdout, stderr } = await execAsync(`gdb -p ${pid} -batch -x ${gdbCmdsFile} 2>&1`, {
      maxBuffer: 1024 * 1024 * 5
    });

    // Clean up
    await execAsync(`rm -f ${gdbCmdsFile}`);

    // Parse GDB output
    const output = stdout + stderr;
    const sections = {};

    // Parse registers
    const registerMatch = output.match(/info registers[\s\S]*?(?=\n\w+:|$)/);
    if (registerMatch) {
      sections.registers = registerMatch[0];
    }

    // Parse threads
    const threadsMatch = output.match(/info threads[\s\S]*?(?=\n\w+:|$)/);
    if (threadsMatch) {
      sections.threads = threadsMatch[0];
    }

    // Parse backtrace
    const backtraceMatch = output.match(/backtrace[\s\S]*?(?=\n\w+:|$)/);
    if (backtraceMatch) {
      sections.backtrace = backtraceMatch[0];
    }

    res.json({
      pid,
      output: sections,
      raw: output,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to attach GDB',
      message: error.message,
      hint: 'Make sure GDB is installed (pkg install gdb)'
    });
  }
});

// GET /api/debug/logcat
router.get('/logcat', authenticateApiKey, async (req, res) => {
  const { pid, packageName, lines = 100, level = 'V' } = req.query;

  try {
    let command = 'logcat -d -v time';

    // Add filters
    if (pid) {
      command += ` --pid=${pid}`;
    } else if (packageName) {
      command += ` | grep ${packageName}`;
    }

    // Add log level filter
    command += ` *:${level}`;

    // Limit lines
    command += ` | tail -n ${lines}`;

    const { stdout } = await execAsync(command);

    // Parse logcat output
    const logs = stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const match = line.match(
          /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\w)\/(.+?)\s*\(\s*(\d+)\):\s*(.*)$/
        );
        if (match) {
          return {
            timestamp: match[1],
            level: match[2],
            tag: match[3],
            pid: parseInt(match[4]),
            message: match[5]
          };
        }
        return { raw: line };
      });

    res.json({
      logs,
      count: logs.length,
      filters: { pid, packageName, level }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get logcat',
      message: error.message
    });
  }
});

// POST /api/debug/heap-dump
router.post('/heap-dump', authenticateApiKey, async (req, res) => {
  const { pid } = req.body;

  if (!pid) {
    return res.status(400).json({ error: 'PID is required' });
  }

  try {
    const dumpFile = `/tmp/heap_${pid}_${Date.now()}.txt`;

    // Get heap information
    const commands = [
      `cat /proc/${pid}/maps | grep heap`,
      `cat /proc/${pid}/smaps | grep -A 10 heap`,
      `cat /proc/${pid}/status | grep -E 'VmData|VmStk|VmExe|VmLib'`
    ];

    const results = await Promise.all(
      commands.map((cmd) => execAsync(cmd).catch((e) => ({ stdout: '' })))
    );

    const heapInfo = {
      maps: results[0].stdout,
      smaps: results[1].stdout,
      memory: results[2].stdout
    };

    // Parse heap data
    const heapData = {
      pid,
      timestamp: new Date(),
      heap: {
        raw: heapInfo.maps,
        details: heapInfo.smaps
      },
      memory: {}
    };

    // Parse memory values
    heapInfo.memory.split('\n').forEach((line) => {
      const [key, value] = line.split(':');
      if (key && value) {
        heapData.memory[key.trim()] = value.trim();
      }
    });

    res.json(heapData);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create heap dump',
      message: error.message
    });
  }
});

module.exports = router;
