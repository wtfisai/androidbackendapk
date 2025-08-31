const express = require('express');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const execAsync = promisify(exec);

// System information endpoint
router.get(
  '/system',
  authenticate,
  asyncHandler(async (req, res) => {
    // Get CPU count - os.cpus() returns empty array on Android/Termux
    let cpuCount = os.cpus().length;
    if (cpuCount === 0) {
      // Fallback for Android/Termux
      try {
        const { stdout } = await execAsync(
          'nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo "8"'
        );
        cpuCount = parseInt(stdout.trim()) || 8;
      } catch {
        cpuCount = 8; // Default fallback
      }
    }

    const systemInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      cpus: cpuCount,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      networkInterfaces: os.networkInterfaces()
    };

    res.json(systemInfo);
  })
);

// Process list endpoint
router.get(
  '/processes',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const { stdout } = await execAsync('ps aux 2>/dev/null || ps -A 2>/dev/null');
      const lines = stdout.split('\n').slice(1);

      const processes = lines
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 4) {
            return null;
          }

          // Try to detect format (standard ps aux or Android ps)
          if (parts[2] && parts[2].includes('%')) {
            // Standard ps aux format
            return {
              user: parts[0],
              pid: parts[1],
              cpu: parts[2],
              mem: parts[3],
              command: parts.slice(10).join(' ')
            };
          } else {
            // Android ps format
            return {
              user: parts[0],
              pid: parts[1],
              ppid: parts[2],
              name: parts[parts.length - 1]
            };
          }
        })
        .filter(Boolean);

      res.json({
        processes: processes.slice(0, 200), // Limit to 200 processes
        count: processes.length
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get process list',
        message: error.message
      });
    }
  })
);

// Storage information endpoint
router.get(
  '/storage',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const { stdout } = await execAsync('df -h');
      const lines = stdout.split('\n').slice(1);

      const storage = lines
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 6) {
            return {
              filesystem: parts[0],
              size: parts[1],
              used: parts[2],
              available: parts[3],
              usePercent: parts[4],
              mounted: parts[5]
            };
          }
          return null;
        })
        .filter(Boolean);

      res.json({ storage });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get storage information',
        message: error.message
      });
    }
  })
);

module.exports = router;
