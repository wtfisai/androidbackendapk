const Datastore = require('nedb');
const path = require('path');

// Initialize databases
const activities = new Datastore({
  filename: path.join(__dirname, '../../data/activities.db'),
  autoload: true
});

const debugTraces = new Datastore({
  filename: path.join(__dirname, '../../data/debug_traces.db'),
  autoload: true
});

const processLogs = new Datastore({
  filename: path.join(__dirname, '../../data/process_logs.db'),
  autoload: true
});

// Create indexes for better query performance
activities.ensureIndex({ fieldName: 'timestamp' });
activities.ensureIndex({ fieldName: 'type' });
activities.ensureIndex({ fieldName: 'userId' });

debugTraces.ensureIndex({ fieldName: 'sessionId' });
debugTraces.ensureIndex({ fieldName: 'processId' });
debugTraces.ensureIndex({ fieldName: 'timestamp' });

processLogs.ensureIndex({ fieldName: 'pid' });
processLogs.ensureIndex({ fieldName: 'status' });

// Activity tracking model
class Activity {
  static async log(data) {
    const activity = {
      timestamp: new Date(),
      type: data.type, // 'api_call', 'command', 'optimization', 'debug_session'
      action: data.action,
      endpoint: data.endpoint,
      method: data.method,
      userId: data.userId || 'anonymous',
      ip: data.ip,
      userAgent: data.userAgent,
      requestBody: data.requestBody,
      response: data.response,
      duration: data.duration,
      status: data.status,
      error: data.error || null,
      metadata: data.metadata || {}
    };

    return new Promise((resolve, reject) => {
      activities.insert(activity, (err, doc) => {
        if (err) {
          reject(err);
        } else {
          resolve(doc);
        }
      });
    });
  }

  static async getActivities(filter = {}, limit = 100) {
    return new Promise((resolve, reject) => {
      activities
        .find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .exec((err, docs) => {
          if (err) {
            reject(err);
          } else {
            resolve(docs);
          }
        });
    });
  }

  static async getStatistics(timeRange = '24h') {
    const timeMap = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    const since = new Date(Date.now() - (timeMap[timeRange] || timeMap['24h']));

    return new Promise((resolve, reject) => {
      activities.find({ timestamp: { $gte: since } }, (err, docs) => {
        if (err) {
          reject(err);
        } else {
          const stats = {
            totalActivities: docs.length,
            byType: {},
            byEndpoint: {},
            errorCount: 0,
            avgDuration: 0,
            topActions: []
          };

          let totalDuration = 0;
          const actionCounts = {};

          docs.forEach((doc) => {
            // Count by type
            stats.byType[doc.type] = (stats.byType[doc.type] || 0) + 1;

            // Count by endpoint
            if (doc.endpoint) {
              stats.byEndpoint[doc.endpoint] = (stats.byEndpoint[doc.endpoint] || 0) + 1;
            }

            // Count errors
            if (doc.error) {
              stats.errorCount++;
            }

            // Sum duration
            if (doc.duration) {
              totalDuration += doc.duration;
            }

            // Count actions
            if (doc.action) {
              actionCounts[doc.action] = (actionCounts[doc.action] || 0) + 1;
            }
          });

          // Calculate average duration
          const docsWithDuration = docs.filter((d) => d.duration).length;
          stats.avgDuration = docsWithDuration > 0 ? totalDuration / docsWithDuration : 0;

          // Get top 10 actions
          stats.topActions = Object.entries(actionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([action, count]) => ({ action, count }));

          resolve(stats);
        }
      });
    });
  }

  static async cleanup(daysToKeep = 30) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    return new Promise((resolve, reject) => {
      activities.remove({ timestamp: { $lt: cutoffDate } }, { multi: true }, (err, numRemoved) => {
        if (err) {
          reject(err);
        } else {
          resolve(numRemoved);
        }
      });
    });
  }
}

