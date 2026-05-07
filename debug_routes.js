const mongoose = require('mongoose');
require('dotenv').config();
const Route = require('./src/models/Route');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const routes = await Route.find().limit(3);
    console.log('\n=== ROUTES IN DATABASE ===');
    routes.forEach((r, i) => {
      console.log(`${i+1}. _id: ${r._id}`);
      console.log(`   name: ${r.route_name}`);
      console.log(`   url_route_id: ${r.url_route_id}`);
    });
    
    // Check if the problematic ID exists
    const testId = '69b248e13b0591c50b385721';
    try {
      const route = await Route.findById(testId);
      console.log(`\nRoute ${testId}: ${route ? 'FOUND' : 'NOT FOUND'}`);
    } catch (e) {
      console.log(`\nRoute ${testId}: Invalid ObjectId format`);
    }
    
    mongoose.connection.close();
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
