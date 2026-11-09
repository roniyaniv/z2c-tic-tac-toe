// game.js
// Pure game logic for tic-tac-toe. Has no knowledge of sockets or HTTP,
// so it can be tested on its own and reused by the server.
//
// Board layout (cell indexes):
//   0 | 1 | 2
//   3 | 4 | 5
//   6 | 7 | 8

// All 8 ways to win: 3 rows, 3 columns, 2 diagonals.
const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
];

class TicTacToeGame {
  constructor() {
    this.board = Array(9).fill(null); // null = empty, otherwise 'X' or 'O'
    this.currentTurn = 'X';           // X always goes first
    this.winner = null;               // 'X', 'O', or null
    this.winningLine = null;          // e.g. [0, 4, 8] once someone wins
    this.isDraw = false;
  }

  // Places the current player's symbol at `cellIndex`.
  // This class does not know which client is which player: the caller
  // (server/matchmaking) must ensure only the player whose turn it is
  // can trigger a move.
  // Returns { valid, symbol, winner, winningLine, isDraw, board } and, when
  // the move is rejected, a `reason` string explaining why.
  makeMove(cellIndex) {
    // Validation order matters: report the most fundamental problem first.
    if (this.winner || this.isDraw) {
      return this._reject('Game is over');
    }
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) {
      return this._reject('Invalid cell');
    }
    if (this.board[cellIndex] !== null) {
      return this._reject('Cell occupied');
    }

    const symbol = this.currentTurn;
    this.board[cellIndex] = symbol;
    this.winningLine = this._findWinningLine();
    this.winner = this.winningLine ? symbol : null;
    // A full board with no winner is a draw.
    this.isDraw = !this.winner && this.board.every((cell) => cell !== null);

    // Only pass the turn while the game is still going.
    if (!this.winner && !this.isDraw) {
      this.currentTurn = this.currentTurn === 'X' ? 'O' : 'X';
    }

    return {
      valid: true,
      symbol,
      winner: this.winner,
      winningLine: this.winningLine,
      isDraw: this.isDraw,
      board: [...this.board],
    };
  }

  // Returns a snapshot of the game. The board is copied so callers
  // cannot alter the game state by modifying the returned array.
  getState() {
    return {
      board: [...this.board],
      currentTurn: this.currentTurn,
    };
  }

  // Returns the winning line (a copy, e.g. [0, 4, 8]) if one symbol fills
  // it, else null. Only the player who just moved can have completed a
  // line, so the winner is that player.
  _findWinningLine() {
    for (const line of WINNING_LINES) {
      const [a, b, c] = line;
      const cell = this.board[a];
      if (cell && cell === this.board[b] && cell === this.board[c]) {
        return [...line];
      }
    }
    return null;
  }

  // Builds the response for a rejected move. The game state is unchanged.
  // `symbol` is the player whose move was attempted.
  _reject(reason) {
    return {
      valid: false,
      reason,
      symbol: this.currentTurn,
      winner: this.winner,
      winningLine: this.winningLine,
      isDraw: this.isDraw,
      board: [...this.board],
    };
  }
}

module.exports = TicTacToeGame;
