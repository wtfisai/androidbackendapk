const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { authenticateApiKey } = require('../middleware/auth');
const { Activity } = require('../models/Activity');
const execAsync = promisify(exec);

// Active test sessions
const testSessions = new Map();

// POST /api/testing/ui-automator/click
router.post('/ui-automator/click', authenticateApiKey, async (req, res) => {
  try {
    const { x, y, resourceId, text, className, contentDesc } = req.body;

    let command = 'input tap';

    if (x !== undefined && y !== undefined) {
      // Click at coordinates
      command = `input tap ${x} ${y}`;
    } else if (resourceId || text || className || contentDesc) {
      // Find element and click
      const selector = buildUiSelector({ resourceId, text, className, contentDesc });
      command = `uiautomator runtest /system/framework/uiautomator.jar -c ${selector}`;
    } else {
      return res.status(400).json({
        error: 'Either coordinates or element selector required'
      });
    }

    await execAsync(command);

    await Activity.log({
      type: 'testing',
      action: 'ui_click',
      metadata: { x, y, resourceId, text, className }
    });

    res.json({
      success: true,
      action: 'click',
      target: { x, y, resourceId, text, className, contentDesc }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to perform click',
      message: error.message
    });
  }
});

// POST /api/testing/ui-automator/swipe
router.post('/ui-automator/swipe', authenticateApiKey, async (req, res) => {
  try {
    const { startX, startY, endX, endY, duration = 300 } = req.body;

    if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
      return res.status(400).json({
        error: 'Start and end coordinates required'
      });
    }

    const command = `input swipe ${startX} ${startY} ${endX} ${endY} ${duration}`;
    await execAsync(command);

    await Activity.log({
      type: 'testing',
      action: 'ui_swipe',
      metadata: { startX, startY, endX, endY, duration }
    });

    res.json({
      success: true,
      action: 'swipe',
      from: { x: startX, y: startY },
      to: { x: endX, y: endY },
      duration
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to perform swipe',
      message: error.message
    });
  }
});

// POST /api/testing/ui-automator/text
router.post('/ui-automator/text', authenticateApiKey, async (req, res) => {
  try {
    const { text, resourceId, className, clear = false } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Clear existing text if requested
    if (clear) {
      if (resourceId || className) {
        // Focus on the element first
        const selector = buildUiSelector({ resourceId, className });
        await execAsync(`input tap ${selector}`);
      }
      // Clear text
      await execAsync('input keyevent KEYCODE_MOVE_END');
      await execAsync('input keyevent --longpress $(printf "KEYCODE_DEL %.0s" {1..250})');
    }

    // Input new text
    const escapedText = text.replace(/'/g, "\\'").replace(/"/g, '\\"');
    await execAsync(`input text "${escapedText}"`);

    await Activity.log({
      type: 'testing',
      action: 'ui_text_input',
      metadata: { text: text.substring(0, 100), clear }
    });

    res.json({
      success: true,
      action: 'text_input',
      text,
      cleared: clear
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to input text',
      message: error.message
    });
  }
});

// POST /api/testing/ui-automator/keyevent
router.post('/ui-automator/keyevent', authenticateApiKey, async (req, res) => {
  try {
    const { keyCode, longPress = false } = req.body;

    if (!keyCode) {
      return res.status(400).json({ error: 'Key code is required' });
    }

    let command = 'input keyevent';
    if (longPress) {
      command += ' --longpress';
    }
    command += ` ${keyCode}`;

    await execAsync(command);

    await Activity.log({
      type: 'testing',
      action: 'ui_keyevent',
      metadata: { keyCode, longPress }
    });

    res.json({
      success: true,
      action: 'keyevent',
      keyCode,
      longPress
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to send key event',
      message: error.message
    });
  }
});

// GET /api/testing/ui-automator/dump
router.get('/ui-automator/dump', authenticateApiKey, async (req, res) => {
  try {
    const dumpPath = '/sdcard/ui_dump.xml';

    // Dump UI hierarchy
    await execAsync(`uiautomator dump ${dumpPath}`);

    // Read the dump file
    const { stdout } = await execAsync(`cat ${dumpPath}`);

    // Parse UI elements
    const elements = parseUiDump(stdout);

    await Activity.log({
      type: 'testing',
      action: 'ui_dump',
      metadata: { elementCount: elements.length }
    });

    res.json({
      elements,
      count: elements.length,
      xmlPath: dumpPath,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to dump UI',
      message: error.message
    });
  }
});

