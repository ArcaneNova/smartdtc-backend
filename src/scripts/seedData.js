/**
 * seedData.js — SmartDTC Seed Script
 * Creates: admin/driver/passenger users, 20 buses, 20 drivers,
 *          30-day TripHistory, 24h PassengerDemand for all routes.
 *
 * Run: node src/scripts/seedData.js
 */

require('dotenv').config();
const mongoose       = require('mongoose');

const User           = require('../models/User');
const Bus            = require('../models/Bus');
const Driver         = require('../models/Driver');
const Route          = require('../models/Route');
const Schedule       = require('../models/Schedule');
const TripHistory    = require('../models/TripHistory');
const PassengerDemand= require('../models/PassengerDemand');
const Alert          = require('../models/Alert');

// ── helpers ─────────────────────────────────────────────────────────────────
const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)];

const BUS_MODELS    = ['Ashok Leyland AVTR', 'TATA Starbus', 'Eicher ProBus', 'JBM Eco Life Electric'];
const BUS_TYPES     = ['AC', 'non-AC', 'electric'];
const STD_ROUTES    = [
  'Nizamuddin ↔ Mehrauli',
  'ISBT ↔ Janakpuri',
  'Connaught Place ↔ Dwarka',
  'Saket ↔ Anand Vihar',
  'Lajpat Nagar ↔ Rohini',
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const upsertUser = async ({ email, name, password, role, phone }) => {
    const existing = await User.findOne({ email });
    if (existing) {
      existing.name = name;
      existing.password = password;
      existing.role = role;
      existing.phone = phone;
      existing.isActive = true;
      await existing.save();
      return { user: existing, created: false };
    }

    const user = await User.create({ name, email, password, role, phone, isActive: true });
    return { user, created: true };
  };

  // ── 1. Users ──────────────────────────────────────────────────────────────
  console.log('🌱 Seeding users…');
  const adminPw   = 'admin123';
  const driverPw  = 'driver123';
  const passPw    = 'pass123';

  // Admin
  let adminCreated;
  ({ created: adminCreated } = await upsertUser({
    name: 'DTC Admin',
    email: 'admin@dtc.gov.in',
    password: adminPw,
    role: 'admin',
  }));
  console.log(`  admin@dtc.gov.in / admin123${adminCreated ? ' (created)' : ' (updated)'}`);

  // Dispatcher
  let dispatcherCreated;
  ({ created: dispatcherCreated } = await upsertUser({
    name: 'DTC Dispatcher',
    email: 'dispatcher@dtc.gov.in',
    password: adminPw,
    role: 'dispatcher',
  }));
  console.log(`  dispatcher@dtc.gov.in / admin123${dispatcherCreated ? ' (created)' : ' (updated)'}`);

  // Passenger
  let passengerCreated;
  ({ created: passengerCreated } = await upsertUser({
    name: 'Rahul Sharma',
    email: 'passenger@example.com',
    password: passPw,
    role: 'passenger',
  }));
  console.log(`  passenger@example.com / pass123${passengerCreated ? ' (created)' : ' (updated)'}`);

  // 20 driver users
  const driverUsers = [];
  for (let i = 1; i <= 20; i++) {
    const email = `driver${i}@dtc.gov.in`;
    const { user: u } = await upsertUser({
      name: `Driver ${i}`,
      email,
      password: driverPw,
      role: 'driver',
      phone: `98765${String(43210 + i).padStart(5, '0')}`,
    });
    driverUsers.push(u);
  }
  console.log(`  ${driverUsers.length} driver users ready`);

  // ── 2. Buses ──────────────────────────────────────────────────────────────
  console.log('🚌 Seeding buses…');
  const existingBusCount = await Bus.countDocuments();
  let buses = [];
  if (existingBusCount < 20) {
    const toCreate = 20 - existingBusCount;
    for (let i = existingBusCount + 1; i <= existingBusCount + toCreate; i++) {
      buses.push({
        busNumber:      `DL${String(i).padStart(2,'0')}PA${rand(1000,9999)}`,
        registrationNo: `DL-${rand(10,99)}-${String.fromCharCode(65+rand(0,25))}${String.fromCharCode(65+rand(0,25))}-${rand(1000,9999)}`,
        model:          pick(BUS_MODELS),
        capacity:       pick([40, 50, 60]),
        type:           pick(BUS_TYPES),
        status:         i <= 16 ? 'active' : pick(['idle', 'maintenance']),
        fuelLevel:      rand(30, 100),
        mileage:        rand(50000, 200000),
      });
    }
    const created = await Bus.insertMany(buses);
    buses = created;
    console.log(`  Created ${buses.length} buses`);
  } else {
    buses = await Bus.find().limit(20).lean();
    console.log(`  ${buses.length} buses already exist`);
  }

  // ── 3. Drivers ────────────────────────────────────────────────────────────
  console.log('👨‍✈️ Seeding drivers…');
  const existDriverCount = await Driver.countDocuments();
  let drivers = [];
  if (existDriverCount < 20) {
    const needed = 20 - existDriverCount;
    const newDriversData = [];
    for (let i = 0; i < needed && i < driverUsers.length; i++) {
      const u = driverUsers[existDriverCount + i] || driverUsers[i];
      const existsForUser = await Driver.findOne({ userId: u._id });
      if (!existsForUser) {
        newDriversData.push({
          userId:     u._id,
          licenseNo:  `HR-${rand(10,99)}-${rand(100000,999999)}`,
          experience: rand(2, 20),
          status:     i < 16 ? 'on-duty' : pick(['off-duty', 'on-leave']),
          rating:     (rand(35, 50) / 10),
        });
      }
    }
    if (newDriversData.length) {
      const created = await Driver.insertMany(newDriversData);
      drivers = [...(await Driver.find().limit(20 - created.length).lean()), ...created];
    } else {
      drivers = await Driver.find().limit(20).lean();
    }
  } else {
    drivers = await Driver.find().limit(20).lean();
  }
  console.log(`  ${drivers.length} drivers ready`);

  // ── 4. Assign buses to routes + drivers ───────────────────────────────────
  console.log('🔗 Assigning buses to routes and drivers…');
  const routes = await Route.find({ isActive: { $ne: false } }).limit(20).lean();
  if (!routes.length) {
    console.warn('  ⚠️  No routes found — run importData.js first!');
  } else {
    for (let i = 0; i < Math.min(buses.length, routes.length, 16); i++) {
      await Bus.findByIdAndUpdate(buses[i]._id, {
        currentRoute:  routes[i]._id,
        currentDriver: drivers[i]?._id,
        status: 'active',
      });
      if (drivers[i]) {
        await Driver.findByIdAndUpdate(drivers[i]._id, {
          assignedBus:   buses[i]._id,
          assignedRoute: routes[i]._id,
          status: 'on-duty',
        });
      }
    }
    console.log(`  Assigned ${Math.min(buses.length, routes.length, 16)} bus-route-driver combos`);
  }

  // ── 5. TripHistory (30 days) ───────────────────────────────────────────────
  console.log('📋 Seeding TripHistory (30 days)…');
  const existTrips = await TripHistory.countDocuments();
  if (existTrips < 100 && routes.length) {
    const tripDocs = [];
    for (let d = 29; d >= 0; d--) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      date.setHours(5, 0, 0, 0);

      const tripsPerDay = rand(15, 30);
      for (let t = 0; t < tripsPerDay; t++) {
        const busIdx     = t % buses.length;
        const routeIdx   = t % routes.length;
        const driverIdx  = t % drivers.length;
        const route      = routes[routeIdx];
        const startHour  = rand(5, 21);
        const startTime  = new Date(date);
        startTime.setHours(startHour, rand(0, 59), 0, 0);
        const durationMin = rand(30, 120);
        const endTime    = new Date(startTime.getTime() + durationMin * 60000);
        const delayMin   = rand(0, 15);
        const passengers = rand(10, (route.distance_km || 10) > 15 ? 120 : 80);

        tripDocs.push({
          driver:           drivers[driverIdx]?._id,
          bus:              buses[busIdx]?._id,
          route:            route._id,
          startTime,
          endTime,
          distanceCovered:  route.distance_km || rand(5, 30),
          stopsCompleted:   route.total_stages || rand(5, 25),
          avgSpeed:         rand(20, 45),
          delayMinutes:     delayMin,
          passengerCount:   passengers,
          status:           delayMin < 10 ? 'completed' : pick(['completed', 'completed', 'incomplete']),
          incidents:        delayMin > 12 ? [pick(['minor delay', 'heavy traffic', 'passenger rush'])] : [],
        });
      }
    }
    await TripHistory.insertMany(tripDocs, { ordered: false });
    console.log(`  Inserted ${tripDocs.length} trip history records`);
  } else {
    console.log(`  TripHistory already has ${existTrips} records`);
  }

  // ── 6. PassengerDemand (today + yesterday for all routes) ─────────────────
  console.log('📊 Seeding PassengerDemand…');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const existDemand = await PassengerDemand.countDocuments({ forDate: { $gte: today } });

  if (existDemand < 50 && routes.length) {
    const demandDocs = [];
    // Peak hour demand profiles
    const demandProfile = [2,1,1,1,2,5,9,12,10,7,6,5,6,5,6,7,10,12,9,6,4,3,2,1];

    for (const route of routes.slice(0, 50)) {
      for (let h = 0; h < 24; h++) {
        const base      = demandProfile[h] * rand(8, 15);
        const predicted = Math.max(5, base + rand(-10, 10));
        const actual    = Math.max(0, predicted + rand(-15, 20));
        const level     = predicted > 120 ? 'critical' : predicted > 80 ? 'high' : predicted > 40 ? 'medium' : 'low';

        demandDocs.push({
          route:          route._id,
          forDate:        today,
          hour:           h,
          predictedCount: predicted,
          actualCount:    h < new Date().getHours() ? actual : null,
          crowdLevel:     level,
          weather:        'clear',
          isWeekend:      today.getDay() === 0 || today.getDay() === 6,
          isHoliday:      false,
        });
      }
    }
    await PassengerDemand.insertMany(demandDocs, { ordered: false });
    console.log(`  Inserted ${demandDocs.length} demand records`);
  } else {
    console.log(`  Demand already seeded (${existDemand} today's records)`);
  }

  // ── 7. Seed Schedules for today ───────────────────────────────────────────
  console.log('🗓️ Seeding today\'s schedules…');
  const todayEnd = new Date(today.getTime() + 86400000);
  const existSched = await Schedule.countDocuments({ date: { $gte: today, $lt: todayEnd } });
  if (existSched < 20 && routes.length) {
    const schedDocs = [];
    const types = ['regular', 'peak', 'express'];
    for (let i = 0; i < Math.min(30, routes.length, buses.length); i++) {
      const dep = new Date(today);
      dep.setHours(rand(5, 22), pick([0, 15, 30, 45]), 0, 0);
      const arrMins = rand(30, 120);
      const arr = new Date(dep.getTime() + arrMins * 60000);
      schedDocs.push({
        route:                routes[i % routes.length]._id,
        bus:                  buses[i % buses.length]?._id,
        driver:               drivers[i % drivers.length]?._id,
        departureTime:        dep,
        estimatedArrivalTime: arr,
        date:                 today,
        type:                 dep.getHours() >= 7 && dep.getHours() <= 10 ? 'peak' : pick(types),
        status:               dep < new Date() ? pick(['completed', 'in-progress']) : 'scheduled',
        generatedBy:          'admin',
      });
    }
    await Schedule.insertMany(schedDocs, { ordered: false });
    console.log(`  Inserted ${schedDocs.length} today schedules`);
  } else {
    console.log(`  Schedules already exist (${existSched} today)`);
  }

  // ── 8. Seed demo Alerts ───────────────────────────────────────────────────
  console.log('🚨 Seeding demo alerts…');
  const existAlerts = await Alert.countDocuments({ isResolved: false });
  if (existAlerts < 3 && routes.length) {
    const alertDocs = [
      {
        type: 'overcrowding', severity: 'critical',
        route: routes[0]?._id,
        message: `Route ${routes[0]?.route_name}: High passenger demand at peak hour — consider extra bus.`,
        isResolved: false,
      },
      {
        type: 'delay', severity: 'warning',
        route: routes[1]?._id,
        message: `Route ${routes[1]?.route_name}: Bus running 12 minutes behind schedule due to traffic.`,
        isResolved: false,
      },
      {
        type: 'breakdown', severity: 'critical',
        route: routes[2]?._id,
        bus:   buses[2]?._id,
        message: `Bus ${buses[2]?.busNumber || 'DL001'} reported mechanical issue on Route ${routes[2]?.route_name}. Nearest idle bus being dispatched.`,
        isResolved: false,
      },
    ];
    await Alert.insertMany(alertDocs, { ordered: false });
    console.log(`  Inserted ${alertDocs.length} demo alerts`);
  } else {
    console.log(`  Alerts already exist (${existAlerts} active)`);
  }

  console.log('\n🎉 Seed complete!\n');
  console.log('Default Credentials:');
  console.log('  Admin:      admin@dtc.gov.in     / admin123');
  console.log('  Dispatcher: dispatcher@dtc.gov.in / admin123');
  console.log('  Driver:     driver1@dtc.gov.in   / driver123');
  console.log('  Passenger:  passenger@example.com / pass123');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
