// game.test.js
// Unit tests for TicTacToeGame, using Node's built-in test runner.
// Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const TicTacToeGame = require('./game');

// Plays a sequence of cell indexes (X, O, X, ... alternate automatically).
// Returns the result of the last move.
function play(game, cells) {
  let result;
  for (const cell of cells) {
    result = game.makeMove(cell);
  }
  return result;
}

test('starts with an empty board and X to move', () => {
  const game = new TicTacToeGame();
  assert.deepEqual(game.getState(), {
    board: Array(9).fill(null),
    currentTurn: 'X',
  });
});

test('a valid move places the symbol and passes the turn', () => {
  const game = new TicTacToeGame();
  const result = game.makeMove(4);
  assert.equal(result.valid, true);
  assert.equal(result.symbol, 'X');
  assert.equal(result.board[4], 'X');
  assert.equal(result.winner, null);
  assert.equal(result.isDraw, false);
  assert.equal(game.getState().currentTurn, 'O');
});

test('turns alternate X, O, X', () => {
  const game = new TicTacToeGame();
  assert.equal(game.makeMove(0).symbol, 'X');
  assert.equal(game.makeMove(1).symbol, 'O');
  assert.equal(game.makeMove(2).symbol, 'X');
});

test('rejects out-of-range and non-integer cells', () => {
  const game = new TicTacToeGame();
  for (const cell of [-1, 9, 1.5, '4', undefined, null]) {
    const result = game.makeMove(cell);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'Invalid cell');
  }
  assert.equal(game.getState().currentTurn, 'X'); // state unchanged
});

test('rejects a move into an occupied cell and keeps the turn', () => {
  const game = new TicTacToeGame();
  game.makeMove(0);
  const result = game.makeMove(0);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'Cell occupied');
  assert.equal(result.symbol, 'O');
  assert.equal(result.board[0], 'X');
  assert.equal(game.getState().currentTurn, 'O');
});

test('detects a win on every one of the 8 lines', () => {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const line of lines) {
    const game = new TicTacToeGame();
    // O plays the first two cells not in X's line.
    const others = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((c) => !line.includes(c));
    const result = play(game, [line[0], others[0], line[1], others[1], line[2]]);
    assert.equal(result.winner, 'X', `line ${line} should win`);
    assert.deepEqual(result.winningLine, line);
    assert.equal(result.isDraw, false);
  }
});

test('O can win', () => {
  const game = new TicTacToeGame();
  // X: 0, 1, 8   O: 3, 4, 5 (middle row)
  const result = play(game, [0, 3, 1, 4, 8, 5]);
  assert.equal(result.winner, 'O');
  assert.deepEqual(result.winningLine, [3, 4, 5]);
});

test('winningLine is null while the game is in progress', () => {
  const game = new TicTacToeGame();
  assert.equal(game.makeMove(0).winningLine, null);
});

test('detects a draw when the board fills with no winner', () => {
  const game = new TicTacToeGame();
  // Final board:
  //  X | O | X
  //  X | O | O
  //  O | X | X
  const result = play(game, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.equal(result.valid, true);
  assert.equal(result.winner, null);
  assert.equal(result.winningLine, null);
  assert.equal(result.isDraw, true);
});

test('a win on the final cell is a win, not a draw', () => {
  const game = new TicTacToeGame();
  //  X | O | X
  //  O | X | O
  //  O | X | X   <- X plays 8 last, completing the 0-4-8 diagonal
  const result = play(game, [0, 1, 2, 3, 4, 5, 7, 6, 8]);
  assert.equal(result.winner, 'X');
  assert.equal(result.isDraw, false);
});

test('rejects moves after the game is over', () => {
  const game = new TicTacToeGame();
  play(game, [0, 3, 1, 4, 2]); // X wins top row
  const result = game.makeMove(8);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'Game is over');
  assert.equal(result.winner, 'X');
});

test('returned boards are copies and cannot change the game', () => {
  const game = new TicTacToeGame();
  game.makeMove(0).board[0] = 'O';
  game.getState().board[1] = 'O';
  assert.deepEqual(game.getState().board.slice(0, 2), ['X', null]);
});
