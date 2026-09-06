// Schedules the two daily runs that turn active subscriptions into real
// orders: one for the morning slot, one for the evening slot. Times are
// configurable via .env so ops can tune them without a code change.
//
// Runs in server timezone by default; set CRON_TIMEZONE in .env (e.g.
// "Asia/Kolkata") if the server isn't already in the dairy's local time.

const cron = require('node-cron');
const { generateDeliveriesForSlot } = require('./subscriptionOrderGenerator');

const MORNING_GEN_TIME = process.env.MORNING_GEN_CRON || '30 5 * * *';  // 5:30 AM daily
const EVENING_GEN_TIME = process.env.EVENING_GEN_CRON || '30 15 * * *'; // 3:30 PM daily
const TIMEZONE = process.env.CRON_TIMEZONE || undefined;

function logResult(slot, res) {
  console.log(
    `[cron] ${slot} deliveries generated: ${res.created} created, ` +
    `${res.skipped} skipped, ${res.alreadyExisted} already existed` +
    (res.errors.length ? `, ${res.errors.length} errors: ${res.errors.join(' | ')}` : '')
  );
}

function start() {
  cron.schedule(MORNING_GEN_TIME, async () => {
    try {
      const res = await generateDeliveriesForSlot('morning');
      logResult('morning', res);
    } catch (err) {
      console.error('[cron] morning generation failed:', err.message);
    }
  }, TIMEZONE ? { timezone: TIMEZONE } : undefined);

  cron.schedule(EVENING_GEN_TIME, async () => {
    try {
      const res = await generateDeliveriesForSlot('evening');
      logResult('evening', res);
    } catch (err) {
      console.error('[cron] evening generation failed:', err.message);
    }
  }, TIMEZONE ? { timezone: TIMEZONE } : undefined);

  console.log(`[cron] subscription delivery generator scheduled - morning: "${MORNING_GEN_TIME}", evening: "${EVENING_GEN_TIME}"`);
}

module.exports = { start, generateDeliveriesForSlot };
