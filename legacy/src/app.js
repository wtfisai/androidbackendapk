const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config');
const { rateLimit } = require('./middleware/rateLimit');
const { errorHandler } = require('./middleware/errorHandler');
const { activityTracker } = require('./middleware/activityTracker');

// Import routes
const systemRoutes = require('./routes/system');
const deviceRoutes = require('./routes/device');
const commandRoutes = require('./routes/commands');
const packageRoutes = require('./routes/packages');
const optimizationRoutes = require('./routes/optimization');
const diagnosticsRoutes = require('./routes/diagnostics');
const debugRoutes = require('./routes/debug');
const dashboardRoutes = require('./routes/dashboard');
const androidDebugRoutes = require('./routes/android-debug');
const profilingRoutes = require('./routes/profiling');
const testingRoutes = require('./routes/testing');
const deviceManagementRoutes = require('./routes/device-management');
const debugToolsRoutes = require('./routes/debug-tools');
const filesRoutes = require('./routes/files');
const appsRoutes = require('./routes/apps');
const remoteControlRoutes = require('./routes/remote-control');
const permissionsRoutes = require('./routes/permissions');

// Create Express app
const app = express();

// Middleware - CORS first to handle preflight requests
app.use(
  cors({
    origin: config.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key']
  })
);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(rateLimit);

// Activity tracking (after rate limiting, before routes)
app.use(activityTracker);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
    version: require('../package.json').version
  });
});

// API Info endpoint (no auth required)
app.get('/api/info', (req, res) => {
  res.json({
    message: 'Android Diagnostic API',
    version: require('../package.json').version,
    apiKey: config.apiKey,
    hint: 'Use this API key in the x-api-key header',
    dashboard: 'Access the web dashboard at /',
    documentation: 'https://github.com/wtfisai/androidbackend',
    endpoints: {
      health: 'GET /health',
      system: 'GET /api/system/*',
      device: 'GET /api/device/*',
      packages: 'GET /api/packages/*',
      commands: 'POST /api/shell, POST /api/adb/execute',
      logs: 'GET /api/logcat',
      optimization: {
        processSleep: 'PUT /api/optimize/process/:pid/sleep',
        processWake: 'PUT /api/optimize/process/:pid/wake',
        batchOptimize: 'POST /api/optimize/batch',
        suggestions: 'GET /api/optimize/suggestions',
        memoryClean: 'POST /api/optimize/memory/clean',
        history: 'GET /api/optimize/history'
      },
      diagnostics: {
        connectivity: 'POST /api/diagnostics/connectivity',
        traceroute: 'POST /api/diagnostics/traceroute',
        portScan: 'POST /api/diagnostics/port-scan',
        bandwidth: 'GET /api/diagnostics/bandwidth',
        wifiScan: 'POST /api/diagnostics/wifi/scan',
        speedTest: 'GET /api/diagnostics/speed-test'
      },
      debug: {
        startSession: 'POST /api/debug/start',
        stopSession: 'POST /api/debug/stop',
        getSession: 'GET /api/debug/session/:sessionId',
        listSessions: 'GET /api/debug/sessions',
        addTrace: 'POST /api/debug/trace',
        attachGdb: 'POST /api/debug/attach-gdb',
        logcat: 'GET /api/debug/logcat',
        heapDump: 'POST /api/debug/heap-dump'
      },
      dashboard: {
        overview: 'GET /api/dashboard/overview',
        activities: 'GET /api/dashboard/activities',
        processes: 'GET /api/dashboard/processes',
        debugSessions: 'GET /api/dashboard/debug-sessions',
        optimizationStats: 'GET /api/dashboard/optimization-stats',
        alerts: 'GET /api/dashboard/alerts'
      }
    }
  });
});

// Mount routes
app.use('/api', systemRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api', commandRoutes);
app.use('/api/optimize', optimizationRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/android', androidDebugRoutes);
app.use('/api/profiling', profilingRoutes);
app.use('/api/testing', testingRoutes);
app.use('/api/device-management', deviceManagementRoutes);
app.use('/api/debug-tools', debugToolsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/apps', appsRoutes);
app.use('/api/remote', remoteControlRoutes);
app.use('/api/permissions', permissionsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: ['/health', '/api/info']
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
