// matchmaking.js
// Pairs waiting players into games and cleans up when players leave.
// Move handling and turn enforcement live in moves.js, which looks up a
// player's game through the exported `activeGames` and `socketRooms` maps.

const crypto = require('crypto');
const TicTacToeGame = require('./game');

// A player who doesn't move within this time forfeits the game, so an idle
// opponent can't leave the other player stuck forever.
const TURN_TIME_MS = 60_000;

// Sockets waiting for an opponent, oldest first.
const waitingQueue = [];

// roomId -> { game: TicTacToeGame, players: { X: socket, O: socket },
//             turnTimer: timeout handle for the current turn }
const activeGames = new Map();

// socketId -> roomId, for every socket currently in a game.
const socketRooms = new Map();

// Puts `socket` into a game if someone is waiting, otherwise queues it.
// 'game-start' goes to each socket individually because each player gets a
// different symbol; `io` is used by the turn timer to broadcast a forfeit.
function addToQueue(socket, io) {
  // Guards: a socket already waiting or already playing must not be
  // queued again (e.g. a double click), or it could be paired with itself
  // or end up in two games at once.
  if (waitingQueue.includes(socket) || socketRooms.has(socket.id)) {
    return;
  }

  if (waitingQueue.length === 0) {
    waitingQueue.push(socket);
    socket.emit('waiting');
    return;
  }

  const opponent = waitingQueue.shift();
  const roomId = crypto.randomUUID();
  const game = new TicTacToeGame();

  // Coin flip decides who plays X (and therefore moves first).
  const [xSocket, oSocket] =
    Math.random() < 0.5 ? [socket, opponent] : [opponent, socket];

  activeGames.set(roomId, { game, players: { X: xSocket, O: oSocket } });
  socketRooms.set(xSocket.id, roomId);
  socketRooms.set(oSocket.id, roomId);

  xSocket.join(roomId);
  oSocket.join(roomId);
  xSocket.emit('game-start', { symbol: 'X', roomId });
  oSocket.emit('game-start', { symbol: 'O', roomId });
  startTurnTimer(roomId, io);
}

// (Re)starts the countdown for whoever's turn it is. moves.js calls this
// after every valid move that doesn't end the game. When it expires, the
// player to move forfeits: both players get 'game-over' with timedOut: true.
function startTurnTimer(roomId, io) {
  const record = activeGames.get(roomId);
  if (!record) {
    return;
  }
  clearTimeout(record.turnTimer);
  record.turnTimer = setTimeout(() => {
    const { game } = record;
    const { board, currentTurn } = game.getState();
    io.to(roomId).emit('game-over', {
      winner: currentTurn === 'X' ? 'O' : 'X',
      winningLine: null,
      isDraw: false,
      board,
      timedOut: true,
    });
    endGame(roomId);
  }, TURN_TIME_MS);
  // unref: a pending timer alone shouldn't keep Node running (matters for
  // tests; the HTTP server keeps the real process alive anyway).
  record.turnTimer.unref?.();
}

// Removes `socket` from the waiting queue, if it is there.
function removeFromQueue(socket) {
  const index = waitingQueue.indexOf(socket);
  if (index !== -1) {
    waitingQueue.splice(index, 1);
  }
}

// Call when a socket disconnects. Removes it from the queue, or ends its
// game: the opponent is told with 'opponent-left' and the room is deleted.
// The opponent is not re-queued; the client decides what to do next.
function handleDisconnect(socket, io) {
  removeFromQueue(socket);

  const roomId = socketRooms.get(socket.id);
  if (!roomId) {
    return;
  }

  const record = activeGames.get(roomId);
  if (!record) {
    // The two maps disagree (should not happen). Drop the stale entry
    // rather than throwing, which would crash the server.
    socketRooms.delete(socket.id);
    return;
  }

  const { players } = record;
  const opponent = players.X === socket ? players.O : players.X;

  opponent.emit('opponent-left');
  endGame(roomId);
}

// Deletes a game: both players leave the Socket.io room and are no longer
// tracked as playing, so they can send 'find-game' again.
// Used when a game finishes and when a player disconnects.
function endGame(roomId) {
  const record = activeGames.get(roomId);
  if (!record) {
    return;
  }
  clearTimeout(record.turnTimer);
  for (const player of Object.values(record.players)) {
    player.leave(roomId);
    socketRooms.delete(player.id);
  }
  activeGames.delete(roomId);
}

// Test-only: clears all state. Empties the containers in place so the
// exported references stay valid.
function _reset() {
  waitingQueue.length = 0;
  for (const record of activeGames.values()) {
    clearTimeout(record.turnTimer);
  }
  activeGames.clear();
  socketRooms.clear();
}

module.exports = {
  addToQueue,
  removeFromQueue,
  handleDisconnect,
  endGame,
  startTurnTimer,
  TURN_TIME_MS,
  activeGames,
  socketRooms,
  _reset,
};
