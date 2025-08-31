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

// Error handling
app.use(errorHandler);

// Export the Express app as a Firebase Function
export const api = functions.https.onRequest(app);

// Scheduled functions for future implementation
// export const cleanupOldData = functions.pubsub
//   .schedule('0 2 * * *') // Daily at 2 AM
//   .onRun(async (_context) => {
//     // TODO: Implement cleanup service
//   });

// Firestore triggers for future implementation
// export const onDeviceUpdate = functions.firestore
//   .document('devices/{deviceId}')
//   .onUpdate(async (change, context) => {
//     // TODO: Handle device updates
//   });

