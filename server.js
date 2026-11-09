// server.js
// Tic-tac-toe game server.
// - Express serves the static client files in ./public
// - Socket.io provides real-time communication between players and the server
// - matchmaking.js pairs players; moves.js applies moves and enforces turns

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { addToQueue, handleDisconnect } = require('./matchmaking');
const { handleMove } = require('./moves');

// Port comes from the environment (e.g. set by a hosting provider), else 3000.
const PORT = process.env.PORT || 3000;

const app = express();

// Socket.io needs a raw Node HTTP server, so wrap the Express app in one.
const server = http.createServer(app);

// Heartbeat: the server pings each client every 10s and treats it as gone
// if no reply within 5s. A dropped network (Wi-Fi lost, laptop asleep) is
// thus detected in ~15s instead of the default ~45s, so opponents learn
// sooner and nobody is paired with a dead connection for long.
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Serve everything in ./public (index.html, scripts, styles).
// __dirname makes the path independent of the directory the server is started from.
app.use(express.static(path.join(__dirname, 'public')));

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
