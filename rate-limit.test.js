// rate-limit.test.js
// Unit tests for rate-limit.js. Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventLimiter, createConnectionLimiter } = require('./rate-limit');

// A controllable clock for the token bucket.
function fakeClock() {
  let t = 0;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

test('event limiter allows a burst up to capacity, then refuses', () => {
  const allow = createEventLimiter({ capacity: 3, refillPerSecond: 1 }, fakeClock());
  assert.deepEqual([allow(), allow(), allow(), allow()], [true, true, true, false]);
});

test('event limiter refills over time', () => {
  const clock = fakeClock();
  const allow = createEventLimiter({ capacity: 2, refillPerSecond: 2 }, clock);
  allow(); allow();
  assert.equal(allow(), false);
  clock.advance(500); // half a second at 2/s = 1 token
  assert.equal(allow(), true);
  assert.equal(allow(), false);
});

test('event limiter never refills beyond capacity', () => {
  const clock = fakeClock();
  const allow = createEventLimiter({ capacity: 2, refillPerSecond: 10 }, clock);
  clock.advance(60_000);
  assert.deepEqual([allow(), allow(), allow()], [true, true, false]);
});

test('connection limiter caps connections per IP', () => {
  const limiter = createConnectionLimiter(2);
  assert.equal(limiter.tryAdd('1.1.1.1'), true);
  assert.equal(limiter.tryAdd('1.1.1.1'), true);
  assert.equal(limiter.tryAdd('1.1.1.1'), false);
  assert.equal(limiter.tryAdd('2.2.2.2'), true); // other IPs unaffected
});

test('connection limiter frees a slot on remove and forgets idle IPs', () => {
  const limiter = createConnectionLimiter(1);
  limiter.tryAdd('1.1.1.1');
  limiter.remove('1.1.1.1');
  assert.equal(limiter.size(), 0);
  assert.equal(limiter.tryAdd('1.1.1.1'), true);
});

test('connection limiter ignores remove for an unknown IP', () => {
  const limiter = createConnectionLimiter(1);
  assert.doesNotThrow(() => limiter.remove('9.9.9.9'));
  assert.equal(limiter.size(), 0);
});
