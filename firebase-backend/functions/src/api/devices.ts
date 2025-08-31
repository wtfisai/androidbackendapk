import { Router } from 'express';
import * as admin from 'firebase-admin';
import { body, validationResult } from 'express-validator';

export const devicesRouter = Router();

// Register a new device
devicesRouter.post('/register',
  [
    body('deviceName').trim().isLength({ min: 1, max: 100 }),
    body('deviceModel').optional().trim().isLength({ max: 50 }),
    body('androidVersion').optional().trim().isLength({ max: 20 }),
    body('deviceId').optional().trim().isLength({ max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const userId = (req as any).user.uid;
      const { deviceName, deviceModel, androidVersion, deviceId } = req.body;

      // Check user's device limit
      const userDoc = await admin.firestore()
        .collection('users')
        .doc(userId)
        .get();

      if (!userDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const userData = userDoc.data();
      const subscription = userData?.subscription;
      const deviceLimit = subscription?.deviceLimit || 1;

      // Count existing devices
      const existingDevices = await admin.firestore()
        .collection('devices')
        .where('userId', '==', userId)
        .where('status', '==', 'active')
        .get();

      if (existingDevices.size >= deviceLimit) {
        return res.status(403).json({
          success: false,
          error: `Device limit reached. Your ${subscription?.plan || 'free'} plan allows ${deviceLimit} device(s).`,
        });
      }

      // Create device document
      const deviceRef = admin.firestore().collection('devices').doc();
      const deviceData = {
        id: deviceRef.id,
        userId,
        deviceName,
        deviceModel: deviceModel || 'Unknown',
        androidVersion: androidVersion || 'Unknown',
        deviceId: deviceId || null,
        status: 'active',
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        metrics: {
          cpu: 0,
          memory: 0,
          battery: 100,
          storage: 0,
          network: 'offline',
        },
        settings: {
          monitoringEnabled: true,
          alertsEnabled: true,
          syncInterval: 30000,
        },
      };

      await deviceRef.set(deviceData);

      res.json({
        success: true,
        device: {
          id: deviceRef.id,
          deviceName,
          deviceModel,
          androidVersion,
          status: 'active',
        },
      });
    } catch (error: any) {
      console.error('Device registration error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Device registration failed',
      });
    }
  },
);

// Get user's devices
devicesRouter.get('/', async (req, res) => {
  try {
    const userId = (req as any).user.uid;

    const devicesSnapshot = await admin.firestore()
      .collection('devices')
      .where('userId', '==', userId)
      .orderBy('lastSeen', 'desc')
      .get();

    const devices = devicesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      devices,
    });
  } catch (error: any) {
    console.error('Get devices error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get devices',
    });
  }
});

// Get specific device
devicesRouter.get('/:deviceId', async (req, res) => {
  try {
    const userId = (req as any).user.uid;
    const { deviceId } = req.params;

    const deviceDoc = await admin.firestore()
      .collection('devices')
      .doc(deviceId)
      .get();

    if (!deviceDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Device not found',
      });
    }

    const deviceData = deviceDoc.data();
    if (deviceData?.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    res.json({
      success: true,
      device: {
        id: deviceDoc.id,
        ...deviceData,
      },
    });
  } catch (error: any) {
    console.error('Get device error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get device',
    });
  }
});

// Update device metrics
devicesRouter.put('/:deviceId/metrics',
  [
    body('cpu').optional().isFloat({ min: 0, max: 100 }),
    body('memory').optional().isFloat({ min: 0, max: 100 }),
    body('battery').optional().isInt({ min: 0, max: 100 }),
    body('storage').optional().isFloat({ min: 0, max: 100 }),
    body('network').optional().isIn(['online', 'offline', 'limited']),
    body('temperature').optional().isFloat(),
    body('processes').optional().isInt({ min: 0 }),
    body('uptime').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const userId = (req as any).user.uid;
      const { deviceId } = req.params;

      // Verify device ownership
      const deviceDoc = await admin.firestore()
        .collection('devices')
        .doc(deviceId)
        .get();

      if (!deviceDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Device not found',
        });
      }

      const deviceData = deviceDoc.data();
      if (deviceData?.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      const updates: any = {
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Update metrics
      const metrics: any = {};
      if (req.body.cpu !== undefined) metrics.cpu = req.body.cpu;
      if (req.body.memory !== undefined) metrics.memory = req.body.memory;
      if (req.body.battery !== undefined) metrics.battery = req.body.battery;
      if (req.body.storage !== undefined) metrics.storage = req.body.storage;
      if (req.body.network !== undefined) metrics.network = req.body.network;
      if (req.body.temperature !== undefined) metrics.temperature = req.body.temperature;
      if (req.body.processes !== undefined) metrics.processes = req.body.processes;
      if (req.body.uptime !== undefined) metrics.uptime = req.body.uptime;

      if (Object.keys(metrics).length > 0) {
        updates.metrics = { ...deviceData?.metrics, ...metrics };
      }

      await admin.firestore()
        .collection('devices')
        .doc(deviceId)
        .update(updates);

      // Check for alerts
      await checkDeviceAlerts(deviceId, userId, updates.metrics || deviceData?.metrics);

      res.json({
        success: true,
        message: 'Metrics updated successfully',
      });
    } catch (error: any) {
      console.error('Update metrics error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to update metrics',
      });
    }
  },
);

