const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const { authenticateApiKey } = require('../middleware/auth');
const { Activity } = require('../models/Activity');
const { PermissionStatus } = require('../models/PermissionStatus');

const router = express.Router();
const execAsync = promisify(exec);

// Permissions that can be granted
const SPECIAL_PERMISSIONS = {
  DUMP: {
    name: 'android.permission.DUMP',
    description: 'Allows dumping system state for debugging',
    benefits: [
      'Access detailed activity information',
      'View complete system service states',
      'Get comprehensive debug reports',
      'Monitor app memory usage in detail'
    ],
    command: 'pm grant com.termux android.permission.DUMP'
  },
  WRITE_SECURE_SETTINGS: {
    name: 'android.permission.WRITE_SECURE_SETTINGS',
    description: 'Allows modifying secure system settings',
    benefits: [
      'Change system UI settings',
      'Modify developer options',
      'Control accessibility settings',
      'Adjust display and input settings'
    ],
    command: 'pm grant com.termux android.permission.WRITE_SECURE_SETTINGS'
  },
  PACKAGE_USAGE_STATS: {
    name: 'android.permission.PACKAGE_USAGE_STATS',
    description: 'Allows accessing app usage statistics',
    benefits: [
      'View app usage time and frequency',
      'Monitor app launch counts',
      'Track screen time per app',
      'Analyze app usage patterns'
    ],
    command: 'pm grant com.termux android.permission.PACKAGE_USAGE_STATS'
  },
  READ_LOGS: {
    name: 'android.permission.READ_LOGS',
    description: 'Allows reading system log files',
    benefits: [
      'Access complete logcat output',
      'View all app debug messages',
      'Monitor system events',
      'Debug app crashes and errors'
    ],
    command: 'pm grant com.termux android.permission.READ_LOGS'
  },
  SYSTEM_ALERT_WINDOW: {
    name: 'android.permission.SYSTEM_ALERT_WINDOW',
    description: 'Allows creating overlay windows',
    benefits: [
      'Display floating controls',
      'Show system-wide notifications',
      'Create accessibility overlays',
      'Implement screen recording indicators'
    ],
    command: 'pm grant com.termux android.permission.SYSTEM_ALERT_WINDOW'
  }
};

