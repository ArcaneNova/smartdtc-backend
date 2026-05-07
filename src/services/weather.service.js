/**
 * weather.service.js
 * Fetches real-time weather for Delhi from Open-Meteo (completely free, no API key).
 * Caches result for 30 minutes to avoid hammering the API.
 *
 * Open-Meteo docs: https://open-meteo.com/en/docs
 * Delhi: lat=28.6139, lon=77.2090
 */

const axios = require('axios');

// ── Cache ─────────────────────────────────────────────────────────────────────
let _cache = null;   // { weather, avg_temp_c, wind_kmh, fetchedAt }
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// WMO weather code → SmartDTC weather string
function wmoToWeather(code) {
  if (code === 0)                   return 'clear';
  if (code <= 3)                    return 'cloudy';
  if (code >= 51 && code <= 67)     return 'rain';
  if (code >= 71 && code <= 77)     return 'fog';   // actually snow, rare for Delhi
  if (code >= 80 && code <= 82)     return 'rain';
  if (code >= 95)                   return 'storm';
  if (code >= 45 && code <= 48)     return 'fog';
  return 'cloudy';
}

/**
 * Fetch current weather for Delhi.
 * Returns { weather, avg_temp_c, wind_kmh } — with a fallback if API fails.
 */
async function getCurrentWeather() {
  // Serve cache if fresh
  if (_cache && (Date.now() - _cache.fetchedAt) < CACHE_TTL_MS) {
    return { weather: _cache.weather, avg_temp_c: _cache.avg_temp_c, wind_kmh: _cache.wind_kmh };
  }

  try {
    const { data } = await axios.get(
      'https://api.open-meteo.com/v1/forecast',
      {
        params: {
          latitude:          28.6139,
          longitude:         77.2090,
          current:           'temperature_2m,weathercode,windspeed_10m',
          wind_speed_unit:   'kmh',
          timezone:          'Asia/Kolkata',
        },
        timeout: 5000,
      }
    );

    const current = data.current;
    const weather = wmoToWeather(current.weathercode);
    const avg_temp_c = Math.round(current.temperature_2m * 10) / 10;
    const wind_kmh   = Math.round(current.windspeed_10m  * 10) / 10;

    _cache = { weather, avg_temp_c, wind_kmh, fetchedAt: Date.now() };
    return { weather, avg_temp_c, wind_kmh };
  } catch (err) {
    console.warn('[Weather] Open-Meteo fetch failed:', err.message, '— using fallback');
    // Realistic Delhi defaults by month
    const month = new Date().getMonth() + 1; // 1–12
    const fallbackTemp = [15, 18, 24, 32, 38, 36, 32, 31, 30, 26, 21, 16][month - 1];
    const fallbackWeather = month >= 7 && month <= 9 ? 'rain' : 'clear';
    return { weather: fallbackWeather, avg_temp_c: fallbackTemp, wind_kmh: 10 };
  }
}

/**
 * Clear cache (useful for testing or forced refresh).
 */
function clearWeatherCache() {
  _cache = null;
}

module.exports = { getCurrentWeather, clearWeatherCache };
