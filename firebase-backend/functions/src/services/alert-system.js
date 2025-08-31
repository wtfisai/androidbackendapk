const admin = require('firebase-admin');
const { logger } = require('firebase-functions');

class AlertSystemService {
  constructor() {
    this.db = admin.firestore();
    this.messaging = admin.messaging();
  }

  /**
   * Check device metrics against thresholds
   */
  async checkThresholds(deviceId, metrics) {
    try {
      // Get device and user settings
      const deviceDoc = await this.db.collection('devices').doc(deviceId).get();
      if (!deviceDoc.exists) {
        throw new Error('Device not found');
      }

      const device = deviceDoc.data();
      const userDoc = await this.db.collection('users').doc(device.userId).get();
      const userSettings = userDoc.data()?.settings || {};

      // Default thresholds
      const thresholds = {
        cpu: userSettings.cpuThreshold || 80,
        memory: userSettings.memoryThreshold || 85,
        battery: userSettings.batteryThreshold || 20,
        storage: userSettings.storageThreshold || 90,
        temperature: userSettings.temperatureThreshold || 50,
      };

      const alerts = [];

      // Check CPU usage
      if (metrics.cpu > thresholds.cpu) {
        alerts.push({
          type: 'cpu',
          severity: metrics.cpu > 95 ? 'critical' : 'high',
          message: `High CPU usage: ${metrics.cpu.toFixed(1)}%`,
          value: metrics.cpu,
          threshold: thresholds.cpu,
        });
      }

      // Check memory usage
      if (metrics.memory > thresholds.memory) {
        alerts.push({
          type: 'memory',
          severity: metrics.memory > 95 ? 'critical' : 'high',
          message: `High memory usage: ${metrics.memory.toFixed(1)}%`,
          value: metrics.memory,
          threshold: thresholds.memory,
        });
      }

      // Check battery level
      if (metrics.battery < thresholds.battery) {
        alerts.push({
          type: 'battery',
          severity: metrics.battery < 10 ? 'critical' : 'medium',
          message: `Low battery: ${metrics.battery}%`,
          value: metrics.battery,
          threshold: thresholds.battery,
        });
      }

      // Check storage usage
      if (metrics.storage > thresholds.storage) {
        alerts.push({
          type: 'storage',
          severity: metrics.storage > 95 ? 'critical' : 'high',
          message: `High storage usage: ${metrics.storage.toFixed(1)}%`,
          value: metrics.storage,
          threshold: thresholds.storage,
        });
      }

      // Check temperature
      if (metrics.temperature > thresholds.temperature) {
        alerts.push({
          type: 'temperature',
          severity: metrics.temperature > 60 ? 'critical' : 'high',
          message: `High temperature: ${metrics.temperature.toFixed(1)}°C`,
          value: metrics.temperature,
          threshold: thresholds.temperature,
        });
      }

      // Process alerts
      if (alerts.length > 0) {
        await this.createAlerts(device.userId, deviceId, device.name, alerts);
      }

      return alerts;
    } catch (error) {
      logger.error('Error checking thresholds:', error);
      throw error;
    }
  }

  /**
   * Create alert documents and send notifications
   */
  async createAlerts(userId, deviceId, deviceName, alerts) {
    try {
      const batch = this.db.batch();
      const notifications = [];

      for (const alert of alerts) {
        // Check if similar alert already exists
        const existingAlert = await this.db.collection('alerts')
          .where('deviceId', '==', deviceId)
          .where('type', '==', alert.type)
          .where('status', '==', 'active')
          .limit(1)
          .get();

        if (existingAlert.empty) {
          // Create new alert
          const alertRef = this.db.collection('alerts').doc();
          batch.set(alertRef, {
            userId,
            deviceId,
            type: alert.type,
            severity: alert.severity,
            message: alert.message,
            value: alert.value,
            threshold: alert.threshold,
            status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            acknowledgedAt: null,
          });

          // Prepare notification
          if (alert.severity === 'critical' || alert.severity === 'high') {
            notifications.push({
              title: `Alert: ${deviceName}`,
              body: alert.message,
              data: {
                alertId: alertRef.id,
                deviceId,
                type: alert.type,
                severity: alert.severity,
              },
            });
          }
        }
      }

      await batch.commit();

      // Send notifications
      if (notifications.length > 0) {
        await this.sendNotifications(userId, notifications);
      }

      return { alertCount: notifications.length };
    } catch (error) {
      logger.error('Error creating alerts:', error);
      throw error;
    }
  }

