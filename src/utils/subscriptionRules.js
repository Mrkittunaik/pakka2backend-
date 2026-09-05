// Business rule: a delivery can only be skipped/edited before a cutoff time,
// because the dairy needs to know the previous evening how much to pack.
//
//   morning slot -> must skip by 9:00 PM the day BEFORE
//   evening slot -> must skip by 2:00 PM the SAME day
//
// Both are configurable via .env so the admin can change policy without a
// code deploy.

const MORNING_CUTOFF_HOUR = Number(process.env.SKIP_CUTOFF_HOUR_MORNING ?? 21); // 9 PM
const EVENING_CUTOFF_HOUR = Number(process.env.SKIP_CUTOFF_HOUR_EVENING ?? 14); // 2 PM

function dateKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Returns { allowed, reason, cutoffAt } for skipping/editing a specific delivery date+slot.
function checkCutoff(targetDate, slot, now = new Date()) {
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  if (target < today) {
    return { allowed: false, reason: 'That date has already passed.' };
  }

  let cutoffAt;
  if (slot === 'evening') {
    // same-day cutoff
    cutoffAt = new Date(target);
    cutoffAt.setHours(EVENING_CUTOFF_HOUR, 0, 0, 0);
  } else {
    // morning slot -> cutoff is the PREVIOUS day at MORNING_CUTOFF_HOUR
    cutoffAt = new Date(target);
    cutoffAt.setDate(cutoffAt.getDate() - 1);
    cutoffAt.setHours(MORNING_CUTOFF_HOUR, 0, 0, 0);
  }

  if (now > cutoffAt) {
    return {
      allowed: false,
      reason: `Too late to change ${dateKey(target)} — the cutoff was ${cutoffAt.toLocaleString()}.`,
      cutoffAt
    };
  }

  return { allowed: true, cutoffAt };
}

module.exports = { checkCutoff, dateKey };
