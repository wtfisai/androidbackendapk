const Datastore = require('nedb');
const path = require('path');

// Initialize permissions database
const permissions = new Datastore({
  filename: path.join(__dirname, '../../data/permissions.db'),
  autoload: true
});

// Create indexes
permissions.ensureIndex({ fieldName: 'permissionName' });
permissions.ensureIndex({ fieldName: 'timestamp' });

class PermissionStatus {
  // Grant a permission and save status
  static async grant(permissionName, method = 'unknown', metadata = {}) {
    const permissionRecord = {
      permissionName,
      granted: true,
      method,
      timestamp: new Date(),
      userConfirmed: true,
      metadata
    };

    return new Promise((resolve, reject) => {
      // Update if exists, insert if not
      permissions.update(
        { permissionName }, 
        permissionRecord, 
        { upsert: true }, 
        (err, numReplaced) => {
          if (err) {
            reject(err);
          } else {
            resolve(permissionRecord);
          }
        }
      );
    });
  }

  // Revoke a permission
  static async revoke(permissionName) {
    return new Promise((resolve, reject) => {
      permissions.update(
        { permissionName },
        { $set: { granted: false, revokedAt: new Date() } },
        {},
        (err, numUpdated) => {
          if (err) {
            reject(err);
          } else {
            resolve(numUpdated > 0);
          }
        }
      );
    });
  }

  // Check if a permission is granted
  static async isGranted(permissionName) {
    return new Promise((resolve, reject) => {
      permissions.findOne({ permissionName, granted: true }, (err, doc) => {
        if (err) {
          reject(err);
        } else {
          resolve(!!doc);
        }
      });
    });
  }

  // Get all permission statuses
  static async getAllStatuses() {
    return new Promise((resolve, reject) => {
      permissions.find({}, (err, docs) => {
        if (err) {
          reject(err);
        } else {
          const statusMap = {};
          docs.forEach(doc => {
            statusMap[doc.permissionName] = {
              granted: doc.granted,
              method: doc.method,
              timestamp: doc.timestamp,
              userConfirmed: doc.userConfirmed,
              metadata: doc.metadata
            };
          });
          resolve(statusMap);
        }
      });
    });
  }

  // Get permissions granted by method
  static async getByMethod(method) {
    return new Promise((resolve, reject) => {
      permissions.find({ method, granted: true }, (err, docs) => {
        if (err) {
          reject(err);
        } else {
          resolve(docs);
        }
      });
    });
  }

  // Set user confirmation for a permission (for UI tracking)
  static async setUserConfirmation(permissionName, confirmed = true) {
    return new Promise((resolve, reject) => {
      permissions.update(
        { permissionName },
        { 
          $set: { 
            userConfirmed: confirmed, 
            confirmationTimestamp: new Date() 
          } 
        },
        { upsert: true },
        (err, numUpdated) => {
          if (err) {
            reject(err);
          } else {
            resolve(numUpdated);
          }
        }
      );
    });
  }

  // Check if user has confirmed a permission (even if not actually granted yet)
  static async isUserConfirmed(permissionName) {
    return new Promise((resolve, reject) => {
      permissions.findOne({ permissionName }, (err, doc) => {
        if (err) {
          reject(err);
        } else {
          resolve(doc ? doc.userConfirmed === true : false);
        }
      });
    });
  }

  // Get permission statistics
  static async getStats() {
    return new Promise((resolve, reject) => {
      permissions.find({}, (err, docs) => {
        if (err) {
          reject(err);
        } else {
          const stats = {
            total: docs.length,
            granted: docs.filter(d => d.granted).length,
            revoked: docs.filter(d => !d.granted && d.revokedAt).length,
            pending: docs.filter(d => d.userConfirmed && !d.granted).length,
            byMethod: {},
            recent: docs
              .filter(d => d.granted)
              .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
              .slice(0, 5)
          };

          docs.forEach(doc => {
            if (doc.granted) {
              stats.byMethod[doc.method] = (stats.byMethod[doc.method] || 0) + 1;
            }
          });

          resolve(stats);
        }
      });
    });
  }

  // Clean up old revoked permissions
  static async cleanup(daysToKeep = 90) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    return new Promise((resolve, reject) => {
      permissions.remove(
        { 
          granted: false, 
          revokedAt: { $lt: cutoffDate } 
        }, 
        { multi: true }, 
        (err, numRemoved) => {
          if (err) {
            reject(err);
          } else {
            resolve(numRemoved);
          }
        }
      );
    });
  }
}

module.exports = { PermissionStatus };