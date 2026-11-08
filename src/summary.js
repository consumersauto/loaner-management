// Summary for the morning Slack report. No customer names, phones, addresses or licenses —
// only the car, plate and dates.

// Today's date (YYYY-MM-DD) in the dealership's time zone.
export function localToday(tz = 'America/New_York', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const dayNum = ymd => Math.round(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86400000);

const carName = v => v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : 'Unknown car';

// Month/year expirations (inspection, plates): flagged when expired or expiring within `withinDays`.
function expiry(month, year, today, withinDays) {
  const m = parseInt(month, 10), y = parseInt(year, 10);
  if (!m || !y) return null;
  // Expires at the end of that month.
  const last = new Date(Date.UTC(y, m, 0));
  const lastYmd = last.toISOString().slice(0, 10);
  const daysLeft = dayNum(lastYmd) - dayNum(today);
  if (daysLeft > withinDays) return null;
  return { expires: `${y}-${String(m).padStart(2, '0')}`, daysLeft };
}

export function buildSummary(vehicles, agreements, today, { pastDueAfterDays = 1, expiryWithinDays = 30 } = {}) {
  vehicles = Array.isArray(vehicles) ? vehicles : Object.values(vehicles || {});
  agreements = Array.isArray(agreements) ? agreements : Object.values(agreements || {});
  const byId = new Map(vehicles.map(v => [v.id, v]));

  const out = agreements.filter(a => a && !a.checkedIn);
  const pastDue = [];
  for (const a of out) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dueDate || '')) continue;
    const days = dayNum(today) - dayNum(a.dueDate);
    if (days >= pastDueAfterDays) {
      const v = byId.get(a.vehicleId);
      pastDue.push({ car: carName(v), plate: v?.plate || '', dateOut: a.dateOut || '', dueDate: a.dueDate, daysPastDue: days });
    }
  }
  pastDue.sort((x, y) => y.daysPastDue - x.daysPastDue);

  const expiring = [];
  for (const v of vehicles) {
    const insp = expiry(v.inspMonth, v.inspYear, today, expiryWithinDays);
    if (insp) expiring.push({ car: carName(v), plate: v.plate || '', what: 'inspection', ...insp });
    const plate = expiry(v.plateExpMonth, v.plateExpYear, today, expiryWithinDays);
    if (plate) expiring.push({ car: carName(v), plate: v.plate || '', what: 'plates', ...plate });
  }
  expiring.sort((x, y) => x.daysLeft - y.daysLeft);

  return {
    today,
    cars: vehicles.length,
    checkedOut: out.length,
    available: vehicles.length - new Set(out.map(a => a.vehicleId)).size,
    pastDue,
    expiring,
  };
}
