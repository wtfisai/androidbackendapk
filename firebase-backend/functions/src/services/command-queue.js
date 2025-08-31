const admin = require('firebase-admin');
const { logger } = require('firebase-functions');

class CommandQueueService {
  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Create a new command for a device
   */
  async createCommand(userId, deviceId, commandData) {
    try {
      // Verify device ownership
      const deviceDoc = await this.db.collection('devices').doc(deviceId).get();
      if (!deviceDoc.exists || deviceDoc.data().userId !== userId) {
        throw new Error('Device not found or unauthorized');
      }

      // Create command document
      const command = {
        deviceId,
        userId,
        type: commandData.type,
        payload: commandData.payload || '',
        priority: commandData.priority || 0,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        retryCount: 0,
        maxRetries: 3,
      };

      const commandRef = await this.db.collection('commands').add(command);

      // Log activity
      await this.logActivity(userId, deviceId, 'command_created', {
        commandId: commandRef.id,
        type: commandData.type,
      });

      return { id: commandRef.id, ...command };
    } catch (error) {
      logger.error('Error creating command:', error);
      throw error;
    }
  }

  /**
   * Get command status
   */
  async getCommandStatus(userId, commandId) {
    try {
      const commandDoc = await this.db.collection('commands').doc(commandId).get();

      if (!commandDoc.exists) {
        throw new Error('Command not found');
      }

      const command = commandDoc.data();

      // Verify ownership
      if (command.userId !== userId) {
        throw new Error('Unauthorized');
      }

      return {
        id: commandDoc.id,
        ...command,
      };
    } catch (error) {
      logger.error('Error getting command status:', error);
      throw error;
    }
  }

  /**
   * Update command status (called by device)
   */
  async updateCommandStatus(commandId, status, result = null) {
    try {
      const updateData = {
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (result) {
        updateData.result = result;
        updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      if (status === 'failed') {
        // Increment retry count
        const commandDoc = await this.db.collection('commands').doc(commandId).get();
        const command = commandDoc.data();

        if (command.retryCount < command.maxRetries) {
          updateData.retryCount = admin.firestore.FieldValue.increment(1);
          updateData.status = 'pending'; // Reset to pending for retry
        }
      }

      await this.db.collection('commands').doc(commandId).update(updateData);

      return { success: true };
    } catch (error) {
      logger.error('Error updating command status:', error);
      throw error;
    }
  }

  /**
   * Get pending commands for a device
   */
  async getPendingCommands(deviceId, limit = 10) {
    try {
      const snapshot = await this.db.collection('commands')
        .where('deviceId', '==', deviceId)
        .where('status', '==', 'pending')
        .orderBy('priority', 'desc')
        .orderBy('createdAt', 'asc')
        .limit(limit)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      logger.error('Error getting pending commands:', error);
      throw error;
    }
  }

  /**
   * Cancel a command
   */
  async cancelCommand(userId, commandId) {
    try {
      const commandDoc = await this.db.collection('commands').doc(commandId).get();

      if (!commandDoc.exists) {
        throw new Error('Command not found');
      }

      const command = commandDoc.data();

      // Verify ownership
      if (command.userId !== userId) {
        throw new Error('Unauthorized');
      }

      // Only cancel if pending or processing
      if (!['pending', 'processing'].includes(command.status)) {
        throw new Error('Command cannot be cancelled');
      }

      await this.db.collection('commands').doc(commandId).update({
        status: 'cancelled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      logger.error('Error cancelling command:', error);
      throw error;
    }
  }

  /**
   * Batch execute commands
   */
  async batchExecute(userId, deviceId, commands) {
    try {
      const batch = this.db.batch();
      const commandIds = [];

      for (const cmd of commands) {
        const commandRef = this.db.collection('commands').doc();
        batch.set(commandRef, {
          deviceId,
          userId,
          type: cmd.type,
          payload: cmd.payload || '',
          priority: cmd.priority || 0,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          batchId: commandRef.id, // Use first command ID as batch ID
          retryCount: 0,
          maxRetries: 3,
        });
        commandIds.push(commandRef.id);
      }

      await batch.commit();

      return { commandIds };
    } catch (error) {
      logger.error('Error batch executing commands:', error);
      throw error;
    }
  }

  /**
   * Clean up old commands
   */
  async cleanupOldCommands(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const snapshot = await this.db.collection('commands')
        .where('createdAt', '<', cutoffDate)
        .where('status', 'in', ['completed', 'failed', 'cancelled'])
        .limit(500)
        .get();

      const batch = this.db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info(`Cleaned up ${snapshot.size} old commands`);
      return { deletedCount: snapshot.size };
    } catch (error) {
      logger.error('Error cleaning up old commands:', error);
      throw error;
    }
  }

  /**
   * Log activity
   */
  async logActivity(userId, deviceId, type, data) {
    try {
      await this.db.collection('activities').add({
        userId,
        deviceId,
        type,
        data,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.error('Error logging activity:', error);
      // Don't throw, just log
    }
  }
}

module.exports = CommandQueueService;
