const router = require('express').Router();
const { authenticateApiKey } = require('../middleware/auth');
const { Activity, DebugTrace, ProcessLog } = require('../models/Activity');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// GET /api/dashboard/overview
router.get('/overview', authenticateApiKey, async (req, res) => {
  try {
    // Get system status
    const systemStatus = {};

    // CPU usage
    try {
      const { stdout: cpuInfo } = await execAsync('top -bn1 | grep "Cpu(s)" | head -1');
      const cpuMatch = cpuInfo.match(/(\d+\.?\d*)\s*%?us/);
      systemStatus.cpuUsage = cpuMatch ? parseFloat(cpuMatch[1]) : 0;
    } catch (e) {
      systemStatus.cpuUsage = 0;
    }

    // Memory usage
    try {
      const { stdout: memInfo } = await execAsync('free -m');
      const lines = memInfo.split('\n');
      const memLine = lines.find((l) => l.startsWith('Mem:'));
      if (memLine) {
        const parts = memLine.split(/\s+/);
        systemStatus.memoryTotal = parseInt(parts[1]);
        systemStatus.memoryUsed = parseInt(parts[2]);
        systemStatus.memoryFree = parseInt(parts[3]);
        systemStatus.memoryUsagePercent =
          (systemStatus.memoryUsed / systemStatus.memoryTotal) * 100;
      }
    } catch (e) {
      systemStatus.memoryUsagePercent = 0;
    }

    // Disk usage
    try {
      const { stdout: diskInfo } = await execAsync('df -h /data');
      const lines = diskInfo.split('\n');
      if (lines[1]) {
        const parts = lines[1].split(/\s+/);
        systemStatus.diskTotal = parts[1];
        systemStatus.diskUsed = parts[2];
        systemStatus.diskAvailable = parts[3];
        systemStatus.diskUsagePercent = parseInt(parts[4]);
      }
    } catch (e) {
      systemStatus.diskUsagePercent = 0;
    }

    // Network status
    try {
      const { stdout: netInfo } = await execAsync('ip addr show | grep "state UP"');
      systemStatus.networkInterfaces = netInfo.split('\n').filter((l) => l.trim()).length;
    } catch (e) {
      systemStatus.networkInterfaces = 0;
    }

    // Get activity statistics
    const activityStats = await Activity.getStatistics('24h');

    // Get active debug sessions
    const activeSessions = await DebugTrace.getActiveSessions();

    // Get recent optimizations
    const recentOptimizations = await ProcessLog.getOptimizationHistory(10);
    const optimizationStats = await ProcessLog.getOptimizationStats();

    // Get uptime
    let uptime = '0h 0m';
    try {
      const { stdout } = await execAsync('uptime -p');
      uptime = stdout.trim().replace('up ', '');
    } catch (e) {
      // Fallback to seconds
      try {
        const { stdout } = await execAsync('cat /proc/uptime');
        const seconds = parseFloat(stdout.split(' ')[0]);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        uptime = `${hours}h ${minutes}m`;
      } catch (e2) {
        uptime = 'Unknown';
      }
    }

    res.json({
      timestamp: new Date(),
      system: {
        ...systemStatus,
        uptime
      },
      activity: {
        last24Hours: activityStats.totalActivities,
        byType: activityStats.byType,
        errorRate:
          activityStats.totalActivities > 0
            ? ((activityStats.errorCount / activityStats.totalActivities) * 100).toFixed(2) + '%'
            : '0%',
        avgResponseTime: activityStats.avgDuration.toFixed(2) + 'ms',
        topActions: activityStats.topActions.slice(0, 5)
      },
      debugging: {
        activeSessions: activeSessions.length,
        totalSessions: await DebugTrace.getAllSessions(1000).then((s) => s.length)
      },
      optimization: {
        recentActions: recentOptimizations.length,
        successRate: optimizationStats.successRate.toFixed(2) + '%',
        avgMemorySaved: (optimizationStats.averageMemorySaved / 1024).toFixed(2) + 'MB',
        avgCpuReduced: optimizationStats.averageCpuReduced.toFixed(2) + '%'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get dashboard overview',
      message: error.message
    });
  }
});

// GET /api/dashboard/activities
router.get('/activities', authenticateApiKey, async (req, res) => {
  try {
    const { type, limit = 100, offset = 0, startDate, endDate } = req.query;

    const filter = {};

    if (type) {
      filter.type = type;
    }

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        filter.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.timestamp.$lte = new Date(endDate);
      }
    }

    const activities = await Activity.getActivities(filter, parseInt(limit));

    // Group by time periods for chart data
    const hourlyData = {};
    const now = new Date();

    // Initialize last 24 hours
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now - i * 60 * 60 * 1000);
      const key = hour.toISOString().substring(0, 13);
      hourlyData[key] = {
        hour: key,
        count: 0,
        errors: 0,
        avgDuration: 0,
        durations: []
      };
    }

    // Populate with actual data
    activities.forEach((activity) => {
      const hour = activity.timestamp.toISOString().substring(0, 13);
      if (hourlyData[hour]) {
        hourlyData[hour].count++;
        if (activity.error) {
          hourlyData[hour].errors++;
        }
        if (activity.duration) {
          hourlyData[hour].durations.push(activity.duration);
        }
      }
    });

    // Calculate averages
    Object.values(hourlyData).forEach((hour) => {
      if (hour.durations.length > 0) {
        hour.avgDuration = hour.durations.reduce((a, b) => a + b, 0) / hour.durations.length;
      }
      delete hour.durations;
    });

    res.json({
      activities,
      count: activities.length,
      chartData: Object.values(hourlyData),
      filters: { type, startDate, endDate }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get activities',
      message: error.message
    });
  }
});