// Update device settings
devicesRouter.put('/:deviceId/settings',
  [
    body('monitoringEnabled').optional().isBoolean(),
    body('alertsEnabled').optional().isBoolean(),
    body('syncInterval').optional().isInt({ min: 5000, max: 300000 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const userId = (req as any).user.uid;
      const { deviceId } = req.params;

      // Verify device ownership
      const deviceDoc = await admin.firestore()
        .collection('devices')
        .doc(deviceId)
        .get();

      if (!deviceDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Device not found',
        });
      }

      const deviceData = deviceDoc.data();
      if (deviceData?.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      const settings = { ...deviceData?.settings };
      if (req.body.monitoringEnabled !== undefined) {
        settings.monitoringEnabled = req.body.monitoringEnabled;
      }
      if (req.body.alertsEnabled !== undefined) {
        settings.alertsEnabled = req.body.alertsEnabled;
      }
      if (req.body.syncInterval !== undefined) {
        settings.syncInterval = req.body.syncInterval;
      }

      await admin.firestore()
        .collection('devices')
        .doc(deviceId)
        .update({
          settings,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      res.json({
        success: true,
        message: 'Settings updated successfully',
      });
    } catch (error: any) {
      console.error('Update settings error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to update settings',
      });
    }
  },
);

// Delete/deactivate device
devicesRouter.delete('/:deviceId', async (req, res) => {
  try {
    const userId = (req as any).user.uid;
    const { deviceId } = req.params;

    // Verify device ownership
    const deviceDoc = await admin.firestore()
      .collection('devices')
      .doc(deviceId)
      .get();

    if (!deviceDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Device not found',
      });
    }

    const deviceData = deviceDoc.data();
    if (deviceData?.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Soft delete by changing status
    await admin.firestore()
      .collection('devices')
      .doc(deviceId)
      .update({
        status: 'deleted',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.json({
      success: true,
      message: 'Device deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete device error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to delete device',
    });
  }
});

// Get device activities/logs
devicesRouter.get('/:deviceId/activities', async (req, res) => {
  try {
    const userId = (req as any).user.uid;
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Verify device ownership
    const deviceDoc = await admin.firestore()
      .collection('devices')
      .doc(deviceId)
      .get();

    if (!deviceDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Device not found',
      });
    }

    const deviceData = deviceDoc.data();
    if (deviceData?.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const activitiesSnapshot = await admin.firestore()
      .collection('activities')
      .where('deviceId', '==', deviceId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const activities = activitiesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      activities,
    });
  } catch (error: any) {
    console.error('Get activities error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get activities',
    });
  }
});

// Helper function to check device alerts
async function checkDeviceAlerts(deviceId: string, userId: string, metrics: any) {
  try {
    const alerts = [];

    // Check critical thresholds
    if (metrics.cpu > 80) {
      alerts.push({
        type: 'warning',
        title: 'High CPU Usage',
        message: `CPU usage is at ${metrics.cpu}%`,
        severity: 'medium',
      });
    }

    if (metrics.memory > 90) {
      alerts.push({
        type: 'warning',
        title: 'High Memory Usage',
        message: `Memory usage is at ${metrics.memory}%`,
        severity: 'high',
      });
    }

    if (metrics.battery < 15) {
      alerts.push({
        type: 'warning',
        title: 'Low Battery',
        message: `Battery level is at ${metrics.battery}%`,
        severity: 'medium',
      });
    }

    if (metrics.storage > 95) {
      alerts.push({
        type: 'warning',
        title: 'Storage Full',
        message: `Storage usage is at ${metrics.storage}%`,
        severity: 'high',
      });
    }

    if (metrics.temperature && metrics.temperature > 40) {
      alerts.push({
        type: 'warning',
        title: 'High Temperature',
        message: `Device temperature is ${metrics.temperature}°C`,
        severity: 'high',
      });
    }

    // Create alert documents for significant issues
    for (const alert of alerts.filter(a => a.severity === 'high')) {
      await admin.firestore().collection('alerts').add({
        userId,
        deviceId,
        type: alert.type,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        status: 'active',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('Error checking device alerts:', error);
  }
}
