const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

// Initialize Firebase Admin
admin.initializeApp();

// Import services
const CommandQueueService = require('./services/command-queue');
const AlertSystemService = require('./services/alert-system');
const SubscriptionService = require('./services/subscription-service');

// Initialize services
const commandQueue = new CommandQueueService();
const alertSystem = new AlertSystemService();
const subscriptionService = new SubscriptionService();

// Middleware to verify Firebase Auth token
const verifyAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== Device Management ====================

// Register or update device
exports.registerDevice = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    await verifyAuth(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const { deviceId, name, model, androidVersion, capabilities } = req.body;
        const userId = req.user.uid;

        // Check device limit
        const canAdd = await subscriptionService.canAddDevice(userId);
        if (!canAdd.canAdd && !deviceId) {
          return res.status(403).json({
            error: 'Device limit reached',
            currentCount: canAdd.currentCount,
            limit: canAdd.limit,
          });
        }

        const deviceData = {
          userId,
          name: name || 'Unnamed Device',
          model: model || 'Unknown',
          androidVersion: androidVersion || 'Unknown',
          capabilities: capabilities || {},
          status: 'online',
          lastSeen: admin.firestore.FieldValue.serverTimestamp(),
          registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (deviceId) {
          // Update existing device
          await admin.firestore().collection('devices').doc(deviceId).update(deviceData);
          res.json({ success: true, deviceId });
        } else {
          // Create new device
          const docRef = await admin.firestore().collection('devices').add(deviceData);
          res.json({ success: true, deviceId: docRef.id });
        }
      } catch (error) {
        console.error('Error registering device:', error);
        res.status(500).json({ error: error.message });
      }
    });
  });
});

// Get user's devices
exports.getDevices = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    await verifyAuth(req, res, async () => {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const userId = req.user.uid;

        const snapshot = await admin.firestore()
          .collection('devices')
          .where('userId', '==', userId)
          .where('deleted', '!=', true)
          .orderBy('lastSeen', 'desc')
          .get();

        const devices = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));

        res.json({ devices });
      } catch (error) {
        console.error('Error getting devices:', error);
        res.status(500).json({ error: error.message });
      }
    });
  });
});

// ==================== Command Queue ====================

// Create command
exports.createCommand = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    await verifyAuth(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const { deviceId, type, payload, priority } = req.body;
        const userId = req.user.uid;

        // Check command limit
        const canExecute = await subscriptionService.canExecuteCommand(userId);
        if (!canExecute.canExecute) {
          return res.status(403).json({
            error: 'Command limit reached',
            remaining: canExecute.remaining,
            limit: canExecute.limit,
          });
        }

        const command = await commandQueue.createCommand(userId, deviceId, {
          type,
          payload,
          priority,
        });

        res.json({ success: true, command });
      } catch (error) {
        console.error('Error creating command:', error);
        res.status(500).json({ error: error.message });
      }
    });
  });
});

// Get command status
exports.getCommandStatus = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    await verifyAuth(req, res, async () => {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const { commandId } = req.query;
        const userId = req.user.uid;

        const command = await commandQueue.getCommandStatus(userId, commandId);
        res.json({ command });
      } catch (error) {
        console.error('Error getting command status:', error);
        res.status(500).json({ error: error.message });
      }
    });
  });
});

// Batch execute commands
exports.batchExecuteCommands = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    await verifyAuth(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const { deviceId, commands } = req.body;
        const userId = req.user.uid;

        // Check command limit
        const canExecute = await subscriptionService.canExecuteCommand(userId);
        if (!canExecute.canExecute ||
            (canExecute.remaining !== 'unlimited' && commands.length > canExecute.remaining)) {
          return res.status(403).json({
            error: 'Command limit exceeded',
            remaining: canExecute.remaining,
            limit: canExecute.limit,
          });
        }

        const result = await commandQueue.batchExecute(userId, deviceId, commands);
        res.json({ success: true, ...result });
      } catch (error) {
        console.error('Error batch executing commands:', error);
        res.status(500).json({ error: error.message });
      }
    });
  });
});

