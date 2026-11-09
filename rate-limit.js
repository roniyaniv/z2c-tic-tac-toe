// rate-limit.js
// Abuse protection for the public server:
// - createEventLimiter: caps how many events one socket may send per second
// - createConnectionLimiter: caps simultaneous connections per IP address
// Both are plain functions with no Socket.io dependency, so they are easy to test.

// Token bucket: the socket starts with `capacity` tokens; each event spends
// one; tokens refill at `refillPerSecond`. Short bursts are fine, a sustained
// flood runs out of tokens.
// Returns a function that answers "may this event go through?" (true/false).
// `now` is injectable for tests.
function createEventLimiter({ capacity, refillPerSecond }, now = Date.now) {
  let tokens = capacity;
  let last = now();
  return function allow() {
    const t = now();
    tokens = Math.min(capacity, tokens + ((t - last) / 1000) * refillPerSecond);
    last = t;
    if (tokens < 1) {
      return false;
    }
    tokens -= 1;
    return true;
  };
}

// Counts open connections per IP. `tryAdd(ip)` returns false when that IP
// is already at the limit; call `remove(ip)` when a connection closes.
// Entries are deleted at zero so the map doesn't grow forever.
function createConnectionLimiter(maxPerIp) {
  const counts = new Map();
  return {
    tryAdd(ip) {
      const count = counts.get(ip) || 0;
      if (count >= maxPerIp) {
        return false;
      }
      counts.set(ip, count + 1);
      return true;
    },
    remove(ip) {
      const count = counts.get(ip) || 0;
      if (count <= 1) {
        counts.delete(ip);
      } else {
        counts.set(ip, count - 1);
      }
    },
    size() {
      return counts.size;
    },
  };
}

module.exports = { createEventLimiter, createConnectionLimiter };
