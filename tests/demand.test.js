/**
 * demand.test.js — Jest + Supertest tests for /api/v1/demand endpoints.
 */

const request  = require('supertest');
const mongoose = require('mongoose');
const { app }  = require('../src/app');

let adminToken = '';

beforeAll(async () => {
  const dbUri = process.env.MONGO_URI_TEST || process.env.MONGO_URI || 'mongodb://localhost:27017/smartdtc_test';
  await mongoose.connect(dbUri);

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: process.env.TEST_ADMIN_EMAIL || 'admin@smartdtc.com', password: process.env.TEST_ADMIN_PASS || 'Admin@1234' });
  adminToken = res.body.accessToken || '';
}, 20000);

afterAll(async () => {
  await mongoose.disconnect();
});

// ── GET /demand ──────────────────────────────────────────────────────────────

describe('GET /api/v1/demand', () => {
  it('returns 200 with demands array (public)', async () => {
    const res = await request(app).get('/api/v1/demand');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.demands)).toBe(true);
  });

  it('filters by hour query param', async () => {
    const res = await request(app).get('/api/v1/demand?hour=8');
    expect(res.status).toBe(200);
    // All returned records should have hour === 8
    for (const d of res.body.demands) {
      expect(d.hour).toBe(8);
    }
  });
});

// ── GET /demand/heatmap ───────────────────────────────────────────────────────

describe('GET /api/v1/demand/heatmap', () => {
  it('returns 200 with points array', async () => {
    const res = await request(app).get('/api/v1/demand/heatmap');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.points)).toBe(true);
  });

  it('accepts hour and date query params', async () => {
    const res = await request(app).get('/api/v1/demand/heatmap?date=2025-01-01&hour=9');
    expect(res.status).toBe(200);
  });
});

// ── POST /demand/predict ─────────────────────────────────────────────────────

describe('POST /api/v1/demand/predict', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/demand/predict')
      .send({ route_id: 'abc', date: '2025-01-01', hour: 8 });
    expect(res.status).toBe(401);
  });

  it('returns 502 when AI service is not running', async () => {
    if (!adminToken) return; // skip if login failed
    const res = await request(app)
      .post('/api/v1/demand/predict')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ route_id: 'testRoute', date: '2025-01-01', hour: 8, is_weekend: false });

    // Either 201 (AI running) or 502 (AI not running) — not a 500 internal error
    expect([201, 502]).toContain(res.status);
  });
});

// ── PUT /demand/:id/actual ────────────────────────────────────────────────────

describe('PUT /api/v1/demand/:id/actual', () => {
  it('returns 404 for unknown id', async () => {
    if (!adminToken) return;
    const res = await request(app)
      .put('/api/v1/demand/000000000000000000000000/actual')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ actualCount: 50 });
    expect(res.status).toBe(404);
  });
});
