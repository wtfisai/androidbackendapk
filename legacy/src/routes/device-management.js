const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { authenticateApiKey } = require('../middleware/auth');
const { Activity } = require('../models/Activity');
const execAsync = promisify(exec);

// POST /api/device/install
router.post('/install', authenticateApiKey, async (req, res) => {
  try {
    const {
      apkPath,
      reinstall = false,
      grantPermissions = true,
      allowDowngrade = false,
      installLocation = 'auto' // auto, internal, external
    } = req.body;

    if (!apkPath) {
      return res.status(400).json({ error: 'APK path is required' });
    }

    // Check if file exists
    try {
      await fs.access(apkPath);
    } catch {
      return res.status(404).json({ error: 'APK file not found' });
    }

    // Build pm install command
    let command = 'pm install';

    if (reinstall) {
      command += ' -r';
    }
    if (grantPermissions) {
      command += ' -g';
    }
    if (allowDowngrade) {
      command += ' -d';
    }

    switch (installLocation) {
      case 'internal':
        command += ' -f';
        break;
      case 'external':
        command += ' -s';
        break;
    }

    command += ` "${apkPath}"`;

    const { stdout, stderr } = await execAsync(command);

    // Check if installation was successful
    const success = stdout.includes('Success') || stdout.includes('INSTALL_SUCCEEDED');

    await Activity.log({
      type: 'device_management',
      action: 'app_install',
      metadata: { apkPath, success, reinstall }
    });

    res.json({
      success,
      message: stdout.trim() || stderr.trim(),
      apkPath,
      options: { reinstall, grantPermissions, allowDowngrade, installLocation }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to install APK',
      message: error.message
    });
  }
});

// DELETE /api/device/uninstall/:packageName
router.delete('/uninstall/:packageName', authenticateApiKey, async (req, res) => {
  try {
    const { packageName } = req.params;
    const { keepData = false } = req.query;

    // Build pm uninstall command
    let command = 'pm uninstall';
    if (keepData === 'true') {
      command += ' -k';
    }
    command += ` ${packageName}`;

    const { stdout, stderr } = await execAsync(command);

    const success = stdout.includes('Success');

    await Activity.log({
      type: 'device_management',
      action: 'app_uninstall',
      metadata: { packageName, success, keepData }
    });

    res.json({
      success,
      message: stdout.trim() || stderr.trim(),
      packageName,
      dataKept: keepData === 'true'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to uninstall app',
      message: error.message
    });
  }
});

// POST /api/device/permissions
router.post('/permissions', authenticateApiKey, async (req, res) => {
  try {
    const { packageName, permission, action = 'grant' } = req.body;

    if (!packageName || !permission) {
      return res.status(400).json({
        error: 'Package name and permission are required'
      });
    }

    const command = `pm ${action} ${packageName} ${permission}`;
    const { stdout, stderr } = await execAsync(command);

    await Activity.log({
      type: 'device_management',
      action: 'permission_change',
      metadata: { packageName, permission, action }
    });

    res.json({
      success: !stderr,
      packageName,
      permission,
      action,
      message: stdout.trim() || stderr.trim() || 'Permission updated'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to manage permission',
      message: error.message
    });
  }
});

// GET /api/device/permissions/:packageName
router.get('/permissions/:packageName', authenticateApiKey, async (req, res) => {
  try {
    const { packageName } = req.params;

    const { stdout } = await execAsync(
      `dumpsys package ${packageName} | grep -A 1000 "runtime permissions:"`
    );

    // Parse permissions
    const permissions = [];
    const lines = stdout.split('\n');

    for (const line of lines) {
      const match = line.match(/^\s*([^:]+):\s*granted=(\w+)/);
      if (match) {
        permissions.push({
          name: match[1].trim(),
          granted: match[2] === 'true'
        });
      }
    }

    res.json({
      packageName,
      permissions,
      count: permissions.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get permissions',
      message: error.message
    });
  }
});

// POST /api/device/force-stop/:packageName
router.post('/force-stop/:packageName', authenticateApiKey, async (req, res) => {
  try {
    const { packageName } = req.params;

    await execAsync(`am force-stop ${packageName}`);

    await Activity.log({
      type: 'device_management',
      action: 'force_stop',
      metadata: { packageName }
    });

    res.json({
      success: true,
      packageName,
      message: `Force stopped ${packageName}`
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to force stop app',
      message: error.message
    });
  }
});

