const config = require('../config');

const requestCounts = new Map();

const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const { windowMs, maxRequests } = config.rateLimit;

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, {
      count: 1,
      resetTime: now + windowMs
    });
    return next();
  }

  const requestData = requestCounts.get(ip);

  if (now > requestData.resetTime) {
    requestData.count = 1;
    requestData.resetTime = now + windowMs;
  } else {
    requestData.count++;
    if (requestData.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((requestData.resetTime - now) / 1000)
      });
    }
  }

  next();
};

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of requestCounts.entries()) {
    if (now > data.resetTime) {
      requestCounts.delete(ip);
    }
  }
}, 60000); // Clean every minute

module.exports = { rateLimit };
