const Datastore = require('nedb');
const path = require('path');

// Create database instance for debug sessions
const db = new Datastore({
  filename: path.join(__dirname, '..', '..', 'data', 'debug_sessions.db'),
  autoload: true
});

// Indexes for better performance
db.ensureIndex({ fieldName: 'sessionId', unique: true });
db.ensureIndex({ fieldName: 'startTime' });
db.ensureIndex({ fieldName: 'status' });

class DebugSession {
  static async create(data) {
    return new Promise((resolve, reject) => {
      const session = {
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        startTime: new Date(),
        status: 'active',
        type: data.type || 'general',
        description: data.description || '',
        logs: [],
        streamLogs: [],
        metadata: data.metadata || {},
        ...data
      };

      db.insert(session, (err, newDoc) => {
        if (err) {
          reject(err);
        } else {
          resolve(newDoc);
        }
      });
    });
  }

  static async get(sessionId) {
    return new Promise((resolve, reject) => {
      db.findOne({ sessionId }, (err, doc) => {
        if (err) {
          reject(err);
        } else {
          resolve(doc);
        }
      });
    });
  }

  static async getAll(filter = {}) {
    return new Promise((resolve, reject) => {
      db.find(filter)
        .sort({ startTime: -1 })
        .limit(100)
        .exec((err, docs) => {
          if (err) {
            reject(err);
          } else {
            resolve(docs);
          }
        });
    });
  }

  static async update(sessionId, updates) {
    return new Promise((resolve, reject) => {
      db.update(
        { sessionId },
        { $set: updates },
        { returnUpdatedDocs: true },
        (err, numReplaced, updatedDoc) => {
          if (err) {
            reject(err);
          } else {
            resolve(updatedDoc);
          }
        }
      );
    });
  }

  static async addLog(sessionId, logEntry) {
    return new Promise((resolve, reject) => {
      const entry = {
        timestamp: new Date(),
        ...logEntry
      };

      db.update({ sessionId }, { $push: { logs: entry } }, {}, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(entry);
        }
      });
    });
  }

  static async addStreamLog(sessionId, streamEntry) {
    return new Promise((resolve, reject) => {
      const entry = {
        timestamp: new Date(),
        ...streamEntry
      };

      db.update({ sessionId }, { $push: { streamLogs: entry } }, {}, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(entry);
        }
      });
    });
  }

  static async stop(sessionId) {
    return new Promise((resolve, reject) => {
      const updates = {
        status: 'stopped',
        endTime: new Date()
      };

      db.update(
        { sessionId },
        { $set: updates },
        { returnUpdatedDocs: true },
        (err, numReplaced, updatedDoc) => {
          if (err) {
            reject(err);
          } else {
            resolve(updatedDoc);
          }
        }
      );
    });
  }

  static async delete(sessionId) {
    return new Promise((resolve, reject) => {
      db.remove({ sessionId }, {}, (err, numRemoved) => {
        if (err) {
          reject(err);
        } else {
          resolve(numRemoved);
        }
      });
    });
  }

  static async cleanup(olderThanDays = 7) {
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      db.remove({ startTime: { $lt: cutoffDate } }, { multi: true }, (err, numRemoved) => {
        if (err) {
          reject(err);
        } else {
          resolve(numRemoved);
        }
      });
    });
  }

  static async getStats() {
    return new Promise((resolve, reject) => {
      db.find({}, (err, docs) => {
        if (err) {
          reject(err);
          return;
        }

        const stats = {
          total: docs.length,
          active: docs.filter((d) => d.status === 'active').length,
          stopped: docs.filter((d) => d.status === 'stopped').length,
          byType: {},
          recentSessions: []
        };

        // Group by type
        docs.forEach((doc) => {
          const type = doc.type || 'unknown';
          if (!stats.byType[type]) {
            stats.byType[type] = 0;
          }
          stats.byType[type]++;
        });

        // Get recent sessions
        stats.recentSessions = docs
          .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
          .slice(0, 10)
          .map((s) => ({
            sessionId: s.sessionId,
            type: s.type,
            status: s.status,
            startTime: s.startTime,
            logCount: s.logs?.length || 0
          }));

        resolve(stats);
      });
    });
  }
}

// Clean up old sessions periodically
setInterval(
  () => {
    DebugSession.cleanup(7).catch(console.error);
  },
  24 * 60 * 60 * 1000
); // Once per day

module.exports = { DebugSession };
