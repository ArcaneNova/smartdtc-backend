const mongoose = require('mongoose');
require('dotenv').config();
const Route = require('./src/models/Route');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const count = await Route.countDocuments();
    console.log('Total routes:', count);
    
    const routes = await Route.find().limit(3);
    console.log('Sample routes:');
    routes.forEach(r => {
      console.log(`  _id: ${r._id}, name: ${r.route_name}, start: ${r.start_stage}, end: ${r.end_stage}`);
    });
    
    // Check if the requested route exists
    const routeId = '69b248e13b0591c50b385721';
    const route = await Route.findById(routeId);
    console.log(`\nRoute ${routeId}:`, route ? 'EXISTS' : 'NOT FOUND');
    
    mongoose.connection.close();
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
