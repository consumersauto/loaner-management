import assert from 'node:assert/strict';
import { buildSummary, localToday } from '../src/summary.js';

const vehicles = [
  { id: 'a', year: '2023', make: 'Kia', model: 'Rio', plate: 'AAA1', inspMonth: '6', inspYear: '2027', plateExpMonth: '10', plateExpYear: '2028' },
  { id: 'b', year: '2017', make: 'Nissan', model: 'Sentra', plate: 'BBB2', inspMonth: '11', inspYear: '2026', plateExpMonth: '10', plateExpYear: '2026' },
  { id: 'c', year: '2022', make: 'Chevrolet', model: 'Malibu', plate: 'CCC3', inspMonth: '', inspYear: '' },
];
const agreements = [
  { vehicleId: 'a', dueDate: '2026-10-29', dateOut: '2026-10-28', checkedIn: false, drivers: [{ first: 'X', last: 'Y', license: 'SECRET' }] },
  { vehicleId: 'b', dueDate: '2026-11-08', dateOut: '2026-11-06', checkedIn: false },   // due today: not past due
  { vehicleId: 'c', dueDate: '2026-11-01', dateOut: '2026-10-30', checkedIn: true },    // returned
];

const s = buildSummary(vehicles, agreements, '2026-11-08');
assert.equal(s.cars, 3);
assert.equal(s.checkedOut, 2);
assert.equal(s.available, 1);
assert.deepEqual(s.pastDue.map(p => [p.car, p.daysPastDue]), [['2023 Kia Rio', 10]]);
assert.ok(!JSON.stringify(s).includes('SECRET'), 'no driver details in summary');

// Due yesterday -> 1 day past due.
assert.equal(buildSummary(vehicles, agreements, '2026-11-09').pastDue.length, 2);

// Sentra: plates expired Oct 2026, inspection expires end of Nov 2026 (22 days).
const exp = s.expiring.map(e => [e.car, e.what, e.daysLeft]);
assert.deepEqual(exp, [['2017 Nissan Sentra', 'plates', -8], ['2017 Nissan Sentra', 'inspection', 22]]);

// Object-shaped state and empty state don't crash.
assert.equal(buildSummary({}, {}, '2026-11-08').pastDue.length, 0);
assert.match(localToday('America/New_York', new Date('2026-11-09T03:00:00Z')), /^2026-11-08$/);

console.log('summary tests passed');
