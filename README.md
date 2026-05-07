# SmartDTC Backend API

Node.js / Express REST API + Socket.io real-time server for the SmartDTC AI-Driven Bus Scheduling System.

- **Port:** 5000 (default)
- **Database:** MongoDB Atlas (free tier supported)
- **Cache:** Redis (optional — falls back to no-op stub)
- **Auth:** JWT access token (15 min) + refresh token (7 days) via HttpOnly cookies

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Prerequisites](#prerequisites)
4. [Local Setup](#local-setup)
5. [Environment Variables](#environment-variables)
6. [Database Seeding](#database-seeding)
7. [Running the Server](#running-the-server)
8. [Running Tests](#running-tests)
9. [API Reference](#api-reference)
10. [Socket.io Events](#socketio-events)
11. [Background Jobs (Cron)](#background-jobs-cron)
12. [Free Deployment Options](#free-deployment-options)
    - [Option A — Render.com (Recommended)](#option-a--rendercom-recommended)
    - [Option B — Railway.app](#option-b--railwayapp)
    - [Option C — Fly.io](#option-c--flyio)
13. [MongoDB Atlas (Free Cloud DB)](#mongodb-atlas-free-cloud-db)
14. [Redis (Free Cloud Cache)](#redis-free-cloud-cache)
15. [Docker](#docker)
16. [Security Features](#security-features)
17. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
Client (Next.js / React Native)
        │
        ▼
  Express REST API  ←──────────── MongoDB Atlas
        │                              │
        ├── Socket.io (real-time)      ├── Users, Buses, Routes
        ├── JWT Auth Middleware        ├── Schedules, Drivers
        ├── Rate Limiting             ├── BusPositions, Alerts
        ├── Helmet / CORS / XSS       └── TripHistory, Analytics
        │
        ├── Cron Jobs (node-cron)
        │     ├── GPS Simulation (every 10s)
        │     ├── Schedule Status Updater (every 1m)
        │     ├── Demand Prediction AI call (hourly)
        │     └── Headway Optimization AI call (nightly 02:00)
        │
        └── Python AI Service (port 8000)
              └── /predict/demand, /predict/delay, /optimize/headway, ...
```

---

## Project Structure

```
backend/
├── server.js                  # Entry point — DB connect → start server → cron
├── package.json
├── Dockerfile
├── .env.example               # Template — copy to .env
│
└── src/
    ├── app.js                 # Express app, middleware, route mounting
    │
    ├── config/
    │   ├── db.js              # Mongoose connection
    │   ├── redis.js           # ioredis client (with no-op fallback)
    │   └── socket.js          # Socket.io init + all event handlers
    │
    ├── controllers/           # Request → response logic (thin layer)
    │   ├── auth.controller.js
    │   ├── bus.controller.js
    │   ├── driver.controller.js
    │   ├── schedule.controller.js
    │   ├── tracking.controller.js
    │   ├── alert.controller.js
    │   ├── demand.controller.js
    │   ├── report.controller.js
    │   ├── route.controller.js
    │   └── stage.controller.js
    │
    ├── routes/                # Express routers + validation rules
    │   ├── auth.routes.js
    │   ├── bus.routes.js
    │   ├── driver.routes.js
    │   ├── schedule.routes.js
    │   ├── tracking.routes.js
    │   ├── alert.routes.js
    │   ├── demand.routes.js
    │   ├── report.routes.js
    │   ├── route.routes.js
    │   ├── stage.routes.js
    │   ├── mobile.routes.js   # Driver + Passenger mobile app routes
    │   └── public.routes.js   # No-auth routes (search, live bus)
    │
    ├── models/                # Mongoose schemas
    │   ├── User.js
    │   ├── Bus.js
    │   ├── Driver.js
    │   ├── Route.js
    │   ├── Stage.js
    │   ├── Schedule.js
    │   ├── BusPosition.js
    │   ├── Alert.js
    │   ├── TripHistory.js
    │   ├── PassengerDemand.js
    │   ├── Favourite.js
    │   ├── PushToken.js
    │   ├── Analytics.js
    │   └── AuditLog.js
    │
    ├── middleware/
    │   ├── auth.js            # protect() + authorize() JWT middleware
    │   ├── validate.js        # express-validator error formatter
    │   ├── error.middleware.js# Global error handler
    │   ├── cache.middleware.js# Redis cache middleware
    │   └── audit.middleware.js# Audit logging
    │
    ├── services/
    │   ├── scheduler.service.js    # Cron job wiring (node-cron)
    │   ├── analytics.service.js    # Daily analytics aggregation
    │   ├── notification.service.js # Expo push notifications
    │   ├── scheduleStatus.service.js # Auto-update schedule statuses
    │   ├── gpsSimulator.js         # Simulated GPS positions (dev)
    │   └── delayResolver.service.js
    │
    ├── jobs/
    │   ├── demandPrediction.job.js # Hourly: calls AI /predict/demand
    │   └── scheduleOptimize.job.js # Nightly: calls AI /optimize/headway
    │
    ├── scripts/
    │   ├── importData.js      # Import routes/stages from CSV
    │   └── seedData.js        # Seed demo users + buses
    │
    └── utils/
        └── logger.js          # Winston logger (console + file)
```

---

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+
- **MongoDB** — local instance OR MongoDB Atlas free tier (see [MongoDB Atlas](#mongodb-atlas-free-cloud-db))
- **Redis** — optional; server starts without it using an in-memory stub

Check your versions:
```bash
node --version   # should be 20+
npm --version    # should be 10+
```

---

## Local Setup

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Create your `.env` file

```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

Then edit `.env` with your actual values (see [Environment Variables](#environment-variables)).

### 3. Import CSV data (routes & stages)

The project ships with `routes.csv` and `stages.csv` at the workspace root. Run this once to load them into MongoDB:

```bash
npm run import-data
```

### 4. Seed demo users and buses

```bash
npm run seed
```

This creates:
- Admin account: `admin@smartdtc.com` / `Admin@1234`
- Dispatcher: `dispatch@smartdtc.com` / `Admin@1234`
- 3 demo drivers
- 5 demo buses

### 5. Start in development mode

```bash
npm run dev
```

Server starts at `http://localhost:5000`

Verify: `http://localhost:5000/health` → `{"status":"ok",...}`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in every value:

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | No | Default `5000` |
| `MONGO_URI` | **Yes** | Full MongoDB connection string |
| `JWT_SECRET` | **Yes** | Long random string (min 32 chars) |
| `JWT_EXPIRES_IN` | No | Default `15m` |
| `REFRESH_TOKEN_SECRET` | **Yes** | Different long random string |
| `CLIENT_URL` | Yes | Frontend URL for CORS (e.g. `http://localhost:3000`) |
| `AI_SERVICE_URL` | No | Python AI service URL, default `http://localhost:8000` |
| `PYTHON_AI_URL` | No | Alias for `AI_SERVICE_URL` |
| `REDIS_URL` | No | Redis connection string — omit to run without cache |
| `EMAIL_HOST` | No | SMTP host for password reset emails |
| `EMAIL_PORT` | No | SMTP port (587 for TLS) |
| `EMAIL_USER` | No | SMTP username |
| `EMAIL_PASS` | No | SMTP password / app password |

**Generate secure secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Run this twice — once for `JWT_SECRET`, once for `REFRESH_TOKEN_SECRET`.

---

## Database Seeding

| Script | Command | What it does |
|---|---|---|
| Import routes/stages | `npm run import-data` | Reads `routes.csv` + `stages.csv`, upserts into MongoDB |
| Seed demo data | `npm run seed` | Creates admin/dispatcher/driver users + buses |

> **Important:** Run `import-data` before `seed` so routes exist for the demo buses to reference.

---

## Running the Server

| Mode | Command | Description |
|---|---|---|
| Development | `npm run dev` | nodemon — auto-restarts on file changes |
| Production | `npm start` | Plain `node server.js` |
| Tests | `npm test` | Jest test suite |
| Coverage | `npm run test:coverage` | Jest with coverage report |

---

## Running Tests

```bash
npm test
```

Tests are in `tests/` using Jest + supertest. They test the demand prediction job and schedule optimization job.

```bash
# Run with coverage report
npm run test:coverage
```

Coverage report is saved to `backend/coverage/`.

---

## API Reference

All authenticated routes require:
```
Authorization: Bearer <accessToken>
```
Or the `accessToken` HttpOnly cookie (set automatically on login).

### Base URL
```
http://localhost:5000/api/v1
```

---

### Auth — `/api/v1/auth`

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/register` | ❌ | — | Register passenger or driver account |
| POST | `/login` | ❌ | — | Login, returns JWT + sets cookies |
| POST | `/refresh-token` | ❌ | — | Refresh access token using refresh cookie |
| POST | `/forgot-password` | ❌ | — | Send password reset email |
| PUT | `/reset-password/:token` | ❌ | — | Reset password with email token |
| GET | `/me` | ✅ | any | Get current user profile |
| PUT | `/me` | ✅ | any | Update profile (name, phone, image) |
| PUT | `/change-password` | ✅ | any | Change password |
| POST | `/logout` | ✅ | any | Clear auth cookies |
| POST | `/create-user` | ✅ | admin | Create admin/dispatcher/driver accounts |

**Login example:**
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smartdtc.com","password":"Admin@1234"}'
```

---

### Buses — `/api/v1/buses`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/` | admin, dispatcher | List all buses (filter: `status`, `type`; paginated) |
| GET | `/stats` | admin, dispatcher | Bus count by status |
| GET | `/:id` | admin, dispatcher | Get single bus |
| POST | `/` | admin | Create bus |
| PUT | `/:id` | admin, dispatcher | Update bus |
| PATCH | `/:id/status` | admin, dispatcher | Update bus status only |
| DELETE | `/:id` | admin | Delete bus |

**Status values:** `active`, `idle`, `maintenance`, `retired`

---

### Drivers — `/api/v1/drivers`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/` | admin, dispatcher | List all drivers |
| GET | `/:id` | admin, dispatcher | Get single driver |
| POST | `/` | admin | Create driver profile |
| PUT | `/:id` | admin, dispatcher | Update driver |
| PUT | `/:id/assign` | admin, dispatcher | Assign driver to route |
| PATCH | `/:id/assign` | admin, dispatcher | Assign bus to driver |
| DELETE | `/:id` | admin | Delete driver |

---

### Routes — `/api/v1/routes`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/` | admin, dispatcher | List all routes |
| GET | `/:id` | admin, dispatcher | Get route with stages |
| POST | `/` | admin | Create route |
| PUT | `/:id` | admin | Update route |
| DELETE | `/:id` | admin | Delete route |

---

### Stages — `/api/v1/stages`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/` | admin, dispatcher | List stages (filter by `routeId`) |
| POST | `/` | admin | Create stage (bus stop) |
| PUT | `/:id` | admin | Update stage |
| DELETE | `/:id` | admin | Delete stage |

---

### Schedules — `/api/v1/schedule`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/` | any (auth) | List schedules (filter: `date`, `routeId`, `status`) |
| GET | `/:id` | any (auth) | Get single schedule |
| POST | `/` | admin, dispatcher | Create single schedule |
| POST | `/bulk` | admin, dispatcher | Bulk-create schedules |
| POST | `/generate-ai` | admin, dispatcher | Preview AI-generated schedule |
| POST | `/generate-ai/apply` | admin, dispatcher | Apply AI schedule to DB |
| PUT | `/:id` | admin, dispatcher | Update schedule |
| DELETE | `/:id` | admin, dispatcher | Delete schedule |

---

### Tracking — `/api/v1/tracking` (no auth)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/live` | All buses with latest GPS position |
| GET | `/bus/:busId` | Latest position for one bus |
| GET | `/route/:routeId` | All buses on a specific route |
| GET | `/nearby?lat=&lng=&radius=` | Buses within radius (metres) |

---

### Alerts — `/api/v1/alerts`

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/` | ❌ | — | List alerts (public) |
| POST | `/` | ✅ | any | Create alert |
| PUT | `/:id/resolve` | ✅ | admin, dispatcher | Mark resolved |
| DELETE | `/:id` | ✅ | admin | Delete alert |

---

### Demand — `/api/v1/demand`

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/` | admin, dispatcher | Get demand records (filter by route/date) |
| POST | `/predict` | admin, dispatcher | Trigger manual demand prediction |

---

### Reports — `/api/v1/reports`

> All report routes require **admin or dispatcher** role.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/summary` | Overall KPIs (trips, delays, buses) |
| GET | `/daily` | Day-by-day breakdown |
| GET | `/trips` | Trip history with filter |
| GET | `/on-time-performance` | On-time % per route |
| GET | `/export/excel` | Download Excel report |
| GET | `/export/pdf` | Download PDF report |

---

### Mobile (Driver App) — `/api/v1/mobile/driver`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard` | Driver home — today's trip count, assigned bus |
| GET | `/profile` | Driver profile |
| PATCH | `/status` | Set status (`on-duty`, `off-duty`, `on-leave`) |
| GET | `/schedule/today` | Today's schedule with current trip highlighted |
| GET | `/schedule/active` | Currently in-progress schedule |
| GET | `/schedule` | All today's schedules |
| POST | `/trip/start` | Start a trip (marks schedule `in-progress`) |
| POST | `/trip/end` | End a trip (marks schedule `completed`) |

---

### Mobile (Passenger App) — `/api/v1/mobile/passenger`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/stats` | Passenger stats (trip count, favourites count) |
| GET | `/favourites` | Get favourite routes/stops |
| POST | `/favourites` | Add favourite |
| DELETE | `/favourites/:id` | Remove favourite |

---

### Mobile (Shared) — `/api/v1/mobile`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/trips/:tripId/rating` | Rate a completed trip (1–5 stars) |
| GET | `/trips/:tripId` | Get trip detail for rating screen |
| POST | `/push-token` | Register Expo push token |
| GET | `/favourites` | Shared favourites list |
| POST | `/favourites` | Add shared favourite |
| DELETE | `/favourites/:refId` | Remove shared favourite |

---

### Public (No Auth) — `/api/v1/public`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/search?from=&to=` | Search routes by stop name |
| GET | `/route/:routeId/schedule?date=` | Get today's schedule for a route |
| GET | `/bus/:busId/live` | Latest GPS position for a bus |

---

### Health Check

```
GET /health
```
Returns `{"status":"ok","timestamp":"...","env":"development"}`

---

## Socket.io Events

Connect to `ws://localhost:5000` using Socket.io client.

### Client → Server (emit)

| Event | Payload | Description |
|---|---|---|
| `admin:subscribe_all` | — | Join admin dashboard room |
| `admin:subscribe_route` | `{ routeId }` | Subscribe to a specific route |
| `passenger:track_bus` | `{ busId }` | Track a specific bus |
| `passenger:set_watch_stop` | `{ stopId, busId, alertThresholdMinutes }` | Get notified when bus is near stop |
| `driver:gps_update` | `{ busId, lat, lng, speed, heading, routeId }` | Send GPS position |
| `driver:trip_started` | `{ scheduleId, busId }` | Notify trip started |
| `driver:arrived_stop` | `{ busId, stageId, routeId }` | Notify arrived at stop |
| `driver:sos` | `{ busId, lat, lng, message }` | Emergency SOS |

### Server → Client (listen)

| Event | Description |
|---|---|
| `bus:position_update` | Real-time GPS position update |
| `bus:arrived` | Bus arrived at a stop |
| `bus:status_update` | Bus status changed (active/idle/maintenance) |
| `alert:new` | New alert created |
| `driver:trip_started` | Trip started notification |

**Example (React / React Native):**
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: accessToken }
});

socket.emit('passenger:track_bus', { busId: '...' });
socket.on('bus:position_update', ({ busId, lat, lng, speed }) => {
  console.log(`Bus ${busId} at ${lat}, ${lng}`);
});
```

---

## Background Jobs (Cron)

Managed by `scheduler.service.js` using `node-cron`. All jobs start automatically when the server starts.

| Job | Schedule | What it does |
|---|---|---|
| GPS Simulator | Every 10 seconds | Moves simulated buses along routes (dev only) |
| Schedule Status Updater | Every minute | Marks schedules `in-progress` or `completed` based on time |
| Demand Prediction | Every hour | Calls AI `/predict/demand` for each active route, stores in `PassengerDemand` |
| Schedule Optimizer | Daily at 02:00 | Calls AI `/optimize/headway`, updates tomorrow's schedule times |
| Daily Analytics | Daily at midnight | Aggregates trip/delay/demand KPIs into `Analytics` collection |

The demand and optimization jobs **gracefully skip** if the AI service is unreachable (logs a warning, does not crash the server).

---

## Free Deployment Options

### Option A — Render.com (Recommended)

Render gives you a **free Node.js web service** (spins down after 15 min inactivity on free tier).

**Steps:**

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → **New** → **Web Service**
3. Connect your GitHub repo, select the `backend/` folder as root directory
4. Configure:
   - **Environment:** `Node`
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
   - **Instance type:** Free
5. Add environment variables (click **Environment** tab):
   - Paste all values from your `.env` file
   - Set `NODE_ENV=production`
   - Set `CLIENT_URL=https://your-frontend.vercel.app`
6. Click **Create Web Service**

Your backend will be live at `https://smartdtc-backend.onrender.com`

> **Free tier note:** The server sleeps after 15 minutes of inactivity. First request after sleep takes ~30 seconds to wake up. Upgrade to Starter ($7/mo) to keep it always-on.

**To avoid sleep on free tier**, use a free uptime monitor like [UptimeRobot](https://uptimerobot.com) to ping `/health` every 14 minutes.

---

### Option B — Railway.app

Railway offers $5 of free credit per month (enough for a small always-on backend).

**Steps:**

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
2. Select your repo
3. Railway auto-detects Node.js and runs `npm start`
4. Click **Variables** tab → add all env vars from `.env`
5. Set the root directory to `backend/` in **Settings → Source**
6. Railway assigns a public URL automatically

**Add MongoDB and Redis on Railway (free):**
- In your Railway project → **New** → **Database** → **MongoDB** (free)
- Copy the `MONGO_URL` it gives you into your service's variables
- Repeat for Redis if needed

---

### Option C — Fly.io

Fly.io has a generous free tier (3 shared VMs free forever).

**Steps:**

```bash
# Install Fly CLI
iwr https://fly.io/install.ps1 -useb | iex   # Windows PowerShell

# Login
flyctl auth login

# From the backend/ directory
cd backend
flyctl launch    # auto-detects Dockerfile
flyctl deploy
```

Set secrets (env vars):
```bash
flyctl secrets set MONGO_URI="mongodb+srv://..." JWT_SECRET="..." NODE_ENV=production
```

---

## MongoDB Atlas (Free Cloud DB)

MongoDB Atlas M0 tier is permanently free (512 MB storage).

**Setup:**

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) → Create free account
2. **Create a cluster** → choose M0 (Free) → any region
3. **Database Access** → Add database user → set username + password
4. **Network Access** → Add IP Address → `0.0.0.0/0` (allow all — for simplicity; restrict in production)
5. **Connect** → **Connect your application** → copy the connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/smartdtc?retryWrites=true&w=majority
   ```
6. Paste it as `MONGO_URI` in your `.env` or deployment env vars

After deploying, run the seed scripts once via your hosting provider's shell or a local connection:
```bash
MONGO_URI=mongodb+srv://... npm run import-data
MONGO_URI=mongodb+srv://... npm run seed
```

---

## Redis (Free Cloud Cache)

Redis is **optional** — the backend runs without it. If you want caching:

**Option 1: Upstash (Free, serverless Redis)**
1. Go to [upstash.com](https://upstash.com) → Create free account
2. **Create Database** → Redis → free tier (10,000 commands/day)
3. Copy the **Redis URL** (format: `rediss://...`)
4. Set `REDIS_URL=rediss://...` in your env vars

**Option 2: Redis Cloud (Free 30 MB)**
1. Go to [redis.com/try-free](https://redis.com/try-free)
2. Create free subscription → copy endpoint + password
3. Set `REDIS_URL=redis://:<password>@<host>:<port>`

---

## Docker

### Build and run locally

```bash
cd backend
docker build -t smartdtc-backend .
docker run -d \
  --name smartdtc-backend \
  -p 5000:5000 \
  -e NODE_ENV=production \
  -e MONGO_URI="mongodb+srv://..." \
  -e JWT_SECRET="..." \
  -e REFRESH_TOKEN_SECRET="..." \
  -e CLIENT_URL="http://localhost:3000" \
  smartdtc-backend
```

**Windows PowerShell:**
```powershell
docker run -d `
  --name smartdtc-backend `
  -p 5000:5000 `
  -e NODE_ENV=production `
  -e MONGO_URI="mongodb+srv://..." `
  -e JWT_SECRET="..." `
  -e REFRESH_TOKEN_SECRET="..." `
  -e CLIENT_URL="http://localhost:3000" `
  smartdtc-backend
```

### With Docker Compose (all services)

From the workspace root:
```bash
docker-compose up --build
```

---

## Security Features

The backend implements the following security layers out of the box:

| Feature | Package | Details |
|---|---|---|
| Helmet | `helmet` | Sets 11 secure HTTP headers |
| CORS | `cors` | Whitelist of allowed origins |
| Rate Limiting | `express-rate-limit` | Global: 200 req/15min; Auth: 20 req/15min; Export: 10 req/5min |
| NoSQL Injection | `express-mongo-sanitize` | Strips `$` and `.` from query/body |
| XSS | `xss-clean` | Sanitises HTML in request body |
| HTTP Parameter Pollution | `hpp` | Prevents duplicate query param attacks |
| Password Hashing | `bcryptjs` | Cost factor 12 |
| JWT | `jsonwebtoken` | Short-lived access token (15m) + long refresh token (7d) in HttpOnly cookies |
| Input Validation | `express-validator` | Schema-based validation on all write endpoints |

---

## Troubleshooting

### `MongoServerError: bad auth`
→ Check `MONGO_URI` — username or password wrong. URL-encode special characters in the password (e.g. `@` → `%40`).

### `Error: JWT_SECRET is not defined`
→ Your `.env` file is missing or not loaded. Make sure `dotenv.config()` runs before anything else (it does in `server.js`).

### Server starts but cron jobs crash
→ Usually the AI service is unreachable. The jobs log warnings and skip — they don't crash the server. Set `AI_SERVICE_URL` to `http://localhost:8000` or your deployed AI service URL.

### `Cannot read properties of undefined (reading 'role')`
→ A protected route is being called without a valid JWT. Include `Authorization: Bearer <token>` header.

### Socket.io connection refused from mobile app
→ Mobile apps need the actual IP, not `localhost`. Use your machine's LAN IP (e.g. `192.168.1.x`) or the deployed URL.

### `Redis connection error`
→ If you don't need Redis, simply don't set `REDIS_URL` in `.env`. The server uses a no-op stub automatically.

### Render/Railway cold start is slow
→ Expected on free tiers. Use [UptimeRobot](https://uptimerobot.com) (free) to ping `/health` every 14 minutes to prevent sleep.
