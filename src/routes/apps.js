const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Helper function to parse package list output
function parsePackageList(output, showSystem = false) {
  const lines = output.trim().split('\n');
  const packages = [];

  for (const line of lines) {
    if (!line || line.startsWith('WARNING')) {
      continue;
    }

    // Format: package:com.example.app
    const match = line.match(/^package:(.+)$/);
    if (match) {
      const packageName = match[1];

      // Filter system apps if needed
      if (!showSystem) {
        // Skip system apps (basic heuristic)
        if (
          packageName.startsWith('com.android.') ||
          packageName.startsWith('android.') ||
          (packageName.startsWith('com.google.android.') &&
            !packageName.includes('gms') &&
            !packageName.includes('play'))
        ) {
          continue;
        }
      }

      packages.push(packageName);
    }
  }

  return packages;
}

// Helper to get detailed app info
async function getAppDetails(packageName) {
  try {
    const info = {};

    // Get package info
    const { stdout: packageInfo } = await execAsync(`dumpsys package ${packageName} | head -100`);

    // Extract version
    const versionMatch = packageInfo.match(/versionName=([\S]+)/);
    info.version = versionMatch ? versionMatch[1] : 'Unknown';

    // Extract install time
    const installMatch = packageInfo.match(/firstInstallTime=(.*)/);
    info.installTime = installMatch ? installMatch[1] : null;

    // Extract last update time
    const updateMatch = packageInfo.match(/lastUpdateTime=(.*)/);
    info.lastUpdateTime = updateMatch ? updateMatch[1] : null;

    // Get app size using du on data directory
    try {
      const { stdout: sizeOutput } = await execAsync(
        `du -sk /data/data/${packageName} 2>/dev/null || echo "0"`
      );
      const sizeKB = parseInt(sizeOutput.split('\t')[0]) || 0;
      info.dataSize = sizeKB * 1024; // Convert to bytes
    } catch {
      info.dataSize = 0;
    }

    // Get cache size
    try {
      const { stdout: cacheOutput } = await execAsync(
        `du -sk /data/data/${packageName}/cache 2>/dev/null || echo "0"`
      );
      const cacheKB = parseInt(cacheOutput.split('\t')[0]) || 0;
      info.cacheSize = cacheKB * 1024; // Convert to bytes
    } catch {
      info.cacheSize = 0;
    }

    // Get memory usage from dumpsys meminfo
    try {
      const { stdout: memOutput } = await execAsync(
        `dumpsys meminfo ${packageName} | grep "TOTAL" | head -1`
      );
      const memMatch = memOutput.match(/TOTAL\s+(\d+)/);
      info.memoryUsage = memMatch ? parseInt(memMatch[1]) * 1024 : 0; // Convert KB to bytes
    } catch {
      info.memoryUsage = 0;
    }

    // Check if app is running
    try {
      const { stdout: psOutput } = await execAsync(`pgrep -f ${packageName}`);
      info.isRunning = psOutput.trim().length > 0;
    } catch {
      info.isRunning = false;
    }

    // Get battery usage (if available)
    try {
      const { stdout: batteryOutput } = await execAsync(
        `dumpsys batterystats --charged ${packageName} | grep "Uid" | head -5`
      );
      info.batteryInfo = batteryOutput.trim();
    } catch {
      info.batteryInfo = null;
    }

    return info;
  } catch (error) {
    console.error(`Error getting details for ${packageName}:`, error);
    return null;
  }
}

// List all installed applications
router.get('/list', async (req, res) => {
  try {
    const {
      filter = 'all', // all, user, system
      sort = 'name', // name, size, memory, cache, installed
      order = 'asc', // asc, desc
      timeRange = 'all' // 1d, 1w, 1m, 1y, all
    } = req.query;

    // Get package list based on filter
    let command = 'pm list packages';
    if (filter === 'user') {
      command += ' -3'; // Third-party apps only
    } else if (filter === 'system') {
      command += ' -s'; // System apps only
    }

    const { stdout } = await execAsync(command);
    const packageNames = parsePackageList(stdout, filter === 'system');

    // Get detailed info for each package
    const apps = [];
    for (const packageName of packageNames) {
      const details = await getAppDetails(packageName);

      if (details) {
        apps.push({
          packageName,
          name: packageName.split('.').pop(), // Simple name extraction
          ...details
        });
      }
    }

    // Sort apps based on criteria
    apps.sort((a, b) => {
      let comparison = 0;

      switch (sort) {
        case 'name':
          comparison = a.packageName.localeCompare(b.packageName);
          break;
        case 'size':
          comparison = (a.dataSize || 0) - (b.dataSize || 0);
          break;
        case 'memory':
          comparison = (a.memoryUsage || 0) - (b.memoryUsage || 0);
          break;
        case 'cache':
          comparison = (a.cacheSize || 0) - (b.cacheSize || 0);
          break;
        case 'installed':
          comparison = new Date(a.installTime || 0) - new Date(b.installTime || 0);
          break;
      }

      return order === 'desc' ? -comparison : comparison;
    });

    res.json({
      apps,
      count: apps.length,
      filter,
      sort,
      order,
      timeRange
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list applications',
      message: error.message
    });
  }
});

