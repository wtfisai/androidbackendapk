const config = require('../config');

const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== config.apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
  }

  next();
};

// Export both names for compatibility
module.exports = {
  authenticate: authenticateApiKey,
  authenticateApiKey
};
