const admin = require('firebase-admin');
const { logger } = require('firebase-functions');

class SubscriptionService {
  constructor() {
    this.db = admin.firestore();
    this.plans = {
      free: {
        name: 'Free',
        price: 0,
        deviceLimit: 1,
        alertsEnabled: true,
        commandLimit: 100, // per month
        retentionDays: 7,
        features: ['basic_monitoring', 'basic_alerts'],
      },
      basic: {
        name: 'Basic',
        price: 9.99,
        deviceLimit: 3,
        alertsEnabled: true,
        commandLimit: 1000,
        retentionDays: 30,
        features: ['basic_monitoring', 'alerts', 'remote_commands', 'api_access'],
      },
      pro: {
        name: 'Professional',
        price: 29.99,
        deviceLimit: 10,
        alertsEnabled: true,
        commandLimit: 10000,
        retentionDays: 90,
        features: ['advanced_monitoring', 'alerts', 'remote_commands', 'api_access', 'custom_scripts', 'priority_support'],
      },
      enterprise: {
        name: 'Enterprise',
        price: 99.99,
        deviceLimit: -1, // unlimited
        alertsEnabled: true,
        commandLimit: -1, // unlimited
        retentionDays: 365,
        features: ['all_features', 'sla', 'dedicated_support', 'custom_integration'],
      },
    };
  }

  /**
   * Get subscription plan details
   */
  getPlan(planId) {
    return this.plans[planId] || this.plans.free;
  }

  /**
   * Check if user can add more devices
   */
  async canAddDevice(userId) {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const user = userDoc.data();
      const plan = this.getPlan(user.subscription || 'free');

      // Count current devices
      const devicesSnapshot = await this.db.collection('devices')
        .where('userId', '==', userId)
        .where('deleted', '!=', true)
        .get();

      const currentDeviceCount = devicesSnapshot.size;

      // Check limit (-1 means unlimited)
      if (plan.deviceLimit === -1) {
        return { canAdd: true, currentCount: currentDeviceCount, limit: 'unlimited' };
      }

      return {
        canAdd: currentDeviceCount < plan.deviceLimit,
        currentCount: currentDeviceCount,
        limit: plan.deviceLimit,
      };
    } catch (error) {
      logger.error('Error checking device limit:', error);
      throw error;
    }
  }

  /**
   * Check if user can execute more commands
   */
  async canExecuteCommand(userId) {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const user = userDoc.data();
      const plan = this.getPlan(user.subscription || 'free');

      // Unlimited commands
      if (plan.commandLimit === -1) {
        return { canExecute: true, remaining: 'unlimited' };
      }

      // Count commands this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const commandsSnapshot = await this.db.collection('commands')
        .where('userId', '==', userId)
        .where('createdAt', '>=', startOfMonth)
        .get();

      const commandCount = commandsSnapshot.size;

      return {
        canExecute: commandCount < plan.commandLimit,
        remaining: plan.commandLimit - commandCount,
        limit: plan.commandLimit,
      };
    } catch (error) {
      logger.error('Error checking command limit:', error);
      throw error;
    }
  }

  /**
   * Update user subscription
   */
  async updateSubscription(userId, planId, paymentInfo = null) {
    try {
      const plan = this.getPlan(planId);
      if (!plan) {
        throw new Error('Invalid plan');
      }

      const updateData = {
        subscription: planId,
        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        deviceLimit: plan.deviceLimit,
        commandLimit: plan.commandLimit,
        features: plan.features,
      };

      if (paymentInfo) {
        updateData.paymentInfo = paymentInfo;
      }

      await this.db.collection('users').doc(userId).update(updateData);

      // Create subscription history record
      await this.db.collection('subscriptions').add({
        userId,
        planId,
        planName: plan.name,
        price: plan.price,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active',
        paymentInfo,
      });

      return { success: true, plan };
    } catch (error) {
      logger.error('Error updating subscription:', error);
      throw error;
    }
  }

  /**
   * Check feature availability
   */
  async hasFeature(userId, feature) {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        return false;
      }

      const user = userDoc.data();
      const plan = this.getPlan(user.subscription || 'free');

      return plan.features.includes(feature) || plan.features.includes('all_features');
    } catch (error) {
      logger.error('Error checking feature:', error);
      return false;
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(userId) {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const user = userDoc.data();
      const plan = this.getPlan(user.subscription || 'free');

      // Get current month's start
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Count devices
      const devicesSnapshot = await this.db.collection('devices')
        .where('userId', '==', userId)
        .where('deleted', '!=', true)
        .get();

      // Count commands this month
      const commandsSnapshot = await this.db.collection('commands')
        .where('userId', '==', userId)
        .where('createdAt', '>=', startOfMonth)
        .get();

      // Count alerts this month
      const alertsSnapshot = await this.db.collection('alerts')
        .where('userId', '==', userId)
        .where('createdAt', '>=', startOfMonth)
        .get();

      // Calculate storage usage (activities)
      const activitiesSnapshot = await this.db.collection('activities')
        .where('userId', '==', userId)
        .where('timestamp', '>=', startOfMonth)
        .get();

      return {
        subscription: user.subscription || 'free',
        plan: plan.name,
        usage: {
          devices: {
            current: devicesSnapshot.size,
            limit: plan.deviceLimit === -1 ? 'unlimited' : plan.deviceLimit,
          },
          commands: {
            current: commandsSnapshot.size,
            limit: plan.commandLimit === -1 ? 'unlimited' : plan.commandLimit,
          },
          alerts: alertsSnapshot.size,
          activities: activitiesSnapshot.size,
          retentionDays: plan.retentionDays,
        },
        features: plan.features,
      };
    } catch (error) {
      logger.error('Error getting usage stats:', error);
      throw error;
    }
  }

  /**
   * Clean up data based on retention policy
   */
  async enforceRetentionPolicy(userId) {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        return;
      }

      const user = userDoc.data();
      const plan = this.getPlan(user.subscription || 'free');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - plan.retentionDays);

      // Delete old activities
      const activitiesSnapshot = await this.db.collection('activities')
        .where('userId', '==', userId)
        .where('timestamp', '<', cutoffDate)
        .limit(500)
        .get();

      const batch = this.db.batch();
      activitiesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info(`Enforced retention policy for user ${userId}: deleted ${activitiesSnapshot.size} records`);
      return { deletedCount: activitiesSnapshot.size };
    } catch (error) {
      logger.error('Error enforcing retention policy:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId) {
    try {
      await this.db.collection('users').doc(userId).update({
        subscription: 'free',
        subscriptionCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        deviceLimit: this.plans.free.deviceLimit,
        commandLimit: this.plans.free.commandLimit,
        features: this.plans.free.features,
      });

      // Update subscription history
      const activeSubscription = await this.db.collection('subscriptions')
        .where('userId', '==', userId)
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (!activeSubscription.empty) {
        await activeSubscription.docs[0].ref.update({
          status: 'cancelled',
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return { success: true };
    } catch (error) {
      logger.error('Error cancelling subscription:', error);
      throw error;
    }
  }
}

module.exports = SubscriptionService;
