/**
 * notification.service.js
 * Sends push notifications via the Expo Push Notification API.
 * Also integrates optional Firebase Admin SDK for FCM direct delivery.
 *
 * Expo documentation: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const axios = require('axios');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a single push notification to an Expo push token.
 * @param {string} to       Expo push token  (ExponentPushToken[xxx…])
 * @param {string} title    Notification title
 * @param {string} body     Notification body text
 * @param {object} data     Optional extra payload (available in the app)
 * @param {string} sound    'default' | null
 */
const sendPushNotification = async (to, title, body, data = {}, sound = 'default') => {
  if (!to || !to.startsWith('ExponentPushToken')) {
    console.warn(`[Notification] Invalid Expo push token: ${to}`);
    return null;
  }

  const message = { to, title, body, data, sound };

  try {
    const res = await axios.post(EXPO_PUSH_URL, message, {
      headers: {
        'Accept':       'application/json',
        'Content-Type': 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN && {
          Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
        }),
      },
    });
    return res.data;
  } catch (err) {
    console.error('[Notification] Expo push failed:', err.message);
    return null;
  }
};

/**
 * Send push notifications in batch (up to 100 per request per Expo limits).
 * @param {Array<{to, title, body, data}>} messages
 */
const sendBatchNotifications = async (messages) => {
  const validMessages = messages.filter(m => m.to && m.to.startsWith('ExponentPushToken'));
  if (!validMessages.length) return [];

  // Expo batch limit = 100
  const chunks = [];
  for (let i = 0; i < validMessages.length; i += 100) {
    chunks.push(validMessages.slice(i, i + 100));
  }

  const results = [];
  for (const chunk of chunks) {
    try {
      const res = await axios.post(EXPO_PUSH_URL, chunk, {
        headers: {
          'Accept':       'application/json',
          'Content-Type': 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN && {
            Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
          }),
        },
      });
      results.push(...(res.data.data || []));
    } catch (err) {
      console.error('[Notification] Batch push failed:', err.message);
    }
  }

  return results;
};

/**
 * Notify all passengers on a route about a delay.
 * @param {object} opts  { routeId, routeName, delayMinutes, PushToken (Mongoose model) }
 */
const notifyRouteDelay = async ({ routeId, routeName, delayMinutes, PushToken }) => {
  try {
    const tokens = await PushToken.find({ subscribedRoutes: routeId }).select('token').lean();
    const messages = tokens.map(t => ({
      to:    t.token,
      title: `⚠️ Delay on ${routeName}`,
      body:  `Bus is running approximately ${delayMinutes} min late.`,
      data:  { routeId, type: 'delay', delayMinutes },
    }));
    return sendBatchNotifications(messages);
  } catch (err) {
    console.error('[Notification] notifyRouteDelay failed:', err.message);
    return [];
  }
};

/**
 * Send an alert notification to all admin/dispatcher tokens.
 * @param {object} opts  { alertMessage, severity, PushToken }
 */
const notifyAdmins = async ({ alertMessage, severity = 'warning', PushToken }) => {
  try {
    const tokens = await PushToken.find({ role: { $in: ['admin', 'dispatcher'] } }).select('token').lean();
    const messages = tokens.map(t => ({
      to:    t.token,
      title: severity === 'critical' ? '🚨 Critical Alert' : '⚠️ System Alert',
      body:  alertMessage,
      data:  { type: 'alert', severity },
      sound: severity === 'critical' ? 'default' : null,
    }));
    return sendBatchNotifications(messages);
  } catch (err) {
    console.error('[Notification] notifyAdmins failed:', err.message);
    return [];
  }
};

module.exports = {
  sendPushNotification,
  sendBatchNotifications,
  notifyRouteDelay,
  notifyAdmins,
};
