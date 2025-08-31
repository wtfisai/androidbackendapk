const { Activity } = require('../models/Activity');

// Middleware to track all API activities
const activityTracker = async (req, res, next) => {
  const startTime = Date.now();

  // Store original methods
  const originalSend = res.send;
  const originalJson = res.json;
  const originalStatus = res.status;

  let responseData = null;
  let statusCode = 200;

  // Override status method
  res.status = function (code) {
    statusCode = code;
    return originalStatus.call(this, code);
  };

  // Override send method
  res.send = function (data) {
    responseData = data;
    return originalSend.call(this, data);
  };

  // Override json method
  res.json = function (data) {
    responseData = data;
    return originalJson.call(this, data);
  };

  // Function to log activity after response
  const logActivity = async () => {
    try {
      const duration = Date.now() - startTime;

      // Determine activity type based on endpoint
      let activityType = 'api_call';
      if (req.path.includes('/shell') || req.path.includes('/adb')) {
        activityType = 'command';
      } else if (req.path.includes('/optimize') || req.path.includes('/sleep')) {
        activityType = 'optimization';
      } else if (req.path.includes('/debug')) {
        activityType = 'debug_session';
      }

      // Sanitize request body (remove sensitive data)
      const sanitizedBody = { ...req.body };
      if (sanitizedBody.password) {
        sanitizedBody.password = '***';
      }
      if (sanitizedBody.apiKey) {
        sanitizedBody.apiKey = '***';
      }

      // Sanitize response data
      let sanitizedResponse = responseData;
      if (typeof responseData === 'object' && responseData !== null) {
        sanitizedResponse = { ...responseData };
        if (sanitizedResponse.apiKey) {
          sanitizedResponse.apiKey = '***';
        }
      }

      await Activity.log({
        type: activityType,
        action: `${req.method} ${req.path}`,
        endpoint: req.path,
        method: req.method,
        userId: req.headers['x-user-id'] || 'anonymous',
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        requestBody: sanitizedBody,
        response: sanitizedResponse,
        duration,
        status: statusCode,
        error: statusCode >= 400 ? responseData : null,
        metadata: {
          query: req.query,
          params: req.params,
          headers: {
            'content-type': req.headers['content-type'],
            'x-api-key': req.headers['x-api-key'] ? '***' : undefined
          }
        }
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  };

  // Log activity after response is sent
  res.on('finish', logActivity);

  next();
};

// Middleware to track command execution
const commandTracker = (commandType) => {
  return async (req, res, next) => {
    req.commandTracking = {
      type: commandType,
      startTime: Date.now()
    };
    next();
  };
};

// Get activity statistics for dashboard
const getActivityStats = async (req, res, next) => {
  try {
    const { timeRange = '24h' } = req.query;
    const stats = await Activity.getStatistics(timeRange);
    req.activityStats = stats;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  activityTracker,
  commandTracker,
  getActivityStats
};
