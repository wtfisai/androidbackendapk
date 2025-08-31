import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// Initialize Firebase Admin
admin.initializeApp();

// Import route handlers
import { authRouter } from './api/auth';
import { devicesRouter } from './api/devices';
import { commandsRouter } from './api/commands';
import { monitoringRouter } from './api/monitoring';
import { notificationsRouter } from './api/notifications';
import { billingRouter } from './api/billing';

// Import middleware
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

// Create Express app
const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);
app.use(rateLimitMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API Routes
app.use('/auth', authRouter);
app.use('/devices', authMiddleware, devicesRouter);
app.use('/commands', authMiddleware, commandsRouter);
app.use('/monitoring', authMiddleware, monitoringRouter);
app.use('/notifications', authMiddleware, notificationsRouter);
app.use('/billing', authMiddleware, billingRouter);

// Error handling
app.use(errorHandler);

// Export the Express app as a Firebase Function
export const api = functions.https.onRequest(app);

// Scheduled functions
export const cleanupOldData = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM
  .onRun(async (_context) => {
    const { CleanupService } = await import('./services/CleanupService');
    const cleanup = new CleanupService();
    return cleanup.cleanupOldData();
  });

export const processNotifications = functions.pubsub
  .schedule('*/5 * * * *') // Every 5 minutes
  .onRun(async (_context) => {
    const { NotificationService } = await import('./services/NotificationService');
    const notifications = new NotificationService();
    return notifications.processQueuedNotifications();
  });

// Firestore triggers
export const onDeviceUpdate = functions.firestore
  .document('devices/{deviceId}')
  .onUpdate(async (change, context) => {
    const { DeviceManager } = await import('./services/DeviceManager');
    const deviceManager = new DeviceManager();
    return deviceManager.handleDeviceUpdate(change, context);
  });

export const onCommandCreate = functions.firestore
  .document('commands/{commandId}')
  .onCreate(async (snap, context) => {
    const { CommandQueue } = await import('./services/CommandQueue');
    const commandQueue = new CommandQueue();
    return commandQueue.handleNewCommand(snap, context);
  });

// WebSocket connection handler
export const websocket = functions.https.onRequest(async (req, res) => {
  const { WebSocketManager } = await import('./services/WebSocketManager');
  const wsManager = new WebSocketManager();
  return wsManager.handleConnection(req, res);
});

