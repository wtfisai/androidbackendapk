const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const { authenticateApiKey } = require('../middleware/auth');
const { ProcessLog } = require('../models/Activity');
const execAsync = promisify(exec);

// Helper function to get process info
async function getProcessInfo(pid) {
  try {
    const { stdout } = await execAsync(
      `ps -p ${pid} -o pid,ppid,user,nice,pri,psr,pcpu,pmem,vsz,rss,tty,stat,start_time,time,comm`
    );
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) {
      return null;
    }

    const headers = lines[0].trim().split(/\s+/);
    const values = lines[1].trim().split(/\s+/);

    const processInfo = {};
    headers.forEach((header, index) => {
      processInfo[header.toLowerCase()] = values[index];
    });

    return processInfo;
  } catch (error) {
    return null;
  }
}

// Get memory and CPU usage for a process
async function getProcessResources(pid) {
  try {
    const memCmd = `cat /proc/${pid}/status | grep -E 'VmRSS|VmSize' | awk '{print $2}'`;
    const cpuCmd = `top -b -n 1 -p ${pid} | tail -1 | awk '{print $9}'`;

    const [memResult, cpuResult] = await Promise.all([execAsync(memCmd), execAsync(cpuCmd)]);

    const memLines = memResult.stdout.trim().split('\n');
    const memory = memLines[0] ? parseInt(memLines[0]) : 0;
    const cpu = cpuResult.stdout ? parseFloat(cpuResult.stdout.trim()) : 0;

    return { memory, cpu };
  } catch (error) {
    return { memory: 0, cpu: 0 };
  }
}

// PUT /api/optimize/process/:pid/sleep
router.put('/process/:pid/sleep', authenticateApiKey, async (req, res) => {
  const { pid } = req.params;
  const { aggressive = false } = req.body;

  try {
    // Get current process state
    const processBefore = await getProcessInfo(pid);
    if (!processBefore) {
      return res.status(404).json({
        error: 'Process not found',
        pid
      });
    }

    const resourcesBefore = await getProcessResources(pid);

    // Send SIGSTOP to pause the process
    const signal = aggressive ? 'SIGKILL' : 'SIGSTOP';
    await execAsync(`kill -${signal} ${pid}`);

    // Wait a moment for the signal to take effect
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get new state
    const processAfter = await getProcessInfo(pid);
    const resourcesAfter = await getProcessResources(pid);

    // Log the action
    await ProcessLog.logAction({
      pid: parseInt(pid),
      name: processBefore.comm,
      action: aggressive ? 'kill' : 'sleep',
      status: 'success',
      previousState: processBefore.stat,
      newState: processAfter ? processAfter.stat : 'terminated',
      cpuBefore: resourcesBefore.cpu,
      cpuAfter: resourcesAfter.cpu,
      memoryBefore: resourcesBefore.memory,
      memoryAfter: resourcesAfter.memory,
      metadata: { aggressive }
    });

    res.json({
      success: true,
      message: `Process ${pid} has been ${aggressive ? 'terminated' : 'suspended'}`,
      process: {
        pid,
        name: processBefore.comm,
        action: aggressive ? 'killed' : 'sleeping',
        resourcesSaved: {
          cpu: resourcesBefore.cpu - resourcesAfter.cpu,
          memory: resourcesBefore.memory - resourcesAfter.memory
        }
      }
    });
  } catch (error) {
    await ProcessLog.logAction({
      pid: parseInt(pid),
      action: 'sleep',
      status: 'failed',
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to suspend process',
      message: error.message
    });
  }
});

// PUT /api/optimize/process/:pid/wake
router.put('/process/:pid/wake', authenticateApiKey, async (req, res) => {
  const { pid } = req.params;

  try {
    // Get current process state
    const processBefore = await getProcessInfo(pid);
    if (!processBefore) {
      return res.status(404).json({
        error: 'Process not found',
        pid
      });
    }

    const resourcesBefore = await getProcessResources(pid);

    // Send SIGCONT to resume the process
    await execAsync(`kill -SIGCONT ${pid}`);

    // Wait for process to resume
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get new state
    const processAfter = await getProcessInfo(pid);
    const resourcesAfter = await getProcessResources(pid);

    // Log the action
    await ProcessLog.logAction({
      pid: parseInt(pid),
      name: processBefore.comm,
      action: 'wake',
      status: 'success',
      previousState: processBefore.stat,
      newState: processAfter.stat,
      cpuBefore: resourcesBefore.cpu,
      cpuAfter: resourcesAfter.cpu,
      memoryBefore: resourcesBefore.memory,
      memoryAfter: resourcesAfter.memory
    });

    res.json({
      success: true,
      message: `Process ${pid} has been resumed`,
      process: {
        pid,
        name: processBefore.comm,
        state: processAfter.stat,
        resources: resourcesAfter
      }
    });
  } catch (error) {
    await ProcessLog.logAction({
      pid: parseInt(pid),
      action: 'wake',
      status: 'failed',
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to resume process',
      message: error.message
    });
  }
});