// GET /api/dashboard/processes
router.get('/processes', authenticateApiKey, async (req, res) => {
  try {
    const { sortBy = 'cpu', limit = 50 } = req.query;

    // Get process list with detailed info
    let command = 'ps aux';
    if (sortBy === 'cpu') {
      command += ' --sort=-%cpu';
    } else if (sortBy === 'memory') {
      command += ' --sort=-%mem';
    }
    command += ` | head -${parseInt(limit) + 1}`;

    const { stdout } = await execAsync(command);
    const lines = stdout.trim().split('\n');
    const headers = lines[0].toLowerCase().split(/\s+/);

    const processes = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].trim().split(/\s+/);
      const process = {};

      headers.forEach((header, index) => {
        if (index < values.length - 1) {
          process[header] = values[index];
        }
      });

      // Command is everything after the standard fields
      process.command = values.slice(10).join(' ');

      // Parse numeric values
      process.pid = parseInt(process.pid);
      process.cpu = parseFloat(process['%cpu'] || process.cpu || 0);
      process.memory = parseFloat(process['%mem'] || process.mem || 0);
      process.vsz = parseInt(process.vsz || 0);
      process.rss = parseInt(process.rss || 0);

      // Determine status
      const stat = process.stat || '';
      process.status = stat.includes('S')
        ? 'sleeping'
        : stat.includes('R')
          ? 'running'
          : stat.includes('T')
            ? 'stopped'
            : stat.includes('Z')
              ? 'zombie'
              : 'unknown';

      // Check if process has been optimized recently
      try {
        const history = await ProcessLog.getProcessHistory(process.pid);
        if (history.length > 0) {
          process.lastOptimization = history[0];
        }
      } catch (e) {
        // No optimization history
      }

      // Determine if process can be optimized
      process.canOptimize = process.cpu > 10 || process.memory > 5;
      process.optimizationSuggestion = null;

      if (process.cpu > 50) {
        process.optimizationSuggestion = 'High CPU - recommend suspend';
      } else if (process.memory > 10) {
        process.optimizationSuggestion = 'High memory - recommend restart';
      } else if (process.cpu > 20) {
        process.optimizationSuggestion = 'Moderate CPU - monitor';
      }

      processes.push(process);
    }

    res.json({
      processes,
      count: processes.length,
      sortedBy: sortBy,
      suggestions: processes.filter((p) => p.optimizationSuggestion).length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get process list',
      message: error.message
    });
  }
});

// GET /api/dashboard/debug-sessions
router.get('/debug-sessions', authenticateApiKey, async (req, res) => {
  try {
    const sessions = await DebugTrace.getAllSessions(50);

    // Enhance with statistics
    const enhancedSessions = await Promise.all(
      sessions.map(async (session) => {
        const enhanced = { ...session };

        // Calculate session duration
        if (session.startTime && session.endTime) {
          enhanced.duration = new Date(session.endTime) - new Date(session.startTime);
          enhanced.durationFormatted = formatDuration(enhanced.duration);
        }

        // Count traces by type
        if (session.traces) {
          enhanced.traceStats = session.traces.reduce((acc, trace) => {
            acc[trace.type] = (acc[trace.type] || 0) + 1;
            return acc;
          }, {});
        }

        // Memory usage trend
        if (session.memorySnapshots && session.memorySnapshots.length > 0) {
          const firstMem = parseMemoryValue(session.memorySnapshots[0].data.parsed?.VmRSS);
          const lastMem = parseMemoryValue(
            session.memorySnapshots[session.memorySnapshots.length - 1].data.parsed?.VmRSS
          );
          enhanced.memoryTrend = lastMem - firstMem;
        }

        // CPU usage average
        if (session.cpuSnapshots && session.cpuSnapshots.length > 0) {
          const cpuValues = session.cpuSnapshots.map((s) => s.data.usage).filter((v) => v);
          enhanced.avgCpu = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;
        }

        return enhanced;
      })
    );

    res.json({
      sessions: enhancedSessions,
      count: enhancedSessions.length,
      active: enhancedSessions.filter((s) => s.status === 'active').length,
      completed: enhancedSessions.filter((s) => s.status === 'completed').length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get debug sessions',
      message: error.message
    });
  }
});