// POST /api/device/clear-data/:packageName
router.post('/clear-data/:packageName', authenticateApiKey, async (req, res) => {
  try {
    const { packageName } = req.params;

    const { stdout } = await execAsync(`pm clear ${packageName}`);

    const success = stdout.includes('Success');

    await Activity.log({
      type: 'device_management',
      action: 'clear_data',
      metadata: { packageName, success }
    });

    res.json({
      success,
      packageName,
      message: stdout.trim() || 'App data cleared'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear app data',
      message: error.message
    });
  }
});

// POST /api/device/enable-disable
router.post('/enable-disable', authenticateApiKey, async (req, res) => {
  try {
    const { packageName, component, action = 'enable' } = req.body;

    if (!packageName) {
      return res.status(400).json({ error: 'Package name is required' });
    }

    let command = `pm ${action}`;
    if (component) {
      command += ` ${packageName}/${component}`;
    } else {
      command += ` ${packageName}`;
    }

    const { stdout, stderr } = await execAsync(command);

    await Activity.log({
      type: 'device_management',
      action: `app_${action}`,
      metadata: { packageName, component }
    });

    res.json({
      success: !stderr,
      packageName,
      component,
      action,
      message: stdout.trim() || stderr.trim() || `Component ${action}d`
    });
  } catch (error) {
    res.status(500).json({
      error: `Failed to ${req.body.action} component`,
      message: error.message
    });
  }
});

// GET /api/device/developer-options
router.get('/developer-options', authenticateApiKey, async (req, res) => {
  try {
    const options = {};

    // Check various developer options
    const settingsToCheck = [
      { key: 'development_settings_enabled', namespace: 'global', name: 'Developer Options' },
      { key: 'adb_enabled', namespace: 'global', name: 'USB Debugging' },
      { key: 'adb_wifi_enabled', namespace: 'global', name: 'Wireless Debugging' },
      { key: 'stay_on_while_plugged_in', namespace: 'global', name: 'Stay Awake' },
      { key: 'mock_location', namespace: 'secure', name: 'Mock Location' },
      { key: 'debug_app', namespace: 'global', name: 'Debug App' },
      { key: 'wait_for_debugger', namespace: 'global', name: 'Wait for Debugger' },
      { key: 'verifier_verify_adb_installs', namespace: 'global', name: 'Verify ADB Installs' },
      { key: 'overlay_display_devices', namespace: 'global', name: 'Simulate Display' },
      { key: 'debug_layout', namespace: 'global', name: 'Show Layout Bounds' },
      { key: 'force_rtl_layout_all_locales', namespace: 'global', name: 'Force RTL' },
      { key: 'animator_duration_scale', namespace: 'global', name: 'Animator Duration Scale' },
      {
        key: 'transition_animation_scale',
        namespace: 'global',
        name: 'Transition Animation Scale'
      },
      { key: 'window_animation_scale', namespace: 'global', name: 'Window Animation Scale' },
      { key: 'debug_hw_overdraw', namespace: 'global', name: 'Show GPU Overdraw' },
      { key: 'show_touches', namespace: 'system', name: 'Show Touches' },
      { key: 'pointer_location', namespace: 'system', name: 'Pointer Location' }
    ];

    for (const setting of settingsToCheck) {
      try {
        const { stdout } = await execAsync(`settings get ${setting.namespace} ${setting.key}`);
        const value = stdout.trim();
        options[setting.key] = {
          name: setting.name,
          namespace: setting.namespace,
          value: value === 'null' ? null : value,
          enabled: value === '1' || value === 'true'
        };
      } catch {
        options[setting.key] = {
          name: setting.name,
          namespace: setting.namespace,
          value: null,
          enabled: false
        };
      }
    }

    res.json({
      options,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get developer options',
      message: error.message
    });
  }
});

// POST /api/device/developer-options
router.post('/developer-options', authenticateApiKey, async (req, res) => {
  try {
    const { option, value, namespace = 'global' } = req.body;

    if (!option) {
      return res.status(400).json({ error: 'Option name is required' });
    }

    await execAsync(`settings put ${namespace} ${option} ${value}`);

    // Verify the change
    const { stdout } = await execAsync(`settings get ${namespace} ${option}`);
    const newValue = stdout.trim();

    await Activity.log({
      type: 'device_management',
      action: 'developer_option_change',
      metadata: { option, value, namespace }
    });

    res.json({
      success: true,
      option,
      namespace,
      previousValue: req.body.previousValue,
      newValue,
      applied: newValue === String(value)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to set developer option',
      message: error.message
    });
  }
});

