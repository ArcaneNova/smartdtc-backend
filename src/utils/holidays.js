/**
 * holidays.js
 * Indian public holidays for 2025–2026.
 * Dates in ISO format YYYY-MM-DD.
 * Source: Government of India Gazette + DTC operational calendar.
 */

const HOLIDAYS = new Set([
  // 2025
  '2025-01-26', // Republic Day
  '2025-03-14', // Holi
  '2025-03-31', // Id-ul-Fitr (Eid)
  '2025-04-06', // Ram Navami
  '2025-04-14', // Dr. Ambedkar Jayanti / Baisakhi
  '2025-04-18', // Good Friday
  '2025-05-12', // Buddha Purnima
  '2025-06-07', // Eid-ul-Adha
  '2025-07-06', // Muharram
  '2025-08-15', // Independence Day
  '2025-09-05', // Janmashtami
  '2025-10-02', // Gandhi Jayanti
  '2025-10-02', // Dussehra
  '2025-10-20', // Diwali
  '2025-10-21', // Diwali (extra)
  '2025-11-05', // Guru Nanak Jayanti
  '2025-12-25', // Christmas

  // 2026
  '2026-01-26', // Republic Day
  '2026-03-03', // Holi (estimated)
  '2026-03-20', // Id-ul-Fitr (estimated)
  '2026-03-28', // Good Friday
  '2026-04-14', // Dr. Ambedkar Jayanti / Baisakhi
  '2026-05-01', // Buddha Purnima (estimated)
  '2026-05-27', // Eid-ul-Adha (estimated)
  '2026-06-26', // Muharram (estimated)
  '2026-08-15', // Independence Day
  '2026-08-25', // Janmashtami (estimated)
  '2026-10-02', // Gandhi Jayanti
  '2026-10-08', // Dussehra (estimated)
  '2026-10-28', // Diwali (estimated)
  '2026-11-24', // Guru Nanak Jayanti (estimated)
  '2026-12-25', // Christmas
]);

/**
 * Check if a given date (string YYYY-MM-DD or Date object) is a public holiday.
 * @param {string|Date} date
 * @returns {boolean}
 */
function isHoliday(date) {
  const d = typeof date === 'string' ? date : date.toISOString().slice(0, 10);
  return HOLIDAYS.has(d);
}

/**
 * Get holiday name for a date (returns null if not a holiday).
 * We keep this lightweight — just returns true/false for AI prediction.
 * @param {string|Date} date
 * @returns {boolean}
 */
function getHolidayName(date) {
  return isHoliday(date) ? 'public_holiday' : null;
}

module.exports = { isHoliday, getHolidayName, HOLIDAYS };
