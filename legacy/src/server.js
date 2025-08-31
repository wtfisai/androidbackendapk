// Apply NeDB patch before any other requires
require('./utils/nedb-patch');

const app = require('./app');
const config = require('./config');

// Start server
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║       Android Remote Diagnostic API Server Started        ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Server running on: http://0.0.0.0:${config.port}                    ║
║  Environment: ${config.nodeEnv.padEnd(45)}║
║                                                            ║
║  API Key: ${config.apiKey.substring(0, 20)}...                         ║
║                                                            ║
║  Save this API key to connect from Windows 11!            ║
║                                                            ║
║  To find your device IP for remote connection:            ║
║  Run: ip addr show wlan0                                  ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);

  if (config.nodeEnv === 'development') {
    console.log('Development mode - detailed logging enabled');
  }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);

  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = server;
