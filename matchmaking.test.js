// matchmaking.test.js
// Unit tests for matchmaking.js, using fake sockets instead of a real
// Socket.io server. Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const TicTacToeGame = require('./game');
const matchmaking = require('./matchmaking');
const { fakeSocket } = require('./test-utils/fakes');

const {
  addToQueue, removeFromQueue, handleDisconnect, endGame, activeGames, socketRooms,
} = matchmaking;

// matchmaking.js does not use `io` yet; an empty object is enough.
const io = {};

test.beforeEach(() => matchmaking._reset());

test('first player is queued and told to wait', () => {
  const a = fakeSocket('a');
  addToQueue(a, io);
  assert.deepEqual(a.emitted, [{ event: 'waiting', data: undefined }]);
  assert.equal(activeGames.size, 0);
});

test('second player starts a game with the first', () => {
  const a = fakeSocket('a');
  const b = fakeSocket('b');
  addToQueue(a, io);
  addToQueue(b, io);

  const startA = a.last('game-start');
  const startB = b.last('game-start');
  assert.ok(startA && startB, 'both players receive game-start');

  // Same room, different symbols, one X and one O.
  assert.equal(startA.roomId, startB.roomId);
  assert.deepEqual([startA.symbol, startB.symbol].sort(), ['O', 'X']);

  // Both joined the room and are tracked.
  const { roomId } = startA;
  assert.ok(a.rooms.has(roomId) && b.rooms.has(roomId));
  assert.equal(socketRooms.get('a'), roomId);
  assert.equal(socketRooms.get('b'), roomId);

  // The game record holds a fresh game and maps symbols to the right sockets.
  const record = activeGames.get(roomId);
  assert.ok(record.game instanceof TicTacToeGame);
  assert.equal(record.game.getState().currentTurn, 'X');
  assert.equal(record.players[startA.symbol], a);
  assert.equal(record.players[startB.symbol], b);
});

test('symbols are assigned randomly', () => {
  // Over 50 games the first-queued player should get X at least once
  // and O at least once. Chance of a false failure: about 1 in 10^15.
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    matchmaking._reset();
    const a = fakeSocket('a');
    addToQueue(a, io);
    addToQueue(fakeSocket('b'), io);
    seen.add(a.last('game-start').symbol);
  }
  assert.deepEqual([...seen].sort(), ['O', 'X']);
});

test('each pair gets its own room', () => {
  const sockets = ['a', 'b', 'c', 'd'].map(fakeSocket);
  sockets.forEach((s) => addToQueue(s, io));
  assert.equal(activeGames.size, 2);
  assert.notEqual(socketRooms.get('a'), socketRooms.get('c'));
  assert.equal(socketRooms.get('a'), socketRooms.get('b'));
  assert.equal(socketRooms.get('c'), socketRooms.get('d'));
});

test('a socket queued twice is not paired with itself', () => {
  const a = fakeSocket('a');
  addToQueue(a, io);
  addToQueue(a, io);
  assert.equal(activeGames.size, 0);
  assert.equal(a.emitted.length, 1); // only the first 'waiting'
});

test('a socket already in a game is not queued again', () => {
  const a = fakeSocket('a');
  const b = fakeSocket('b');
  addToQueue(a, io);
  addToQueue(b, io);
  addToQueue(a, io); // ignored

  // A third player must wait rather than be paired with `a`.
  const c = fakeSocket('c');
  addToQueue(c, io);
  assert.equal(c.emitted[0].event, 'waiting');
  assert.equal(activeGames.size, 1);
});

test('removeFromQueue stops a waiting player from being paired', () => {
  const a = fakeSocket('a');
  const b = fakeSocket('b');
  addToQueue(a, io);
  removeFromQueue(a);
  addToQueue(b, io);
  assert.equal(b.emitted[0].event, 'waiting');
  assert.equal(activeGames.size, 0);
});

test('removeFromQueue ignores a socket that is not queued', () => {
  const a = fakeSocket('a');
  addToQueue(a, io);
  removeFromQueue(fakeSocket('z'));
  addToQueue(fakeSocket('b'), io);
  assert.equal(activeGames.size, 1); // `a` was still waiting
});

test('disconnect while waiting removes the player from the queue', () => {
  const a = fakeSocket('a');
  addToQueue(a, io);
  handleDisconnect(a, io);
  const b = fakeSocket('b');
  addToQueue(b, io);
  assert.equal(b.emitted[0].event, 'waiting');
});

test('disconnect during a game notifies the opponent and cleans up', () => {
  const a = fakeSocket('a');
  const b = fakeSocket('b');
  addToQueue(a, io);
  addToQueue(b, io);
  const roomId = socketRooms.get('a');

  handleDisconnect(a, io);

  assert.equal(b.emitted.at(-1).event, 'opponent-left');
  assert.equal(b.rooms.has(roomId), false);
  assert.equal(activeGames.size, 0);
  assert.equal(socketRooms.size, 0);
  assert.equal(a.emitted.some((e) => e.event === 'opponent-left'), false);
});

test('after the opponent leaves, the remaining player can queue again', () => {
  const a = fakeSocket('a');
  const b = fakeSocket('b');
  addToQueue(a, io);
  addToQueue(b, io);
  handleDisconnect(a, io);

  addToQueue(b, io);
  assert.equal(b.emitted.at(-1).event, 'waiting');
});

test('endGame removes the room and frees both players', () => {
  const a = fakeSocket('a');
  const b = fakeSocket('b');
  addToQueue(a, io);
  addToQueue(b, io);
  const roomId = socketRooms.get('a');

  endGame(roomId);

  assert.equal(activeGames.size, 0);
  assert.equal(socketRooms.size, 0);
  assert.equal(a.rooms.has(roomId), false);
  assert.equal(b.rooms.has(roomId), false);
  // Nobody is told the opponent left; the game simply ended.
  assert.equal(b.emitted.some((e) => e.event === 'opponent-left'), false);
});

test('endGame on an unknown room does nothing', () => {
  assert.doesNotThrow(() => endGame('no-such-room'));
});

test('disconnect with a stale room entry cleans up instead of crashing', () => {
  socketRooms.set('ghost', 'missing-room');
  assert.doesNotThrow(() => handleDisconnect(fakeSocket('ghost'), io));
  assert.equal(socketRooms.has('ghost'), false);
});

test('disconnect of an unknown socket does nothing', () => {
  assert.doesNotThrow(() => handleDisconnect(fakeSocket('z'), io));
});