// POST /api/testing/monkey
router.post('/monkey', authenticateApiKey, async (req, res) => {
  try {
    const {
      packageName,
      eventCount = 1000,
      throttle = 100,
      seed,
      categories = [],
      ignoreCrashes = false,
      ignoreTimeouts = false,
      ignoreSecurityExceptions = false,
      killProcessAfterError = true,
      percentTouch = 15,
      percentMotion = 10,
      percentTrackball = 15,
      percentNav = 25,
      percentMajorNav = 15,
      percentSyskeys = 2,
      percentAppswitch = 2,
      percentFlip = 1,
      percentAnyevent = 15
    } = req.body;

    if (!packageName) {
      return res.status(400).json({ error: 'Package name is required' });
    }

    // Build monkey command
    let command = 'monkey';
    command += ` -p ${packageName}`;
    command += ` --throttle ${throttle}`;

    if (seed) {
      command += ` -s ${seed}`;
    }

    for (const category of categories) {
      command += ` -c ${category}`;
    }

    if (ignoreCrashes) {
      command += ' --ignore-crashes';
    }
    if (ignoreTimeouts) {
      command += ' --ignore-timeouts';
    }
    if (ignoreSecurityExceptions) {
      command += ' --ignore-security-exceptions';
    }
    if (killProcessAfterError) {
      command += ' --kill-process-after-error';
    }

    // Event percentages
    command += ` --pct-touch ${percentTouch}`;
    command += ` --pct-motion ${percentMotion}`;
    command += ` --pct-trackball ${percentTrackball}`;
    command += ` --pct-nav ${percentNav}`;
    command += ` --pct-majornav ${percentMajorNav}`;
    command += ` --pct-syskeys ${percentSyskeys}`;
    command += ` --pct-appswitch ${percentAppswitch}`;
    command += ` --pct-flip ${percentFlip}`;
    command += ` --pct-anyevent ${percentAnyevent}`;

    command += ` ${eventCount}`;

    // Start monkey test in background
    const sessionId = `monkey_${Date.now()}`;
    const outputPath = `/tmp/monkey_${sessionId}.log`;

    exec(`${command} > ${outputPath} 2>&1`, (error, stdout, stderr) => {
      testSessions.set(sessionId, {
        status: 'completed',
        output: stdout || stderr,
        error: error ? error.message : null,
        endTime: new Date()
      });
    });

    testSessions.set(sessionId, {
      type: 'monkey',
      packageName,
      eventCount,
      startTime: new Date(),
      status: 'running',
      outputPath
    });

    await Activity.log({
      type: 'testing',
      action: 'monkey_test_start',
      metadata: { sessionId, packageName, eventCount }
    });

    res.json({
      sessionId,
      status: 'started',
      packageName,
      eventCount,
      throttle,
      seed,
      outputPath
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start monkey test',
      message: error.message
    });
  }
});

// POST /api/testing/instrumented/run
router.post('/instrumented/run', authenticateApiKey, async (req, res) => {
  try {
    const {
      testPackage,
      testRunner = 'androidx.test.runner.AndroidJUnitRunner',
      testClass,
      testMethod,
      arguments = {}
    } = req.body;

    if (!testPackage) {
      return res.status(400).json({ error: 'Test package is required' });
    }

    // Build am instrument command
    let command = 'am instrument -w';

    // Add test class/method if specified
    if (testClass) {
      command += ` -e class ${testClass}`;
      if (testMethod) {
        command += `#${testMethod}`;
      }
    }

    // Add custom arguments
    for (const [key, value] of Object.entries(arguments)) {
      command += ` -e ${key} ${value}`;
    }

    command += ` ${testPackage}/${testRunner}`;

    // Run instrumented test
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 * 5 });

    // Parse test results
    const results = parseInstrumentedTestOutput(stdout);

    await Activity.log({
      type: 'testing',
      action: 'instrumented_test',
      metadata: { testPackage, testClass, testMethod, results }
    });

    res.json({
      testPackage,
      testRunner,
      testClass,
      testMethod,
      results,
      rawOutput: stdout || stderr
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to run instrumented test',
      message: error.message
    });
  }
});

// GET /api/testing/sessions/:sessionId
router.get('/sessions/:sessionId', authenticateApiKey, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = testSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Read output file if available
    let output = null;
    if (session.outputPath && session.status === 'completed') {
      try {
        const { stdout } = await execAsync(`tail -n 1000 ${session.outputPath}`);
        output = stdout;
      } catch (e) {
        output = 'Failed to read output';
      }
    }

    res.json({
      sessionId,
      ...session,
      output
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get test session',
      message: error.message
    });
  }
});

