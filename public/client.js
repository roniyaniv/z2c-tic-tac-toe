// client.js
// Browser-side game logic for index.html: connects to the server with
// Socket.io, sends 'find-game' and 'make-move', and updates the page from
// server events. See README.md "Socket.io events" for the protocol.
//
// Marks are placed by setting a cell's text AND data-symbol="X"/"O";
// style.css colors and animates cells based on that attribute.

// io() connects to the host that served this page.
const socket = io();

const findGameBtn = document.getElementById('find-game');
const findGameLabel = findGameBtn.querySelector('.label');
const playAgainBtn = document.getElementById('play-again');
const statusEl = document.getElementById('status');
const boardEl = document.getElementById('board');
const cells = [...document.querySelectorAll('.cell')]; // index 0-8

// Everything the client needs to remember about the current game.
const state = {
  mySymbol: null,    // 'X' or 'O', assigned by the server
  currentTurn: null, // whose turn it is: 'X' or 'O'
  roomId: null,
  inGame: false,
  awaitingMove: false, // true between sending a move and the server's reply
  hasSearched: false,  // true once the player has clicked Find Game
};

// ---- Helpers ----

// Shows a plain status message in the default color (no turn indicator).
function setStatus(text) {
  statusEl.textContent = text;
  delete statusEl.dataset.turn;
  statusEl.classList.remove('my-turn');
}

function isMyTurn() {
  return state.inGame && !state.awaitingMove && state.currentTurn === state.mySymbol;
}

// Enables empty cells on the player's turn; disables everything otherwise.
function updateBoard() {
  const enabled = isMyTurn();
  for (const cell of cells) {
    cell.disabled = !enabled || Boolean(cell.dataset.symbol);
  }
}

// Shows whose turn it is. style.css colors the text with the current
// player's symbol color (data-turn) and pulses it on your turn (my-turn).
function showTurn() {
  const mine = isMyTurn();
  setStatus(`You are ${state.mySymbol}. ${mine ? 'Your turn' : "Opponent's turn"}`);
  statusEl.dataset.turn = state.currentTurn;
  statusEl.classList.toggle('my-turn', mine);
}

// Draws the board exactly as the server sent it, so the client can never
// drift from the server's state. A cell's data-symbol is only written when
// it changes, so only newly placed marks trigger the pop animation.
function renderBoard(board) {
  board.forEach((symbol, index) => {
    const cell = cells[index];
    if (symbol && cell.dataset.symbol !== symbol) {
      cell.textContent = symbol;
      cell.dataset.symbol = symbol;
    } else if (!symbol && cell.dataset.symbol) {
      cell.textContent = '';
      delete cell.dataset.symbol;
    }
  });
}

// Whose turn it is follows from the board: X moves first, so an even
// number of marks means it's X's turn.
function turnFromBoard(board) {
  const marks = board.filter((cell) => cell !== null).length;
  return marks % 2 === 0 ? 'X' : 'O';
}

// Clears all marks and highlights and disables the board.
function resetBoard() {
  for (const cell of cells) {
    cell.textContent = '';
    delete cell.dataset.symbol;
    cell.classList.remove('win');
    cell.disabled = true;
  }
  delete boardEl.dataset.winner;
}

// Puts the Find Game button into (or out of) its "searching" look:
// disabled, spinner visible, label "Searching...".
function setSearching(on) {
  findGameBtn.disabled = on;
  findGameBtn.classList.toggle('searching', on);
  findGameLabel.textContent = on ? 'Searching...' : 'Find Game';
}

// Ends the current game on the client: shows `message` and Play Again.
function finishGame(message) {
  state.inGame = false;
  state.awaitingMove = false;
  updateBoard();
  setStatus(message);
  setSearching(false);
  findGameBtn.hidden = true;
  playAgainBtn.hidden = false;
}

// Used by both Find Game and Play Again: clears the board and asks the
// server for an opponent. Searching always looks the same: the disabled
// Find Game button with a spinner.
function searchForGame() {
  state.hasSearched = true;
  resetBoard();
  playAgainBtn.hidden = true;
  findGameBtn.hidden = false;
  setSearching(true);
  setStatus('Searching for opponent...');
  socket.emit('find-game');
}

// ---- User actions ----

findGameBtn.addEventListener('click', searchForGame);
playAgainBtn.addEventListener('click', searchForGame);

// One listener on the board handles clicks on any cell.
boardEl.addEventListener('click', (event) => {
  const cell = event.target.closest('.cell');
  // Disabled buttons don't fire clicks, but check anyway: only send a move
  // on our turn and into an empty cell.
  if (!cell || !isMyTurn() || cell.dataset.symbol) {
    return;
  }
  socket.emit('make-move', {
    index: Number(cell.dataset.index),
    roomId: state.roomId, // the server looks up the room itself; sent for clarity
  });
  // Lock the board until the server answers, so a fast second click
  // can't send another move.
  state.awaitingMove = true;
  updateBoard();
});

// ---- Server events ----

socket.on('waiting', () => {
  setStatus('Waiting for another player...');
});

socket.on('game-start', ({ symbol, roomId }) => {
  state.mySymbol = symbol;
  state.roomId = roomId;
  state.currentTurn = 'X'; // X always moves first
  state.inGame = true;
  state.awaitingMove = false;
  setSearching(false);
  findGameBtn.hidden = true;
  showTurn();
  updateBoard();
});

socket.on('move-made', ({ board }) => {
  renderBoard(board);
  state.currentTurn = turnFromBoard(board);
  state.awaitingMove = false;
  showTurn();
  updateBoard();
  // If this move ended the game, 'game-over' arrives next and updates the page.
});

socket.on('move-rejected', ({ reason }) => {
  state.awaitingMove = false;
  updateBoard();
  setStatus(`Move rejected: ${reason}`);
  // Restore the turn message after a moment, if the game is still on.
  setTimeout(() => {
    if (state.inGame) showTurn();
  }, 1500);
});

socket.on('game-over', ({ winner, winningLine, isDraw, board }) => {
  renderBoard(board);
  if (winningLine) {
    boardEl.dataset.winner = winner; // style.css tints the line in this color
    for (const index of winningLine) {
      cells[index].classList.add('win');
    }
  }
  let message;
  if (isDraw) {
    message = "It's a draw";
  } else if (winner === state.mySymbol) {
    message = 'You win';
  } else {
    message = 'You lose';
  }
  finishGame(message);
});

socket.on('opponent-left', () => {
  finishGame('Opponent disconnected');
});

// Connection to the server lost (e.g. server restarted). Socket.io keeps
// trying to reconnect on its own, but the server has discarded any game or
// queue place, so the player has to start a new search.
socket.on('disconnect', () => {
  if (state.hasSearched) {
    finishGame('Connection lost');
  } else {
    // Player hadn't started searching yet; Find Game is still the way in.
    setStatus('Connection lost. Reconnecting...');
  }
});

socket.on('connect', () => {
  // Only matters after a reconnect: clear the "Reconnecting..." message.
  if (!state.hasSearched) {
    setStatus('Click Find Game to start');
  }
});
