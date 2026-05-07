/**
 * redis.js — ioredis client singleton
 * Falls back to a no-op stub when REDIS_URL is not configured so the server
 * can start without Redis during development/testing.
 */

let redis;

if (process.env.REDIS_URL) {
  const Redis = require('ioredis');
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue:   false,
    lazyConnect:          true,
  });

  redis.on('connect',    () => console.log('✅  Redis connected'));
  redis.on('error',      (err) => console.error('Redis error:', err.message));
  redis.on('reconnecting', () => console.warn('⚠️  Redis reconnecting…'));
} else {
  // No-op stub — safe to use even without Redis
  const noop = async () => null;
  redis = {
    get:    noop,
    set:    noop,
    setex:  noop,
    del:    noop,
    keys:   async () => [],
    flushdb: noop,
    quit:   noop,
  };
  console.info('ℹ️  REDIS_URL not set — running without cache.');
}

module.exports = redis;