// Get detailed info for a specific app
router.get('/info/:packageName', async (req, res) => {
  try {
    const { packageName } = req.params;

    // Get basic package info
    const { stdout: dumpOutput } = await execAsync(`dumpsys package ${packageName}`);

    if (!dumpOutput.includes(packageName)) {
      return res.status(404).json({ error: 'Package not found' });
    }

    const details = await getAppDetails(packageName);

    // Get permissions
    const { stdout: permOutput } = await execAsync(
      `dumpsys package ${packageName} | grep permission`
    );
    const permissions = permOutput
      .split('\n')
      .filter((line) => line.includes('android.permission'))
      .map((line) => line.trim());

    // Get activities
    const { stdout: activityOutput } = await execAsync(
      `dumpsys package ${packageName} | grep -A 5 "Activity Resolver"`
    );

    res.json({
      packageName,
      ...details,
      permissions,
      activities: activityOutput.trim()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get app info',
      message: error.message
    });
  }
});

// Uninstall apps
router.post('/uninstall', async (req, res) => {
  try {
    const { packages } = req.body;

    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({ error: 'No packages specified' });
    }

    const results = [];

    for (const packageName of packages) {
      try {
        // Check if it's a system app
        const { stdout: checkOutput } = await execAsync(
          `pm list packages -s | grep ${packageName}`
        );
        const isSystemApp = checkOutput.includes(packageName);

        if (isSystemApp) {
          results.push({
            packageName,
            success: false,
            error: 'Cannot uninstall system app'
          });
          continue;
        }

        // Uninstall the app
        const { stdout } = await execAsync(`pm uninstall ${packageName}`);

        results.push({
          packageName,
          success: stdout.includes('Success'),
          output: stdout.trim()
        });
      } catch (error) {
        results.push({
          packageName,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      results,
      totalRequested: packages.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to uninstall apps',
      message: error.message
    });
  }
});

// Force stop / sleep apps
router.post('/sleep', async (req, res) => {
  try {
    const { packages } = req.body;

    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({ error: 'No packages specified' });
    }

    const results = [];

    for (const packageName of packages) {
      try {
        // Force stop the app
        const { stdout } = await execAsync(`am force-stop ${packageName}`);

        results.push({
          packageName,
          success: true,
          message: 'App force stopped'
        });
      } catch (error) {
        results.push({
          packageName,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      results,
      totalRequested: packages.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to sleep apps',
      message: error.message
    });
  }
});

// Clear app cache
router.post('/clear-cache', async (req, res) => {
  try {
    const { packages } = req.body;

    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({ error: 'No packages specified' });
    }

    const results = [];

    for (const packageName of packages) {
      try {
        // Clear app cache
        const { stdout } = await execAsync(`pm clear ${packageName}`);

        results.push({
          packageName,
          success: stdout.includes('Success'),
          output: stdout.trim()
        });
      } catch (error) {
        results.push({
          packageName,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      results,
      totalRequested: packages.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

// Get app statistics
router.get('/stats/:packageName', async (req, res) => {
  try {
    const { packageName } = req.params;
    const { timeRange = '1d' } = req.query; // 1d, 1w, 1m, 1y

    // Get usage stats
    const { stdout: usageOutput } = await execAsync(`dumpsys usagestats ${packageName} | head -50`);

    // Get battery stats
    const { stdout: batteryOutput } = await execAsync(
      `dumpsys batterystats --charged ${packageName} | head -50`
    );

    // Get network stats
    const { stdout: networkOutput } = await execAsync(
      `dumpsys netstats detail | grep ${packageName} | head -10`
    );

    // Parse and structure the data
    const stats = {
      packageName,
      timeRange,
      usage: usageOutput.trim(),
      battery: batteryOutput.trim(),
      network: networkOutput.trim(),
      timestamp: new Date().toISOString()
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get app statistics',
      message: error.message
    });
  }
});

// Launch app
router.post('/launch/:packageName', async (req, res) => {
  try {
    const { packageName } = req.params;

    // Get the main activity
    const { stdout: activityOutput } = await execAsync(
      `cmd package resolve-activity --brief ${packageName} | tail -1`
    );

    if (!activityOutput) {
      return res.status(404).json({ error: 'No launchable activity found' });
    }

    // Launch the app
    const { stdout: launchOutput } = await execAsync(`am start -n ${activityOutput.trim()}`);

    res.json({
      packageName,
      activity: activityOutput.trim(),
      launched: launchOutput.includes('Starting'),
      output: launchOutput.trim()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to launch app',
      message: error.message
    });
  }
});

module.exports = router;