// POST /api/optimize/batch
router.post('/batch', authenticateApiKey, async (req, res) => {
  const { pids, action, threshold } = req.body;

  if (!pids || !Array.isArray(pids)) {
    return res.status(400).json({ error: 'PIDs array is required' });
  }

  if (!['sleep', 'wake', 'kill'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  const results = [];

  for (const pid of pids) {
    try {
      const processBefore = await getProcessInfo(pid);
      if (!processBefore) {
        results.push({ pid, status: 'not_found' });
        continue;
      }

      const resourcesBefore = await getProcessResources(pid);

      // Apply threshold check if specified
      if (threshold && action === 'sleep') {
        if (resourcesBefore.cpu < threshold.cpu && resourcesBefore.memory < threshold.memory) {
          results.push({
            pid,
            status: 'skipped',
            reason: 'Below threshold'
          });
          continue;
        }
      }

      // Execute action
      let signal;
      switch (action) {
        case 'sleep':
          signal = 'SIGSTOP';
          break;
        case 'wake':
          signal = 'SIGCONT';
          break;
        case 'kill':
          signal = 'SIGKILL';
          break;
      }

      await execAsync(`kill -${signal} ${pid}`);

      const resourcesAfter = await getProcessResources(pid);

      await ProcessLog.logAction({
        pid: parseInt(pid),
        name: processBefore.comm,
        action,
        status: 'success',
        cpuBefore: resourcesBefore.cpu,
        cpuAfter: resourcesAfter.cpu,
        memoryBefore: resourcesBefore.memory,
        memoryAfter: resourcesAfter.memory
      });

      results.push({
        pid,
        status: 'success',
        name: processBefore.comm,
        resourcesSaved: {
          cpu: resourcesBefore.cpu - resourcesAfter.cpu,
          memory: resourcesBefore.memory - resourcesAfter.memory
        }
      });
    } catch (error) {
      results.push({
        pid,
        status: 'failed',
        error: error.message
      });
    }
  }

  res.json({
    action,
    totalProcessed: results.length,
    successful: results.filter((r) => r.status === 'success').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results
  });
});

// GET /api/optimize/suggestions
router.get('/suggestions', authenticateApiKey, async (req, res) => {
  try {
    // Get all running processes
    const { stdout } = await execAsync('ps aux --sort=-%mem | head -20');
    const lines = stdout.trim().split('\n');
    const headers = lines[0].trim().split(/\s+/);

    const suggestions = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].trim().split(/\s+/);
      const process = {};

      headers.forEach((header, index) => {
        process[header.toLowerCase()] = values[index];
      });

      const cpu = parseFloat(process['%cpu'] || process.cpu || 0);
      const mem = parseFloat(process['%mem'] || process.mem || 0);
      const command = values.slice(10).join(' ');

      // Suggest optimization for high resource processes
      if (cpu > 20 || mem > 5) {
        const suggestion = {
          pid: process.pid,
          name: command.substring(0, 50),
          cpu,
          memory: mem,
          recommendation: null,
          priority: 'low'
        };

        // Determine recommendation
        if (cpu > 50) {
          suggestion.recommendation = 'High CPU usage - consider throttling or suspending';
          suggestion.priority = 'high';
        } else if (mem > 10) {
          suggestion.recommendation = 'High memory usage - consider restarting or suspending';
          suggestion.priority = 'high';
        } else if (cpu > 20) {
          suggestion.recommendation = 'Moderate CPU usage - monitor for increases';
          suggestion.priority = 'medium';
        } else if (mem > 5) {
          suggestion.recommendation = 'Moderate memory usage - monitor for leaks';
          suggestion.priority = 'medium';
        }

        suggestions.push(suggestion);
      }
    }

    // Sort by priority and resource usage
    suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return b.cpu + b.memory - (a.cpu + a.memory);
    });

    res.json({
      timestamp: new Date(),
      totalProcesses: lines.length - 1,
      suggestionsCount: suggestions.length,
      suggestions: suggestions.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate suggestions',
      message: error.message
    });
  }
});

// POST /api/optimize/memory/clean
router.post('/memory/clean', authenticateApiKey, async (req, res) => {
  try {
    const results = {};

    // Drop caches (requires root on real devices, works in Termux)
    try {
      await execAsync('sync');
      results.cachesSynced = true;
    } catch (e) {
      results.cachesSynced = false;
    }

    // Clear package manager cache
    try {
      await execAsync('pm trim-caches 999999999999');
      results.packageCacheCleared = true;
    } catch (e) {
      results.packageCacheCleared = false;
    }

    // Get memory stats before and after
    const memBefore = await execAsync('free -m');

    // Try to free page cache, dentries and inodes
    try {
      await execAsync('echo 3 > /proc/sys/vm/drop_caches');
      results.systemCachesDropped = true;
    } catch (e) {
      results.systemCachesDropped = false;
    }

    const memAfter = await execAsync('free -m');

    // Parse memory info
    const parseMemory = (output) => {
      const lines = output.stdout.split('\n');
      const memLine = lines.find((l) => l.startsWith('Mem:'));
      if (memLine) {
        const parts = memLine.split(/\s+/);
        return {
          total: parseInt(parts[1]),
          used: parseInt(parts[2]),
          free: parseInt(parts[3])
        };
      }
      return null;
    };

    const memoryBefore = parseMemory(memBefore);
    const memoryAfter = parseMemory(memAfter);

    const freedMemory = memoryBefore && memoryAfter ? memoryAfter.free - memoryBefore.free : 0;

    res.json({
      success: true,
      results,
      memory: {
        before: memoryBefore,
        after: memoryAfter,
        freed: freedMemory
      },
      message: `Freed approximately ${freedMemory}MB of memory`
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clean memory',
      message: error.message
    });
  }
});

// GET /api/optimize/history
router.get('/history', authenticateApiKey, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const history = await ProcessLog.getOptimizationHistory(parseInt(limit));
    const stats = await ProcessLog.getOptimizationStats();

    res.json({
      history,
      statistics: stats
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve optimization history',
      message: error.message
    });
  }
});

module.exports = router;
