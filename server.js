// server.js
// Tic-tac-toe game server.
// - Express serves the static client files in ./public
// - Socket.io provides real-time communication between players and the server
// - matchmaking.js pairs players; moves.js applies moves and enforces turns
// - rate-limit.js protects the public server from floods

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const { Server } = require('socket.io');
const { addToQueue, handleDisconnect } = require('./matchmaking');
const { handleMove } = require('./moves');
const { createEventLimiter, createConnectionLimiter } = require('./rate-limit');

// Port comes from the environment (e.g. set by a hosting provider), else 3000.
const PORT = process.env.PORT || 3000;

// Behind a reverse proxy (Render), the client's real IP is in the
// X-Forwarded-For header; locally it is the socket address. Render sets
// RENDER=true automatically; TRUST_PROXY=1 enables this on other hosts.
const TRUST_PROXY = Boolean(process.env.TRUST_PROXY || process.env.RENDER);

// Abuse limits. A real player sends at most a couple of events per second.
const MAX_CONNECTIONS_PER_IP = 10;  // allows several players behind one home/office router
const EVENT_BURST = 10;             // events allowed in a quick burst
const EVENTS_PER_SECOND = 5;        // sustained rate after the burst
const MAX_MESSAGE_BYTES = 4096;     // our largest message is ~100 bytes

const app = express();

// Security headers (Content Security Policy, no MIME sniffing, etc.).
// upgrade-insecure-requests is turned off so plain-http localhost works in
// every browser; on Render the site is HTTPS-only anyway.
app.use(helmet({
  contentSecurityPolicy: {
    directives: { upgradeInsecureRequests: null },
  },
}));

// Health check for the hosting platform: 200 means the process is up.
app.get('/health', (req, res) => {
  res.type('text/plain').send('ok');
});

// Fredoka font files, served from the @fontsource/fredoka package instead of
// Google Fonts, so visitors' browsers make no third-party requests.
app.use('/fonts', express.static(
  path.join(__dirname, 'node_modules', '@fontsource', 'fredoka', 'files'),
  { maxAge: '30d' },
));

// Serve everything in ./public (index.html, scripts, styles).
// __dirname makes the path independent of the directory the server is started from.
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io needs a raw Node HTTP server, so wrap the Express app in one.
const server = http.createServer(app);

const io = new Server(server, {
  // Heartbeat: the server pings each client every 10s and treats it as gone
  // if no reply within 5s. A dropped network (Wi-Fi lost, laptop asleep) is
  // thus detected in ~15s instead of the default ~45s.
  pingInterval: 10000,
  pingTimeout: 5000,

  // Reject oversized messages (default is 1 MB).
  maxHttpBufferSize: MAX_MESSAGE_BYTES,

  // Only accept browser connections from pages served by this server, so
  // other websites can't embed it. Non-browser clients send no Origin header
  // and can't be stopped this way; the rate limits below cover them.
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    if (!origin) {
      return callback(null, true);
    }
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === req.headers.host;
    } catch {
      // Malformed Origin header: reject.
    }
    callback(null, sameHost);
  },
});

// Returns the client's IP address for per-IP limits.
// With a proxy, the first X-Forwarded-For entry is used. A client can forge
// that entry to dodge the per-IP cap, but cannot use it to block anyone
// else; the per-socket event limit still applies to forgers.
function clientIp(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (TRUST_PROXY && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address;
}

const connectionLimiter = createConnectionLimiter(MAX_CONNECTIONS_PER_IP);

// Runs before each new connection is accepted: refuse IPs that already
// have too many open connections.
io.use((socket, next) => {
  const ip = clientIp(socket);
  if (!connectionLimiter.tryAdd(ip)) {
    console.warn(`Connection refused, too many from ${ip}`);
    return next(new Error('Too many connections'));
  }
  socket.data.ip = ip;
  next();
});

// Wraps a socket event handler so an unexpected error is logged instead of
// crashing the whole server (and ending every game in progress).
function safe(eventName, socket, handler) {
  return (...args) => {
    try {
      handler(...args);
    } catch (err) {
      console.error(`Error handling '${eventName}' from ${socket.id}:`, err);
    }
  };
}

// Runs once for each client that opens a Socket.io connection.
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Every incoming event passes through this limiter first. A client that
  // floods the server is disconnected.
  const allowEvent = createEventLimiter({
    capacity: EVENT_BURST,
    refillPerSecond: EVENTS_PER_SECOND,
  });
  socket.use((packet, next) => {
    if (allowEvent()) {
      return next();
    }
    // Events already in flight still arrive after the disconnect; drop them
    // silently so a flooder can't fill the log.
    if (!socket.data.kicked) {
      socket.data.kicked = true;
      console.warn(`Disconnecting ${socket.id} (${socket.data.ip}): too many events`);
      socket.disconnect(true);
    }
  });

  // Client asks to be paired with an opponent.
  socket.on('find-game', safe('find-game', socket, () => {
    addToQueue(socket, io);
  }));

  // Client sends a move as { index } where index is a cell 0-8.
  // `data?.index` avoids a crash if the client sends nothing or a bare value;
  // moves.js rejects anything that is not a valid cell.
  socket.on('make-move', safe('make-move', socket, (data) => {
    handleMove(socket, data?.index, io);
  }));

  // Runs when that client closes the page or loses its connection.
  socket.on('disconnect', safe('disconnect', socket, () => {
    console.log(`Player disconnected: ${socket.id}`);
    connectionLimiter.remove(socket.data.ip);
    handleDisconnect(socket, io);
  }));
});

// Startup errors: give a clear message for the common "port in use" case.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other server or set PORT to a different number.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
