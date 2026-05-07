/**
 * importData.js
 * Imports DTC route and stage data from CSV files into MongoDB.
 * Usage: node src/scripts/importData.js
 *        node src/scripts/importData.js --delete   (wipe & re-import)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs      = require('fs');
const path    = require('path');
const csv     = require('csv-parser');
const mongoose = require('mongoose');

const Route   = require('../models/Route');
const Stage   = require('../models/Stage');

const ROUTES_CSV = process.env.ROUTES_CSV_PATH || path.join(__dirname, '../../../routes.csv');
const STAGES_CSV = process.env.STAGES_CSV_PATH || path.join(__dirname, '../../../stages.csv');

// ─── helpers ────────────────────────────────────────────────────────────────

const readCSV = (filePath) =>
  new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end',  () => resolve(rows))
      .on('error', reject);
  });

const parseFloat2 = (v) => (v !== undefined && v !== '' ? parseFloat(v) : null);
const parseInt2   = (v) => (v !== undefined && v !== '' ? parseInt(v, 10) : null);

// ─── import routes ──────────────────────────────────────────────────────────

async function importRoutes() {
  console.log('📂  Reading routes.csv …');
  const rows = await readCSV(ROUTES_CSV);
  console.log(`    ${rows.length} rows found`);

  const docs = rows
    .filter((r) => r.url_route_id && r.route_name)
    .map((r) => ({
      url_route_id: r.url_route_id.trim(),
      route_name:   r.route_name.trim(),
      start_stage:  r.start_stage ? r.start_stage.trim() : '',
      end_stage:    r.end_stage   ? r.end_stage.trim()   : '',
      distance_km:  parseFloat2(r.distance_km),
      url:          r.url ? r.url.trim() : '',
      total_stages: parseInt2(r.total_stages),
      isActive:     true,
    }));

  // Bulk upsert (idempotent)
  const ops = docs.map((d) => ({
    updateOne: {
      filter: { url_route_id: d.url_route_id },
      update: { $set: d },
      upsert: true,
    },
  }));

  const result = await Route.bulkWrite(ops, { ordered: false });
  console.log(`✅  Routes — upserted: ${result.upsertedCount}, modified: ${result.modifiedCount}`);
}

// ─── import stages ──────────────────────────────────────────────────────────

async function importStages() {
  console.log('📂  Reading stages.csv …');
  const rows = await readCSV(STAGES_CSV);
  console.log(`    ${rows.length} rows found`);

  const docs = rows
    .filter((r) => r.url_route_id && r.stage_id)
    .map((r) => {
      const lat = parseFloat2(r.latitude  || r.lat);
      const lng = parseFloat2(r.longitude || r.lng || r.lon);

      return {
        url_route_id: r.url_route_id.trim(),
        seq:          parseInt2(r.seq || r.sequence || r.stop_sequence),
        stage_id:     r.stage_id.trim(),
        stage_name:   r.stage_name ? r.stage_name.trim() : '',
        location:
          lat !== null && lng !== null
            ? { type: 'Point', coordinates: [lng, lat] }
            : undefined,
      };
    });

  // Bulk upsert in chunks of 1 000 to avoid memory spikes
  const CHUNK = 1000;
  let upserted = 0, modified = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    const ops = chunk.map((d) => ({
      updateOne: {
        filter: { url_route_id: d.url_route_id, stage_id: d.stage_id },
        update: { $set: d },
        upsert: true,
      },
    }));
    const res = await Stage.bulkWrite(ops, { ordered: false });
    upserted += res.upsertedCount;
    modified += res.modifiedCount;
    process.stdout.write(`\r    Progress: ${Math.min(i + CHUNK, docs.length)}/${docs.length}`);
  }
  console.log(`\n✅  Stages  — upserted: ${upserted}, modified: ${modified}`);
}

// ─── delete & reimport ──────────────────────────────────────────────────────

async function deleteAll() {
  console.log('🗑   Deleting existing routes & stages …');
  await Promise.all([Route.deleteMany({}), Stage.deleteMany({})]);
  console.log('    Done.');
}

// ─── main ───────────────────────────────────────────────────────────────────

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🔌  MongoDB connected');

    if (process.argv.includes('--delete')) await deleteAll();

    await importRoutes();
    await importStages();

    console.log('\n🎉  Import complete!');
  } catch (err) {
    console.error('❌  Import failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