  /**
   * Send push notifications
   */
  async sendNotifications(userId, notifications) {
    try {
      // Get user's FCM tokens
      const tokensSnapshot = await this.db.collection('users')
        .doc(userId)
        .collection('fcmTokens')
        .get();

      if (tokensSnapshot.empty) {
        logger.info('No FCM tokens found for user:', userId);
        return;
      }

      const tokens = tokensSnapshot.docs.map(doc => doc.id);

      // Send notifications to all tokens
      for (const notification of notifications) {
        const message = {
          notification: {
            title: notification.title,
            body: notification.body,
          },
          data: notification.data,
          tokens,
        };

        const response = await this.messaging.sendMulticast(message);

        // Handle failed tokens
        if (response.failureCount > 0) {
          const failedTokens = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              failedTokens.push(tokens[idx]);
            }
          });

          // Remove failed tokens
          for (const token of failedTokens) {
            await this.db.collection('users')
              .doc(userId)
              .collection('fcmTokens')
              .doc(token)
              .delete();
          }
        }
      }
    } catch (error) {
      logger.error('Error sending notifications:', error);
      // Don't throw, just log
    }
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(userId, alertId) {
    try {
      const alertDoc = await this.db.collection('alerts').doc(alertId).get();

      if (!alertDoc.exists) {
        throw new Error('Alert not found');
      }

      const alert = alertDoc.data();

      // Verify ownership
      if (alert.userId !== userId) {
        throw new Error('Unauthorized');
      }

      await this.db.collection('alerts').doc(alertId).update({
        status: 'acknowledged',
        acknowledgedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      throw error;
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId, autoResolved = false) {
    try {
      await this.db.collection('alerts').doc(alertId).update({
        status: 'resolved',
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        autoResolved,
      });

      return { success: true };
    } catch (error) {
      logger.error('Error resolving alert:', error);
      throw error;
    }
  }

  /**
   * Get active alerts for a user
   */
  async getActiveAlerts(userId, deviceId = null) {
    try {
      let query = this.db.collection('alerts')
        .where('userId', '==', userId)
        .where('status', '==', 'active');

      if (deviceId) {
        query = query.where('deviceId', '==', deviceId);
      }

      const snapshot = await query
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      logger.error('Error getting active alerts:', error);
      throw error;
    }
  }

  /**
   * Auto-resolve alerts when metrics improve
   */
  async autoResolveAlerts(deviceId, metrics) {
    try {
      const activeAlerts = await this.db.collection('alerts')
        .where('deviceId', '==', deviceId)
        .where('status', '==', 'active')
        .get();

      const batch = this.db.batch();
      let resolvedCount = 0;

      activeAlerts.docs.forEach(doc => {
        const alert = doc.data();
        let shouldResolve = false;

        switch (alert.type) {
        case 'cpu':
          shouldResolve = metrics.cpu < (alert.threshold - 10);
          break;
        case 'memory':
          shouldResolve = metrics.memory < (alert.threshold - 10);
          break;
        case 'battery':
          shouldResolve = metrics.battery > (alert.threshold + 10);
          break;
        case 'storage':
          shouldResolve = metrics.storage < (alert.threshold - 10);
          break;
        case 'temperature':
          shouldResolve = metrics.temperature < (alert.threshold - 5);
          break;
        }

        if (shouldResolve) {
          batch.update(doc.ref, {
            status: 'resolved',
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            autoResolved: true,
          });
          resolvedCount++;
        }
      });

      if (resolvedCount > 0) {
        await batch.commit();
      }

      return { resolvedCount };
    } catch (error) {
      logger.error('Error auto-resolving alerts:', error);
      throw error;
    }
  }

  /**
   * Clean up old resolved alerts
   */
  async cleanupOldAlerts(daysToKeep = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const snapshot = await this.db.collection('alerts')
        .where('status', '==', 'resolved')
        .where('resolvedAt', '<', cutoffDate)
        .limit(500)
        .get();

      const batch = this.db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info(`Cleaned up ${snapshot.size} old alerts`);
      return { deletedCount: snapshot.size };
    } catch (error) {
      logger.error('Error cleaning up old alerts:', error);
      throw error;
    }
  }
}

module.exports = AlertSystemService;
