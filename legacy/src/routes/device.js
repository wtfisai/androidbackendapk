const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const execAsync = promisify(exec);

// Device properties endpoint
router.get(
  '/properties',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const { stdout } = await execAsync('getprop 2>/dev/null || echo "NOT_AVAILABLE"');

      if (stdout.includes('NOT_AVAILABLE')) {
        return res.json({
          androidVersion: 'N/A',
          sdkVersion: 'N/A',
          device: 'Termux Environment',
          model: 'Android Device',
          manufacturer: 'Unknown',
          buildId: 'N/A',
          buildDate: new Date().toISOString(),
          properties: {}
        });
      }

      const properties = {};
      stdout.split('\n').forEach((line) => {
        const match = line.match(/\[(.*?)\]: \[(.*?)\]/);
        if (match) {
          properties[match[1]] = match[2];
        }
      });

      res.json({
        androidVersion: properties['ro.build.version.release'] || 'N/A',
        sdkVersion: properties['ro.build.version.sdk'] || 'N/A',
        device: properties['ro.product.device'] || 'N/A',
        model: properties['ro.product.model'] || 'N/A',
        manufacturer: properties['ro.product.manufacturer'] || 'N/A',
        buildId: properties['ro.build.id'] || 'N/A',
        buildDate: properties['ro.build.date'] || 'N/A',
        properties: Object.keys(properties).length > 0 ? properties : {}
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get device properties',
        message: error.message
      });
    }
  })
);

// Battery status endpoint
router.get(
  '/battery',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const { stdout } = await execAsync(
        'dumpsys battery 2>/dev/null || termux-battery-status 2>/dev/null || echo "{}"'
      );

      // Try to parse as JSON first (termux-battery-status)
      try {
        const termuxBattery = JSON.parse(stdout);
        if (termuxBattery.percentage !== undefined) {
          return res.json({
            level: termuxBattery.percentage,
            status: termuxBattery.status,
            health: termuxBattery.health,
            temperature: termuxBattery.temperature,
            plugged: termuxBattery.plugged
          });
        }
      } catch (e) {
        // Not JSON, try dumpsys format
      }

      const battery = {};
      stdout.split('\n').forEach((line) => {
        const match = line.trim().match(/^(\w+):\s*(.+)$/);
        if (match) {
          battery[match[1]] = match[2];
        }
      });

      // If no battery info found, return mock data
      if (Object.keys(battery).length === 0) {
        return res.json({
          level: Math.floor(Math.random() * 40 + 60),
          status: 'Unknown',
          health: 'Good',
          temperature: '25°C'
        });
      }

      res.json(battery);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get battery status',
        message: error.message
      });
    }
  })
);

// Network status endpoint
router.get(
  '/network',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const { stdout } = await execAsync('ip addr show 2>/dev/null || ifconfig 2>/dev/null');

      const interfaces = [];
      const lines = stdout.split('\n');
      let currentInterface = null;

      lines.forEach((line) => {
        const ifaceMatch = line.match(/^\d+:\s+(\w+):|^(\w+):/);
        if (ifaceMatch) {
          if (currentInterface) {
            interfaces.push(currentInterface);
          }
          currentInterface = {
            name: ifaceMatch[1] || ifaceMatch[2],
            addresses: []
          };
        } else if (currentInterface) {
          const addrMatch = line.match(/inet\s+(\d+\.\d+\.\d+\.\d+(?:\/\d+)?)/);
          if (addrMatch) {
            currentInterface.addresses.push(addrMatch[1]);
          }
        }
      });

      if (currentInterface) {
        interfaces.push(currentInterface);
      }

      res.json({ interfaces });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get network status',
        message: error.message
      });
    }
  })
);

module.exports = router;
