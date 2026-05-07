/**
 * audit.middleware.js
 * Middleware factory that logs write actions to the AuditLog collection.
 *
 * Usage:
 *   router.post('/schedule', protect, audit('Schedule', 'CREATE'), ctrl.createSchedule);
 *   router.put('/:id',       protect, audit('Schedule', 'UPDATE'), ctrl.updateSchedule);
 *   router.delete('/:id',    protect, audit('Schedule', 'DELETE'), ctrl.deleteSchedule);
 */

const AuditLog = require('../models/AuditLog');

/**
 * @param {string} resource  Model/resource name e.g. 'Schedule', 'Driver'
 * @param {string} action    One of CREATE | UPDATE | DELETE | ASSIGN | EXPORT | RETRAIN
 */
const audit = (resource, action) => async (req, res, next) => {
  // Capture the original json method to intercept the response
  const originalJson = res.json.bind(res);

  res.json = async (body) => {
    // Only audit successful mutations
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
      try {
        await AuditLog.create({
          actor:      req.user._id,
          actorName:  req.user.name,
          actorRole:  req.user.role,
          action,
          resource,
          resourceId: req.params?.id || body?.[resource.toLowerCase()]?._id?.toString() || null,
          diff: {
            requestBody: req.body,
          },
          ip:        req.ip || req.headers['x-forwarded-for'],
          userAgent: req.headers['user-agent'],
          metadata: {
            method: req.method,
            path:   req.originalUrl,
          },
        });
      } catch (err) {
        console.error('[Audit] Failed to write audit log:', err.message);
        // Non-fatal — do not block the response
      }
    }
    return originalJson(body);
  };

  next();
};

module.exports = audit;