// POST /api/device/port-forward
router.post('/port-forward', authenticateApiKey, async (req, res) => {
  try {
    const { localPort, remotePort, protocol = 'tcp' } = req.body;

    if (!localPort || !remotePort) {
      return res.status(400).json({
        error: 'Local and remote ports are required'
      });
    }

    // Check if ADB is available
    let adbAvailable = false;
    try {
      await execAsync('which adb');
      adbAvailable = true;
    } catch {
      return res.status(400).json({
        error: 'ADB not available',
        message: 'Port forwarding requires ADB'
      });
    }

    const command = `adb forward ${protocol}:${localPort} ${protocol}:${remotePort}`;
    await execAsync(command);

    await Activity.log({
      type: 'device_management',
      action: 'port_forward',
      metadata: { localPort, remotePort, protocol }
    });

    res.json({
      success: true,
      localPort,
      remotePort,
      protocol,
      message: `Forwarded ${protocol}:${localPort} -> ${protocol}:${remotePort}`
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to forward port',
      message: error.message
    });
  }
});

// DELETE /api/device/port-forward
router.delete('/port-forward', authenticateApiKey, async (req, res) => {
  try {
    const { localPort, protocol = 'tcp' } = req.query;

    // Check if ADB is available
    try {
      await execAsync('which adb');
    } catch {
      return res.status(400).json({
        error: 'ADB not available',
        message: 'Port forwarding requires ADB'
      });
    }

    let command = 'adb forward --remove';
    if (localPort) {
      command += ` ${protocol}:${localPort}`;
    } else {
      command += '-all';
    }

    await execAsync(command);

    await Activity.log({
      type: 'device_management',
      action: 'port_forward_remove',
      metadata: { localPort, protocol }
    });

    res.json({
      success: true,
      message: localPort
        ? `Removed forward for ${protocol}:${localPort}`
        : 'Removed all port forwards'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to remove port forward',
      message: error.message
    });
  }
});

// GET /api/device/port-forward
router.get('/port-forward', authenticateApiKey, async (req, res) => {
  try {
    // Check if ADB is available
    try {
      await execAsync('which adb');
    } catch {
      return res.json({
        forwards: [],
        adbAvailable: false,
        message: 'ADB not available'
      });
    }

    const { stdout } = await execAsync('adb forward --list');

    const forwards = stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          return {
            device: parts[0],
            local: parts[1],
            remote: parts[2]
          };
        }
        return null;
      })
      .filter(Boolean);

    res.json({
      forwards,
      count: forwards.length,
      adbAvailable: true
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list port forwards',
      message: error.message
    });
  }
});

// POST /api/device/backup
router.post('/backup', authenticateApiKey, async (req, res) => {
  try {
    const {
      packageName,
      includeApk = true,
      includeSystemApps = false,
      includeShared = false,
      outputPath
    } = req.body;

    const backupPath = outputPath || `/sdcard/backup_${Date.now()}.ab`;

    // Build backup command
    let command = 'bu backup';

    if (includeApk) {
      command += ' -apk';
    } else {
      command += ' -noapk';
    }

    if (includeSystemApps) {
      command += ' -system';
    } else {
      command += ' -nosystem';
    }

    if (includeShared) {
      command += ' -shared';
    } else {
      command += ' -noshared';
    }

    if (packageName) {
      command += ` ${packageName}`;
    } else {
      command += ' -all';
    }

    command += ` -f ${backupPath}`;

    // Start backup (this will prompt user on device)
    exec(command, (error) => {
      if (error) {
        console.error('Backup error:', error);
      }
    });

    await Activity.log({
      type: 'device_management',
      action: 'backup_start',
      metadata: { packageName, backupPath, includeApk, includeSystemApps }
    });

    res.json({
      success: true,
      message: 'Backup initiated. Please confirm on device.',
      backupPath,
      packageName: packageName || 'all',
      options: { includeApk, includeSystemApps, includeShared }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to initiate backup',
      message: error.message
    });
  }
});

// POST /api/device/restore
router.post('/restore', authenticateApiKey, async (req, res) => {
  try {
    const { backupPath } = req.body;

    if (!backupPath) {
      return res.status(400).json({ error: 'Backup path is required' });
    }

    // Check if backup file exists
    try {
      await fs.access(backupPath);
    } catch {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    // Start restore (this will prompt user on device)
    const command = `bu restore ${backupPath}`;

    exec(command, (error) => {
      if (error) {
        console.error('Restore error:', error);
      }
    });

    await Activity.log({
      type: 'device_management',
      action: 'restore_start',
      metadata: { backupPath }
    });

    res.json({
      success: true,
      message: 'Restore initiated. Please confirm on device.',
      backupPath
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to initiate restore',
      message: error.message
    });
  }
});

module.exports = router;
