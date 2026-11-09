// moves.js
// Handles a 'make-move' request from a player: checks it is that player's
// turn, applies the move, and tells both players what happened.

const { activeGames, socketRooms, endGame, startTurnTimer } = require('./matchmaking');

// `index` is the cell (0-8) the player clicked. It comes from the client,
// so it is untrusted; game.makeMove validates it.
//
// Events sent:
//   'move-rejected' { reason }               -> only the sender
//   'move-made'     { index, symbol, board } -> the whole room
//   'game-over'     { winner, winningLine, isDraw, board, timedOut: false }
//                                            -> the whole room, after move-made
// (A forfeit on timeout sends 'game-over' with timedOut: true; see
// startTurnTimer in matchmaking.js.)
function handleMove(socket, index, io) {
  const roomId = socketRooms.get(socket.id);
  const record = roomId && activeGames.get(roomId);
  if (!record) {
    // Either not in a game, or the two maps disagree (should not happen);
    // in the latter case drop the stale entry rather than throwing.
    if (roomId) socketRooms.delete(socket.id);
    socket.emit('move-rejected', { reason: 'Not in a game' });
    return;
  }

  const { game, players } = record;

  // Turn check: game.js places whichever symbol's turn it is, so the server
  // must make sure the sender is the player whose turn it is.
  const senderSymbol = players.X === socket ? 'X' : 'O';
  if (senderSymbol !== game.getState().currentTurn) {
    socket.emit('move-rejected', { reason: 'Not your turn' });
    return;
  }

  const result = game.makeMove(index);
  if (!result.valid) {
    socket.emit('move-rejected', { reason: result.reason });
    return;
  }

  io.to(roomId).emit('move-made', {
    index,
    symbol: result.symbol,
    board: result.board,
  });

  if (result.winner || result.isDraw) {
    io.to(roomId).emit('game-over', {
      winner: result.winner,
      winningLine: result.winningLine,
      isDraw: result.isDraw,
      board: result.board,
      timedOut: false,
    });
    // Free the room so finished games don't linger in memory and both
    // players can send 'find-game' again. This also stops the turn timer.
    endGame(roomId);
  } else {
    // Next player's turn: give them a fresh countdown.
    startTurnTimer(roomId, io);
  }
}

module.exports = { handleMove };
