require('dotenv').config();

const connectDB = require('./src/config/db');
const { startCronJobs } = require('./src/services/scheduler.service');

// Connect DB then start server
connectDB().then(() => {
  const { app, server } = require('./src/app');
  const PORT = process.env.PORT || 5000;

  server.listen(PORT, async () => {
    console.log(`🚀  Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);

    // Start GPS Simulator only when demo mode is enabled
    if (process.env.ENABLE_GPS_SIMULATOR === 'true') {
      setTimeout(async () => {
        try {
          const { startSimulator } = require('./src/services/gpsSimulator');
          await startSimulator();
        } catch (err) {
          console.error('GPS Simulator failed to start:', err.message);
        }
      }, 3000);
    }
  });

  startCronJobs();
}).catch((err) => {
  console.error('Failed to connect to DB:', err.message);
  process.exit(1);
});
