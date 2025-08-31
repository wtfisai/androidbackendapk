const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const execAsync = promisify(exec);

// Get all packages
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const { stdout } = await execAsync('pm list packages 2>/dev/null || echo "NOT_AVAILABLE"');

      if (stdout.includes('NOT_AVAILABLE')) {
        return res.json({
          packages: [],
          count: 0,
          error: 'Package manager not available in this environment'
        });
      }

      const packages = stdout
        .split('\n')
        .filter((line) => line.startsWith('package:'))
        .map((line) => line.replace('package:', '').trim())
        .sort();

      res.json({
        packages,
        count: packages.length
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get package list',
        message: error.message
      });
    }
  })
);

// Get specific package info
router.get(
  '/:packageName',
  authenticate,
  asyncHandler(async (req, res) => {
    const { packageName } = req.params;

    if (!packageName || !/^[a-zA-Z0-9._-]+$/.test(packageName)) {
      return res.status(400).json({
        error: 'Invalid package name'
      });
    }

    try {
      const { stdout } = await execAsync(
        `dumpsys package ${packageName} 2>/dev/null || echo "NOT_AVAILABLE"`
      );

      if (stdout.includes('NOT_AVAILABLE')) {
        return res.status(404).json({
          error: 'Package not found or dumpsys not available'
        });
      }

      res.json({
        packageName,
        info: stdout,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get package info',
        message: error.message
      });
    }
  })
);

module.exports = router;