// GET /api/dashboard/optimization-stats
router.get('/optimization-stats', authenticateApiKey, async (req, res) => {
  try {
    const stats = await ProcessLog.getOptimizationStats();
    const history = await ProcessLog.getOptimizationHistory(100);

    // Group by time periods
    const hourlyStats = {};
    const now = new Date();

    // Initialize last 24 hours
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now - i * 60 * 60 * 1000);
      const key = hour.toISOString().substring(0, 13);
      hourlyStats[key] = {
        hour: key,
        actions: 0,
        successful: 0,
        failed: 0,
        memorySaved: 0,
        cpuReduced: 0
      };
    }

    // Populate with actual data
    history.forEach((log) => {
      const hour = log.timestamp.toISOString().substring(0, 13);
      if (hourlyStats[hour]) {
        hourlyStats[hour].actions++;
        if (log.status === 'success') {
          hourlyStats[hour].successful++;
          if (log.memoryBefore && log.memoryAfter) {
            hourlyStats[hour].memorySaved += log.memoryBefore - log.memoryAfter;
          }
          if (log.cpuBefore && log.cpuAfter) {
            hourlyStats[hour].cpuReduced += log.cpuBefore - log.cpuAfter;
          }
        } else {
          hourlyStats[hour].failed++;
        }
      }
    });

    res.json({
      summary: stats,
      timeline: Object.values(hourlyStats),
      recentActions: history.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get optimization statistics',
      message: error.message
    });
  }
});

// GET /api/dashboard/alerts
router.get('/alerts', authenticateApiKey, async (req, res) => {
  try {
    const alerts = [];

    // Check CPU usage
    try {
      const { stdout } = await execAsync('top -bn1 | grep "Cpu(s)" | head -1');
      const cpuMatch = stdout.match(/(\d+\.?\d*)\s*%?us/);
      const cpuUsage = cpuMatch ? parseFloat(cpuMatch[1]) : 0;

      if (cpuUsage > 80) {
        alerts.push({
          type: 'critical',
          category: 'cpu',
          message: `High CPU usage: ${cpuUsage.toFixed(1)}%`,
          timestamp: new Date()
        });
      } else if (cpuUsage > 60) {
        alerts.push({
          type: 'warning',
          category: 'cpu',
          message: `Elevated CPU usage: ${cpuUsage.toFixed(1)}%`,
          timestamp: new Date()
        });
      }
    } catch (e) {
      // Skip CPU check
    }

    // Check memory usage
    try {
      const { stdout } = await execAsync('free -m');
      const memLine = stdout.split('\n').find((l) => l.startsWith('Mem:'));
      if (memLine) {
        const parts = memLine.split(/\s+/);
        const total = parseInt(parts[1]);
        const used = parseInt(parts[2]);
        const usagePercent = (used / total) * 100;

        if (usagePercent > 90) {
          alerts.push({
            type: 'critical',
            category: 'memory',
            message: `Critical memory usage: ${usagePercent.toFixed(1)}%`,
            timestamp: new Date()
          });
        } else if (usagePercent > 75) {
          alerts.push({
            type: 'warning',
            category: 'memory',
            message: `High memory usage: ${usagePercent.toFixed(1)}%`,
            timestamp: new Date()
          });
        }
      }
    } catch (e) {
      // Skip memory check
    }

    // Check disk usage
    try {
      const { stdout } = await execAsync('df -h /data');
      const lines = stdout.split('\n');
      if (lines[1]) {
        const parts = lines[1].split(/\s+/);
        const usagePercent = parseInt(parts[4]);

        if (usagePercent > 90) {
          alerts.push({
            type: 'critical',
            category: 'disk',
            message: `Critical disk usage: ${usagePercent}%`,
            timestamp: new Date()
          });
        } else if (usagePercent > 80) {
          alerts.push({
            type: 'warning',
            category: 'disk',
            message: `High disk usage: ${usagePercent}%`,
            timestamp: new Date()
          });
        }
      }
    } catch (e) {
      // Skip disk check
    }

    // Check for zombie processes
    try {
      const { stdout } = await execAsync('ps aux | grep -c " Z "');
      const zombieCount = parseInt(stdout.trim());
      if (zombieCount > 0) {
        alerts.push({
          type: 'warning',
          category: 'process',
          message: `${zombieCount} zombie process(es) detected`,
          timestamp: new Date()
        });
      }
    } catch (e) {
      // No zombies
    }

    // Check recent errors
    const recentActivities = await Activity.getActivities({ error: { $ne: null } }, 10);
    if (recentActivities.length > 5) {
      alerts.push({
        type: 'warning',
        category: 'errors',
        message: `${recentActivities.length} errors in recent activities`,
        timestamp: new Date()
      });
    }

    res.json({
      alerts,
      count: alerts.length,
      critical: alerts.filter((a) => a.type === 'critical').length,
      warning: alerts.filter((a) => a.type === 'warning').length,
      info: alerts.filter((a) => a.type === 'info').length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get alerts',
      message: error.message
    });
  }
});

// Helper functions
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function parseMemoryValue(memStr) {
  if (!memStr) {
    return 0;
  }
  const match = memStr.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

module.exports = router;
