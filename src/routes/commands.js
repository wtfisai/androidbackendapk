const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const execAsync = promisify(exec);

// ADB command execution endpoint
router.post(
  '/adb/execute',
  authenticate,
  asyncHandler(async (req, res) => {
    const { command, force } = req.body;

    if (!command) {
      return res.status(400).json({
        error: 'Command is required'
      });
    }

    // Check if command is safe
    const isSafe = config.adb.safeCommands.some(
      (safeCmd) => command.startsWith(safeCmd) || command === safeCmd
    );

    if (!isSafe && !force) {
      return res.status(403).json({
        error: 'Command not in whitelist. Use force:true to override (dangerous!)',
        whitelisted: config.adb.safeCommands
      });
    }

    try {
      const { stdout, stderr } = await execAsync(`adb ${command}`, {
        maxBuffer: config.shell.maxBuffer,
        timeout: config.shell.timeout
      });

      res.json({
        output: stdout,
        stderr: stderr,
        command: command,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        stderr: error.stderr,
        command: command
      });
    }
  })
);

// Shell command execution endpoint
router.post(
  '/shell',
  authenticate,
  asyncHandler(async (req, res) => {
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({
        error: 'Command is required'
      });
    }

    // Check for dangerous patterns
    if (config.shell.dangerousPatterns.some((pattern) => pattern.test(command))) {
      return res.status(403).json({
        error: 'Potentially dangerous command blocked',
        reason: 'Command matches dangerous pattern'
      });
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: config.shell.timeout,
        maxBuffer: config.shell.maxBuffer
      });

      res.json({
        output: stdout,
        stderr: stderr,
        command: command,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        stderr: error.stderr || '',
        command: command
      });
    }
  })
);

// Logcat endpoint
router.get(
  '/logcat',
  authenticate,
  asyncHandler(async (req, res) => {
    const { lines = 100, filter = '' } = req.query;

    const command = filter ? `logcat -d -t ${lines} ${filter}` : `logcat -d -t ${lines}`;

    try {
      const { stdout } = await execAsync(command, {
        maxBuffer: 5 * 1024 * 1024
      });

      res.json({
        logs: stdout.split('\n'),
        count: stdout.split('\n').length,
        filter: filter || 'none',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get logs',
        message: error.message
      });
    }
  })
);

// Root status check endpoint
router.get(
  '/root-status',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      // Try to execute a safe command with su to check root access
      const { stdout, stderr } = await execAsync('timeout 2 su -c "id" 2>&1 || echo "not_rooted"', {
        timeout: 3000,
        maxBuffer: 1024
      });

      const output = stdout.toString();
      const isRooted = output.includes('uid=0') || output.includes('root');

      res.json({
        rooted: isRooted,
        output: output.trim(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // If su command fails or times out, device is not rooted
      res.json({
        rooted: false,
        output: 'not_rooted',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  })
);

module.exports = router;
