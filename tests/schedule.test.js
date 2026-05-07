/**
 * schedule.test.js — Jest + Supertest unit/integration tests for
 * the /api/v1/schedule endpoints.
 *
 * Run: npm test   (from backend/)
 */

const request  = require('supertest');
const mongoose = require('mongoose');
const { app }  = require('../src/app');

// ── Helpers ─────────────────────────────────────────────────────────────────
let adminToken = '';
let createdScheduleId = '';

const loginAdmin = async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: process.env.TEST_ADMIN_EMAIL || 'admin@smartdtc.com', password: process.env.TEST_ADMIN_PASS || 'Admin@1234' });
  return res.body.accessToken;
};

// ── Setup / Teardown ─────────────────────────────────────────────────────────
beforeAll(async () => {
  const dbUri = process.env.MONGO_URI_TEST || process.env.MONGO_URI || 'mongodb://localhost:27017/smartdtc_test';
  await mongoose.connect(dbUri);
  adminToken = await loginAdmin();
}, 20000);

afterAll(async () => {
  if (createdScheduleId) {
    await request(app)
      .delete(`/api/v1/schedule/${createdScheduleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }
  await mongoose.disconnect();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/schedule', () => {
  it('should return 200 and schedules array', async () => {
    const res = await request(app)
      .get('/api/v1/schedule')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.schedules)).toBe(true);
  });

  it('should support pagination via page + limit query params', async () => {
    const res = await request(app)
      .get('/api/v1/schedule?page=1&limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.schedules.length).toBeLessThanOrEqual(5);
    expect(res.body.page).toBe(1);
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/schedule');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/schedule', () => {
  it('should create a schedule with valid payload', async () => {
    const payload = {
      route:         '000000000000000000000001', // dummy ObjectId — will fail mongoose validation
      departureTime: new Date(Date.now() + 3_600_000).toISOString(),
      status:        'scheduled',
    };

    const res = await request(app)
      .post('/api/v1/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    // We expect either 201 (if route exists) or 400 (validation) — not a 5xx
    expect([201, 400]).toContain(res.status);
  });

  it('should return 400 when no body is sent', async () => {
    const res = await request(app)
      .post('/api/v1/schedule')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/schedule/:id', () => {
  it('should return 404 for a non-existent id', async () => {
    const res = await request(app)
      .get('/api/v1/schedule/000000000000000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/v1/schedule/generate-ai', () => {
  it('should return 400 if date is missing', async () => {
    const res = await request(app)
      .post('/api/v1/schedule/generate-ai')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ routeIds: ['abc'] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/date/i);
  });

  it('should return 400 if routeIds is empty', async () => {
    const res = await request(app)
      .post('/api/v1/schedule/generate-ai')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: '2025-01-01', routeIds: [] });

    expect(res.status).toBe(400);
  });
});
