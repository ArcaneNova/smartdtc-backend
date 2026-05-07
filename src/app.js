const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
require('dotenv').config();

const { initSocket } = require('./config/socket');
const logger = require('./utils/logger');
const errorMiddleware = require('./middleware/error.middleware');

// Route imports
const authRoutes      = require('./routes/auth.routes');
const routeRoutes     = require('./routes/route.routes');
const stageRoutes     = require('./routes/stage.routes');
const busRoutes       = require('./routes/bus.routes');
const driverRoutes    = require('./routes/driver.routes');
const scheduleRoutes  = require('./routes/schedule.routes');
const trackingRoutes  = require('./routes/tracking.routes');
const demandRoutes    = require('./routes/demand.routes');
const alertRoutes     = require('./routes/alert.routes');
const reportRoutes    = require('./routes/report.routes');
const mobileRoutes    = require('./routes/mobile.routes');
const publicRoutes    = require('./routes/public.routes');
const adminRoutes     = require('./routes/admin.routes');

// AI proxy router — forwards /api/v1/ai/* to Python AI microservice
const { Router } = express;
const axios = require('axios');
const aiProxy = Router();
const AI_URL = process.env.AI_SERVICE_URL || process.env.PYTHON_AI_URL || 'http://localhost:8000';

const _proxyError = (res, path, err) => {
  const status = err.response?.status || (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' ? 503 : 500);
  const raw    = err.response?.data?.detail || err.response?.data?.message || err.message;
  // Pydantic 422 returns detail as an array of {type,loc,msg,input} — flatten to a readable string
  const detail = Array.isArray(raw)
    ? raw.map(e => `${e.msg ?? e.type ?? JSON.stringify(e)} (${(e.loc ?? []).join('.')})`).join('; ')
    : (raw ?? 'Unknown AI error');
  return res.status(status).json({
    success: false,
    message: `AI ${path} prediction failed`,
    error:   detail,
    ai_url:  AI_URL,
  });
};

const _proxyMap = { demand: '/predict/demand', delay: '/predict/delay', eta: '/predict/eta', fare: '/predict/fare' };
Object.entries(_proxyMap).forEach(([path, target]) => {
  aiProxy.post(`/${path}`, async (req, res) => {
    try {
      const { data } = await axios.post(`${AI_URL}${target}`, req.body, { timeout: 15000 });
      res.json({ success: true, ...data });
    } catch (e) { _proxyError(res, path, e); }
  });
});
aiProxy.post('/anomaly', async (req, res) => {
  try {
    const { data } = await axios.post(`${AI_URL}/detect/anomaly`, req.body, { timeout: 15000 });
    res.json({ success: true, ...data });
  } catch (e) { _proxyError(res, 'anomaly', e); }
});
// GET /api/v1/ai/models/comparison — full report of all loaded models + metrics
aiProxy.get('/models/comparison', async (req, res) => {
  try {
    const { data } = await axios.get(`${AI_URL}/models/comparison`, { timeout: 15000 });
    res.json({ success: true, ...data });
  } catch (e) { _proxyError(res, 'models/comparison', e); }
});
// GET /api/v1/ai/health — AI service health passthrough
aiProxy.get('/health', async (req, res) => {
  try {
    const { data } = await axios.get(`${AI_URL}/health`, { timeout: 8000 });
    res.json({ success: true, ...data });
  } catch (e) { _proxyError(res, 'health', e); }
});

const app = express();
const server = http.createServer(app);

// ── Init Socket.io ──────────────────────────────────────────────────────────
initSocket(server);

// ── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: true, // reflect request origin — allows all (dev mode)

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));

// Sanitise against NoSQL injection (mongo-sanitize)
// express-mongo-sanitize tries to reassign req.query which is a read-only getter
// in Express 5 — so we manually sanitize only req.body and req.params instead.
app.use((req, res, next) => {
  if (req.body)   req.body   = mongoSanitize.sanitize(req.body);
  if (req.params) req.params = mongoSanitize.sanitize(req.params);
  next();
});

// ── Rate Limiting (tiered by role / endpoint sensitivity) ──────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

const exportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Export rate limit exceeded. Try again in 5 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

app.use('/api/', globalLimiter);
app.use('/api/v1/auth/login',    authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/reports/export', exportLimiter);

// ── General Middleware ──────────────────────────────────────────────────────
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/v1/auth',     authRoutes);
app.use('/api/v1/routes',   routeRoutes);
app.use('/api/v1/stages',   stageRoutes);
app.use('/api/v1/buses',    busRoutes);
app.use('/api/v1/drivers',  driverRoutes);
app.use('/api/v1/schedule', scheduleRoutes);
app.use('/api/v1/tracking', trackingRoutes);
app.use('/api/v1/demand',   demandRoutes);
app.use('/api/v1/alerts',   alertRoutes);
app.use('/api/v1/reports',  reportRoutes);
app.use('/api/v1/mobile',   mobileRoutes);
app.use('/api/v1/public',   publicRoutes);
app.use('/api/v1/admin',    adminRoutes);
app.use('/api/v1/ai',       aiProxy);

// ── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// ── Global Error Handler ────────────────────────────────────────────────────
app.use(errorMiddleware);

module.exports = { app, server };