// POST /api/testing/benchmark/startup
router.post('/benchmark/startup', authenticateApiKey, async (req, res) => {
  try {
    const { packageName, activityName, iterations = 10, coldStart = true } = req.body;

    if (!packageName || !activityName) {
      return res.status(400).json({
        error: 'Package name and activity name are required'
      });
    }

    const measurements = [];

    for (let i = 0; i < iterations; i++) {
      // Force stop app for cold start
      if (coldStart) {
        await execAsync(`am force-stop ${packageName}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Start activity and measure time
      const startTime = Date.now();
      await execAsync(`am start -W -n ${packageName}/${activityName}`);
      const launchTime = Date.now() - startTime;

      measurements.push(launchTime);

      // Wait between iterations
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Calculate statistics
    const stats = {
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      avg: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      median: measurements.sort((a, b) => a - b)[Math.floor(measurements.length / 2)],
      measurements
    };

    await Activity.log({
      type: 'testing',
      action: 'benchmark_startup',
      metadata: { packageName, activityName, iterations, stats }
    });

    res.json({
      packageName,
      activityName,
      iterations,
      coldStart,
      stats,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to run startup benchmark',
      message: error.message
    });
  }
});

// POST /api/testing/espresso/record
router.post('/espresso/record', authenticateApiKey, async (req, res) => {
  try {
    const { duration = 30 } = req.body;

    const sessionId = `espresso_${Date.now()}`;
    const scriptPath = `/tmp/espresso_${sessionId}.txt`;

    // Start recording UI events
    const recordingProcess = exec(
      `getevent -lt > ${scriptPath}`,
      { timeout: duration * 1000 },
      (error) => {
        if (!error || error.killed) {
          testSessions.set(sessionId, {
            status: 'completed',
            scriptPath,
            endTime: new Date()
          });
        }
      }
    );

    testSessions.set(sessionId, {
      type: 'espresso_recording',
      duration,
      scriptPath,
      startTime: new Date(),
      status: 'recording',
      pid: recordingProcess.pid
    });

    await Activity.log({
      type: 'testing',
      action: 'espresso_record_start',
      metadata: { sessionId, duration }
    });

    res.json({
      sessionId,
      status: 'recording',
      duration,
      scriptPath,
      willCompleteAt: new Date(Date.now() + duration * 1000)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start Espresso recording',
      message: error.message
    });
  }
});

// Helper function to build UI selector
function buildUiSelector({ resourceId, text, className, contentDesc }) {
  const conditions = [];

  if (resourceId) {
    conditions.push(`resource-id="${resourceId}"`);
  }
  if (text) {
    conditions.push(`text="${text}"`);
  }
  if (className) {
    conditions.push(`class="${className}"`);
  }
  if (contentDesc) {
    conditions.push(`content-desc="${contentDesc}"`);
  }

  return conditions.join(' ');
}

// Helper function to parse UI dump
function parseUiDump(xml) {
  const elements = [];
  const nodeMatches = xml.matchAll(/<node([^>]+)>/g);

  for (const match of nodeMatches) {
    const nodeStr = match[1];
    const element = {};

    // Extract attributes
    const attrs = [
      'index',
      'text',
      'resource-id',
      'class',
      'package',
      'content-desc',
      'checkable',
      'checked',
      'clickable',
      'enabled',
      'focusable',
      'focused',
      'scrollable',
      'long-clickable',
      'password',
      'selected',
      'bounds'
    ];

    for (const attr of attrs) {
      const attrMatch = nodeStr.match(new RegExp(`${attr}="([^"]*)"`));
      if (attrMatch) {
        element[attr.replace('-', '_')] = attrMatch[1];
      }
    }

    // Parse bounds
    if (element.bounds) {
      const boundsMatch = element.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (boundsMatch) {
        element.bounds = {
          left: parseInt(boundsMatch[1]),
          top: parseInt(boundsMatch[2]),
          right: parseInt(boundsMatch[3]),
          bottom: parseInt(boundsMatch[4])
        };
        element.center = {
          x: Math.floor((element.bounds.left + element.bounds.right) / 2),
          y: Math.floor((element.bounds.top + element.bounds.bottom) / 2)
        };
      }
    }

    elements.push(element);
  }

  return elements;
}

// Helper function to parse instrumented test output
function parseInstrumentedTestOutput(output) {
  const results = {
    tests: 0,
    failures: 0,
    errors: 0,
    skipped: 0,
    time: 0,
    testCases: []
  };

  // Parse summary line
  const summaryMatch = output.match(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+)/);
  if (summaryMatch) {
    results.tests = parseInt(summaryMatch[1]);
    results.failures = parseInt(summaryMatch[2]);
    results.errors = parseInt(summaryMatch[3]);
  }

  // Parse individual test results
  const testMatches = output.matchAll(
    /INSTRUMENTATION_STATUS: test=(\S+)[\s\S]*?INSTRUMENTATION_STATUS: (?:current|numtests)=(\d+)[\s\S]*?INSTRUMENTATION_STATUS_CODE: (-?\d+)/g
  );

  for (const match of testMatches) {
    const statusCode = parseInt(match[3]);
    results.testCases.push({
      name: match[1],
      number: parseInt(match[2]),
      status: statusCode === 0 ? 'passed' : statusCode === -2 ? 'failed' : 'error',
      statusCode
    });
  }

  // Parse time
  const timeMatch = output.match(/Time:\s*([\d.]+)/);
  if (timeMatch) {
    results.time = parseFloat(timeMatch[1]);
  }

  return results;
}

module.exports = router;