// Check current permissions status
router.get('/status', authenticateApiKey, async (req, res) => {
  try {
    const permissions = {};
    
    // Get permission status from database and system
    const dbStatuses = await PermissionStatus.getAllStatuses();
    
    // Check system permissions
    let systemPermissions = {};
    try {
      const { stdout } = await execAsync('dumpsys package com.termux | grep -A 500 "granted=true"');
      systemPermissions = stdout;
    } catch (e) {
      // Fallback if dumpsys fails
      systemPermissions = '';
    }
    
    for (const [key, perm] of Object.entries(SPECIAL_PERMISSIONS)) {
      const dbStatus = dbStatuses[perm.name];
      const systemGranted = systemPermissions.includes(perm.name);
      
      permissions[key] = {
        ...perm,
        granted: systemGranted || (dbStatus && dbStatus.granted),
        userConfirmed: dbStatus ? dbStatus.userConfirmed : false,
        available: true,
        method: dbStatus ? dbStatus.method : null,
        timestamp: dbStatus ? dbStatus.timestamp : null
      };
    }
    
    // Check if we have root or ADB access
    let accessLevel = 'normal';
    try {
      const { stdout: rootCheck } = await execAsync('su -c "id" 2>&1 || echo "not_root"');
      if (rootCheck.includes('uid=0')) {
        accessLevel = 'root';
      }
    } catch (e) {
      // Not root
    }
    
    // Check if we can use pm grant (requires root or ADB)
    let canGrant = false;
    try {
      await execAsync('pm grant --help 2>&1');
      canGrant = true;
    } catch (e) {
      canGrant = false;
    }
    
    await Activity.log({
      type: 'permissions',
      action: 'check_status',
      metadata: { accessLevel, canGrant }
    });
    
    res.json({
      permissions,
      accessLevel,
      canGrantPermissions: canGrant || accessLevel === 'root',
      message: canGrant ? 'Can grant permissions' : 'Requires root or ADB shell access',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Grant special permission
router.post('/grant', authenticateApiKey, async (req, res) => {
  try {
    const { permissionKey, confirmed } = req.body;
    
    if (!confirmed) {
      return res.status(400).json({ 
        error: 'User confirmation required',
        warning: 'Granting special permissions can affect system security. Please confirm your action.'
      });
    }
    
    const permission = SPECIAL_PERMISSIONS[permissionKey];
    if (!permission) {
      return res.status(400).json({ error: 'Invalid permission key' });
    }
    
    // Try different methods to grant permission
    let granted = false;
    let method = 'none';
    let output = '';
    
    // Method 1: Direct pm grant
    try {
      const { stdout, stderr } = await execAsync(permission.command);
      output = stdout || stderr;
      if (!stderr || !stderr.includes('Exception')) {
        granted = true;
        method = 'pm_grant';
      }
    } catch (e) {
      // Try next method
    }
    
    // Method 2: Try with su if available
    if (!granted) {
      try {
        const { stdout, stderr } = await execAsync(`su -c "${permission.command}"`);
        output = stdout || stderr;
        if (!stderr || !stderr.includes('Exception')) {
          granted = true;
          method = 'root';
        }
      } catch (e) {
        // Try next method
      }
    }
    
    // Method 3: Try appops for some permissions
    if (!granted && permissionKey === 'PACKAGE_USAGE_STATS') {
      try {
        const { stdout } = await execAsync('cmd appops set com.termux GET_USAGE_STATS allow');
        granted = true;
        method = 'appops';
        output = stdout;
      } catch (e) {
        // Failed
      }
    }
    
    await Activity.log({
      type: 'permissions',
      action: 'grant_permission',
      metadata: { 
        permission: permission.name,
        granted,
        method
      }
    });
    
    if (granted) {
      // Save to database
      await PermissionStatus.grant(permission.name, method, { 
        output,
        userConfirmed: true 
      });
      
      res.json({
        success: true,
        permission: permission.name,
        method,
        message: `Successfully granted ${permission.name}`,
        output,
        timestamp: new Date()
      });
    } else {
      res.status(500).json({
        success: false,
        permission: permission.name,
        error: 'Failed to grant permission',
        message: 'This operation requires root access or ADB debugging enabled',
        suggestion: 'Enable ADB debugging and run: adb shell ' + permission.command,
        output
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke special permission
router.post('/revoke', authenticateApiKey, async (req, res) => {
  try {
    const { permissionKey, confirmed } = req.body;
    
    if (!confirmed) {
      return res.status(400).json({ 
        error: 'User confirmation required',
        warning: 'Revoking permissions may disable some features. Please confirm your action.'
      });
    }
    
    const permission = SPECIAL_PERMISSIONS[permissionKey];
    if (!permission) {
      return res.status(400).json({ error: 'Invalid permission key' });
    }
    
    const revokeCommand = permission.command.replace('grant', 'revoke');
    
    let revoked = false;
    let method = 'none';
    
    // Try to revoke
    try {
      await execAsync(revokeCommand);
      revoked = true;
      method = 'pm_revoke';
    } catch (e) {
      try {
        await execAsync(`su -c "${revokeCommand}"`);
        revoked = true;
        method = 'root';
      } catch (e2) {
        // Failed
      }
    }
    
    await Activity.log({
      type: 'permissions',
      action: 'revoke_permission',
      metadata: { 
        permission: permission.name,
        revoked,
        method
      }
    });
    
    res.json({
      success: revoked,
      permission: permission.name,
      method,
      message: revoked ? `Revoked ${permission.name}` : 'Failed to revoke permission',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enable ADB over network (requires root)
router.post('/enable-adb-network', authenticateApiKey, async (req, res) => {
  try {
    const { port = 5555, confirmed } = req.body;
    
    if (!confirmed) {
      return res.status(400).json({
        error: 'User confirmation required',
        warning: 'Enabling ADB over network can be a security risk. Only enable on trusted networks.',
        requirements: 'This operation requires root access'
      });
    }
    
    // Check for root
    const { stdout: rootCheck } = await execAsync('su -c "id" 2>&1 || echo "not_root"');
    if (!rootCheck.includes('uid=0')) {
      return res.status(403).json({
        error: 'Root access required',
        message: 'This operation requires a rooted device'
      });
    }
    
    // Enable ADB over network
    await execAsync(`su -c "setprop service.adb.tcp.port ${port}"`);
    await execAsync('su -c "stop adbd"');
    await execAsync('su -c "start adbd"');
    
    // Get device IP
    const { stdout: ifconfig } = await execAsync('ifconfig wlan0 2>/dev/null || ip addr show wlan0');
    const ipMatch = ifconfig.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
    const deviceIp = ipMatch ? ipMatch[1] : 'unknown';
    
    await Activity.log({
      type: 'permissions',
      action: 'enable_adb_network',
      metadata: { port, deviceIp }
    });
    
    res.json({
      success: true,
      message: 'ADB over network enabled',
      port,
      deviceIp,
      connectCommand: `adb connect ${deviceIp}:${port}`,
      disableCommand: 'To disable, restart the device or run: setprop service.adb.tcp.port -1',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get permission requirements and instructions
router.get('/instructions', authenticateApiKey, async (req, res) => {
  res.json({
    overview: 'Special permissions enable advanced debugging and control features',
    warning: 'Granting these permissions can affect system security and privacy',
    methods: {
      adb: {
        description: 'Using ADB from a computer',
        requirements: [
          'USB debugging enabled in Developer Options',
          'Computer with ADB installed',
          'USB cable connection'
        ],
        steps: [
          '1. Enable Developer Options: Settings > About > Tap Build Number 7 times',
          '2. Enable USB Debugging: Settings > Developer Options > USB Debugging',
          '3. Connect device to computer via USB',
          '4. On computer, run: adb devices (accept prompt on phone)',
          '5. Grant permissions: adb shell pm grant com.termux [permission_name]'
        ]
      },
      root: {
        description: 'Using root access (if available)',
        requirements: [
          'Rooted Android device',
          'Root management app (Magisk, SuperSU, etc.)'
        ],
        steps: [
          '1. Ensure device is rooted',
          '2. Grant root access to Termux when prompted',
          '3. Use the permissions panel to grant permissions'
        ]
      },
      shizuku: {
        description: 'Using Shizuku (non-root alternative)',
        requirements: [
          'Shizuku app installed',
          'Shizuku service running'
        ],
        steps: [
          '1. Install Shizuku from Play Store',
          '2. Start Shizuku service via ADB or root',
          '3. Grant Termux access to Shizuku',
          '4. Permissions can then be granted through Shizuku'
        ]
      }
    },
    permissions: SPECIAL_PERMISSIONS,
    securityNote: 'Only grant permissions you understand and need. Revoke when no longer needed.',
    timestamp: new Date()
  });
});

module.exports = router;