// ==================== Alert System ====================

// Get active alerts
exports.getAlerts = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    await verifyAuth(req, res, async () => {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const { deviceId } = req.query;
        const userId = req.user.uid;

        const alerts = await alertSystem.getActiveAlerts(userId, deviceId);
        res.json({ alerts });
      } catch (error) {
        console.error('Error getting alerts:', error);
        res.status(500).json({ error: error.message });
      }
    });
  });
});

// Acknowledge alert
exports.acknowledgeAlert = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    await verifyAuth(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const { alertId } = req.body;
        const userId = req.user.uid;

        await alertSystem.acknowledgeAlert(userId, alertId);
        res.json({ success: true });
      } catch (error) {
        console.error('Error acknowledging alert:', error);
        res.status(500).json({ error: error.message });
      }
    });
  });
});

// ==================== Subscription Management ====================

// Get subscription info
exports.getSubscription = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    await verifyAuth(req, res, async () => {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const userId = req.user.uid;
        const stats = await subscriptionService.getUsageStats(userId);
        res.json(stats);
      } catch (error) {
        console.error('Error getting subscription:', error);
        res.status(500).json({ error: error.message });
      }
    });
  });
});

// Update subscription
exports.updateSubscription = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    await verifyAuth(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const { planId, paymentInfo } = req.body;
        const userId = req.user.uid;

        const result = await subscriptionService.updateSubscription(userId, planId, paymentInfo);
        res.json(result);
      } catch (error) {
        console.error('Error updating subscription:', error);
        res.status(500).json({ error: error.message });
      }
    });
  });
});

// ==================== Firestore Triggers ====================

// Process metrics on write
exports.onDeviceMetricsUpdate = functions.firestore
  .document('device_metrics/{metricId}')
  .onCreate(async (snap, _context) => {
    const data = snap.data();

    if (data.type === 'metrics' && data.data) {
      try {
        // Check thresholds and create alerts
        await alertSystem.checkThresholds(data.deviceId, data.data);

        // Auto-resolve alerts if metrics improved
        await alertSystem.autoResolveAlerts(data.deviceId, data.data);
      } catch (error) {
        console.error('Error processing metrics:', error);
      }
    }
  });

// Update device last seen
exports.onUserStatusChanged = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, _context) => {
    const newData = change.after.data();
    const previousData = change.before.data();

    if (newData.status !== previousData.status) {
      try {
        await admin.firestore()
          .collection('devices')
          .doc(newData.deviceId)
          .update({
            lastSeen: admin.firestore.FieldValue.serverTimestamp(),
          });
      } catch (error) {
        console.error('Error updating device last seen:', error);
      }
    }
  });

// ==================== Scheduled Functions ====================

// Clean up old data
exports.scheduledCleanup = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (_context) => {
    try {
      // Clean up old commands
      await commandQueue.cleanupOldCommands(30);

      // Clean up old alerts
      await alertSystem.cleanupOldAlerts(7);

      // Enforce retention policies for all users
      const usersSnapshot = await admin.firestore().collection('users').get();
      for (const userDoc of usersSnapshot.docs) {
        await subscriptionService.enforceRetentionPolicy(userDoc.id);
      }

      console.log('Scheduled cleanup completed');
    } catch (error) {
      console.error('Error in scheduled cleanup:', error);
    }
  });

// Check device online status
exports.checkDeviceStatus = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (_context) => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const snapshot = await admin.firestore()
        .collection('devices')
        .where('status', '==', 'online')
        .where('lastSeen', '<', fiveMinutesAgo)
        .get();

      const batch = admin.firestore().batch();
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: 'offline',
        });
      });

      await batch.commit();
      console.log(`Marked ${snapshot.size} devices as offline`);
    } catch (error) {
      console.error('Error checking device status:', error);
    }
  });