// Debug trace model
class DebugTrace {
  static async startSession(processInfo) {
    const session = {
      sessionId: `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      processId: processInfo.pid,
      processName: processInfo.name,
      packageName: processInfo.packageName,
      startTime: new Date(),
      endTime: null,
      status: 'active',
      traces: [],
      stackTraces: [],
      memorySnapshots: [],
      cpuSnapshots: [],
      networkActivity: [],
      metadata: processInfo.metadata || {}
    };

    return new Promise((resolve, reject) => {
      debugTraces.insert(session, (err, doc) => {
        if (err) {
          reject(err);
        } else {
          resolve(doc);
        }
      });
    });
  }

  static async addTrace(sessionId, traceData) {
    const trace = {
      timestamp: new Date(),
      type: traceData.type, // 'method_call', 'exception', 'network', 'database', 'file_io'
      thread: traceData.thread,
      className: traceData.className,
      methodName: traceData.methodName,
      parameters: traceData.parameters,
      returnValue: traceData.returnValue,
      duration: traceData.duration,
      stackTrace: traceData.stackTrace,
      metadata: traceData.metadata || {}
    };

    return new Promise((resolve, reject) => {
      debugTraces.update({ sessionId }, { $push: { traces: trace } }, {}, (err, numUpdated) => {
        if (err) {
          reject(err);
        } else {
          resolve(numUpdated);
        }
      });
    });
  }

  static async addSnapshot(sessionId, snapshotType, data) {
    const snapshot = {
      timestamp: new Date(),
      data
    };

    const field =
      snapshotType === 'memory'
        ? 'memorySnapshots'
        : snapshotType === 'cpu'
          ? 'cpuSnapshots'
          : snapshotType === 'network'
            ? 'networkActivity'
            : null;

    if (!field) {
      return Promise.reject(new Error('Invalid snapshot type'));
    }

    return new Promise((resolve, reject) => {
      debugTraces.update({ sessionId }, { $push: { [field]: snapshot } }, {}, (err, numUpdated) => {
        if (err) {
          reject(err);
        } else {
          resolve(numUpdated);
        }
      });
    });
  }

  static async endSession(sessionId) {
    return new Promise((resolve, reject) => {
      debugTraces.update(
        { sessionId },
        { $set: { endTime: new Date(), status: 'completed' } },
        {},
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

  static async getSession(sessionId) {
    return new Promise((resolve, reject) => {
      debugTraces.findOne({ sessionId }, (err, doc) => {
        if (err) {
          reject(err);
        } else {
          resolve(doc);
        }
      });
    });
  }

  static async getActiveSessions() {
    return new Promise((resolve, reject) => {
      debugTraces.find({ status: 'active' }, (err, docs) => {
        if (err) {
          reject(err);
        } else {
          resolve(docs);
        }
      });
    });
  }

  static async getAllSessions(limit = 50) {
    return new Promise((resolve, reject) => {
      debugTraces
        .find({})
        .sort({ startTime: -1 })
        .limit(limit)
        .exec((err, docs) => {
          if (err) {
            reject(err);
          } else {
            resolve(docs);
          }
        });
    });
  }
}

// Process management model
class ProcessLog {
  static async logAction(data) {
    const log = {
      timestamp: new Date(),
      pid: data.pid,
      name: data.name,
      action: data.action, // 'sleep', 'wake', 'kill', 'restart', 'debug_attach'
      status: data.status, // 'success', 'failed', 'pending'
      previousState: data.previousState,
      newState: data.newState,
      cpuBefore: data.cpuBefore,
      cpuAfter: data.cpuAfter,
      memoryBefore: data.memoryBefore,
      memoryAfter: data.memoryAfter,
      error: data.error || null,
      metadata: data.metadata || {}
    };

    return new Promise((resolve, reject) => {
      processLogs.insert(log, (err, doc) => {
        if (err) {
          reject(err);
        } else {
          resolve(doc);
        }
      });
    });
  }

  static async getProcessHistory(pid) {
    return new Promise((resolve, reject) => {
      processLogs
        .find({ pid })
        .sort({ timestamp: -1 })
        .exec((err, docs) => {
          if (err) {
            reject(err);
          } else {
            resolve(docs);
          }
        });
    });
  }

  static async getOptimizationHistory(limit = 100) {
    return new Promise((resolve, reject) => {
      processLogs
        .find({ action: { $in: ['sleep', 'wake', 'kill'] } })
        .sort({ timestamp: -1 })
        .limit(limit)
        .exec((err, docs) => {
          if (err) {
            reject(err);
          } else {
            resolve(docs);
          }
        });
    });
  }

  static async getOptimizationStats() {
    return new Promise((resolve, reject) => {
      processLogs.find({}, (err, docs) => {
        if (err) {
          reject(err);
        } else {
          const stats = {
            totalActions: docs.length,
            byAction: {},
            successRate: 0,
            averageMemorySaved: 0,
            averageCpuReduced: 0,
            topOptimizedProcesses: []
          };

          let successCount = 0;
          let totalMemorySaved = 0;
          let totalCpuReduced = 0;
          let validMemoryOps = 0;
          let validCpuOps = 0;
          const processCounts = {};

          docs.forEach((doc) => {
            // Count by action
            stats.byAction[doc.action] = (stats.byAction[doc.action] || 0) + 1;

            // Count successes
            if (doc.status === 'success') {
              successCount++;
            }

            // Calculate memory saved
            if (doc.memoryBefore && doc.memoryAfter) {
              totalMemorySaved += doc.memoryBefore - doc.memoryAfter;
              validMemoryOps++;
            }

            // Calculate CPU reduced
            if (doc.cpuBefore && doc.cpuAfter) {
              totalCpuReduced += doc.cpuBefore - doc.cpuAfter;
              validCpuOps++;
            }

            // Count process optimizations
            if (doc.name) {
              processCounts[doc.name] = (processCounts[doc.name] || 0) + 1;
            }
          });

          // Calculate averages
          stats.successRate = docs.length > 0 ? (successCount / docs.length) * 100 : 0;
          stats.averageMemorySaved = validMemoryOps > 0 ? totalMemorySaved / validMemoryOps : 0;
          stats.averageCpuReduced = validCpuOps > 0 ? totalCpuReduced / validCpuOps : 0;

          // Get top optimized processes
          stats.topOptimizedProcesses = Object.entries(processCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

          resolve(stats);
        }
      });
    });
  }
}

module.exports = {
  Activity,
  DebugTrace,
  ProcessLog
};
