/**
 * cache.middleware.js
 * Express middleware for Redis response caching.
 *
 * Usage:
 *   router.get('/heavy-route', cache(60), ctrl.heavyHandler);
 *
 * @param {number} ttlSeconds  Cache TTL in seconds (default 30)
 */
const redis = require('../config/redis');

const cache = (ttlSeconds = 30) => async (req, res, next) => {
  // Only cache GET requests
  if (req.method !== 'GET') return next();

  const key = `cache:${req.originalUrl}`;

  try {
    const cached = await redis.get(key);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(JSON.parse(cached));
    }
  } catch {
    // Redis unavailable — skip cache
    return next();
  }

  // Intercept res.json to store the response
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Only cache successful responses
    if (res.statusCode >= 200 && res.statusCode < 300) {
      redis.setex(key, ttlSeconds, JSON.stringify(body)).catch(() => {});
    }
    res.setHeader('X-Cache', 'MISS');
    return originalJson(body);
  };

  next();
};

/**
 * Invalidate cache keys matching a pattern.
 * @param {string} pattern  e.g. '/api/v1/schedule*'
 */
const invalidateCache = async (pattern) => {
  try {
    const keys = await redis.keys(`cache:${pattern}`);
    if (keys.length) await Promise.all(keys.map(k => redis.del(k)));
  } catch {
    // Silently fail
  }
};

module.exports = { cache, invalidateCache };
