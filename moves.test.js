// moves.test.js
// Unit tests for moves.js, using fake sockets and a fake io server.
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const matchmaking = require('./matchmaking');
const { handleMove } = require('./moves');
const { fakeSocket, fakeIo } = require('./test-utils/fakes');

const { addToQueue, activeGames, socketRooms } = matchmaking;

// Starts a game between two fake sockets and returns them by symbol,
// along with the room ID and a fresh fake io.
function startGame() {
  const a = fakeSocket('a');
  const b = fakeSocket('b');
  addToQueue(a, {});
  addToQueue(b, {});
  const roomId = socketRooms.get('a');
  const { players } = activeGames.get(roomId);
  return { x: players.X, o: players.O, roomId, io: fakeIo() };
}

// Events of a given name sent to the room through io.
function sentToRoom(io, event) {
  return io.sent.filter((s) => s.event === event);
}

test.beforeEach(() => matchmaking._reset());

test('a valid move is broadcast to the room', () => {
  const { x, roomId, io } = startGame();
  handleMove(x, 4, io);

  const moves = sentToRoom(io, 'move-made');
  assert.equal(moves.length, 1);
  assert.equal(moves[0].room, roomId);
  assert.equal(moves[0].data.index, 4);
  assert.equal(moves[0].data.symbol, 'X');
  assert.equal(moves[0].data.board[4], 'X');
  assert.equal(sentToRoom(io, 'game-over').length, 0);
});

test('a move out of turn is rejected and the board is unchanged', () => {
  const { o, roomId, io } = startGame();
  handleMove(o, 4, io);

  assert.deepEqual(o.last('move-rejected'), { reason: 'Not your turn' });
  assert.equal(io.sent.length, 0);
  assert.equal(activeGames.get(roomId).game.getState().board[4], null);
});

test('X cannot move twice in a row', () => {
  const { x, io } = startGame();
  handleMove(x, 0, io);
  handleMove(x, 1, io);
  assert.deepEqual(x.last('move-rejected'), { reason: 'Not your turn' });
  assert.equal(sentToRoom(io, 'move-made').length, 1);
});

test('a move into an occupied cell is rejected with the reason', () => {
  const { x, o, io } = startGame();
  handleMove(x, 0, io);
  handleMove(o, 0, io);
  assert.deepEqual(o.last('move-rejected'), { reason: 'Cell occupied' });
  assert.equal(sentToRoom(io, 'move-made').length, 1);
});

test('an invalid index from the client is rejected', () => {
  const { x, io } = startGame();
  for (const bad of [-1, 9, 'abc', undefined, null, { index: 1 }]) {
    handleMove(x, bad, io);
    assert.deepEqual(x.last('move-rejected'), { reason: 'Invalid cell' });
  }
  assert.equal(io.sent.length, 0);
});

test('a player not in a game is rejected', () => {
  const loner = fakeSocket('z');
  const io = fakeIo();
  handleMove(loner, 0, io);
  assert.deepEqual(loner.last('move-rejected'), { reason: 'Not in a game' });
  assert.equal(io.sent.length, 0);
});

test('a stale room entry is rejected and cleaned up, not a crash', () => {
  // Simulate the maps disagreeing: socket mapped to a room that doesn't exist.
  const ghost = fakeSocket('ghost');
  socketRooms.set('ghost', 'missing-room');
  const io = fakeIo();

  assert.doesNotThrow(() => handleMove(ghost, 0, io));
  assert.deepEqual(ghost.last('move-rejected'), { reason: 'Not in a game' });
  assert.equal(socketRooms.has('ghost'), false);
  assert.equal(io.sent.length, 0);
});

test('a winning move sends move-made, then game-over, then ends the game', () => {
  const { x, o, roomId, io } = startGame();
  // X takes the top row: 0, 1, 2. O plays 3, 4.
  [[x, 0], [o, 3], [x, 1], [o, 4], [x, 2]].forEach(([p, i]) => handleMove(p, i, io));

  const last = io.sent.slice(-2);
  assert.equal(last[0].event, 'move-made');
  assert.equal(last[0].data.index, 2);
  assert.equal(last[1].event, 'game-over');
  assert.equal(last[1].room, roomId);
  assert.equal(last[1].data.winner, 'X');
  assert.deepEqual(last[1].data.winningLine, [0, 1, 2]);
  assert.equal(last[1].data.isDraw, false);
  assert.deepEqual(last[1].data.board.slice(0, 3), ['X', 'X', 'X']);

  // Room cleaned up; both players free to play again.
  assert.equal(activeGames.size, 0);
  assert.equal(socketRooms.size, 0);
  assert.equal(x.rooms.has(roomId), false);
  assert.equal(o.rooms.has(roomId), false);
});

test('a draw sends game-over with isDraw true', () => {
  const { x, o, io } = startGame();
  // Final board:  X O X / X O O / O X X
  const moves = [0, 1, 2, 4, 3, 5, 7, 6, 8];
  moves.forEach((cell, i) => handleMove(i % 2 === 0 ? x : o, cell, io));

  const over = sentToRoom(io, 'game-over');
  assert.equal(over.length, 1);
  assert.equal(over[0].data.winner, null);
  assert.equal(over[0].data.winningLine, null);
  assert.equal(over[0].data.isDraw, true);
  assert.equal(activeGames.size, 0);
});

test('a move after the game ended is rejected as not in a game', () => {
  const { x, o, io } = startGame();
  [[x, 0], [o, 3], [x, 1], [o, 4], [x, 2]].forEach(([p, i]) => handleMove(p, i, io));
  handleMove(o, 8, io);
  assert.deepEqual(o.last('move-rejected'), { reason: 'Not in a game' });
});

test('players can queue again after a game ends', () => {
  const { x, o, io } = startGame();
  [[x, 0], [o, 3], [x, 1], [o, 4], [x, 2]].forEach(([p, i]) => handleMove(p, i, io));
  addToQueue(x, {});
  addToQueue(o, {});
  assert.equal(activeGames.size, 1);
});
