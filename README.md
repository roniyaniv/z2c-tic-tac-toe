# Tic-Tac-Toe

A real-time tic-tac-toe game server built with Node.js, Express and Socket.io.

## Requirements

- Node.js 18 or later

## Install

```sh
npm install
```

## Run

```sh
npm start
```

The server listens on port 3000 by default. To use a different port, set `PORT`:

```sh
PORT=8080 npm start
```

Open `http://localhost:3000` in two browser windows and click Find Game in
each to play against yourself. The server terminal logs each connect and
disconnect:

```
Player connected: <socket id>
Player disconnected: <socket id>
```

If the port is already taken, the server exits with
`Port 3000 is already in use...`; stop the other server or set `PORT`.

### Disconnect detection

Closing a tab is detected immediately. A dropped network (Wi-Fi lost, laptop
asleep) is detected by Socket.io's heartbeat within about 15 seconds
(`pingInterval: 10000`, `pingTimeout: 5000` in `server.js`); the opponent
then receives `opponent-left`.

## Test

```sh
npm test
```

Runs all `*.test.js` files with Node's built-in test runner
(no extra packages needed).

## Game logic (`game.js`)

`TicTacToeGame` holds the state of one game. It has no networking code.

```js
const TicTacToeGame = require('./game');
const game = new TicTacToeGame();

game.makeMove(4);
// { valid: true, symbol: 'X', winner: null, winningLine: null, isDraw: false, board: [...] }

game.makeMove(4);
// { valid: false, reason: 'Cell occupied', symbol: 'O', ... }

game.getState();
// { board: [...], currentTurn: 'O' }
```

- Cells are numbered 0-8, left to right, top to bottom.
- X always moves first; each valid move places the current player's symbol
  and passes the turn.
- The class does not know which client is which player. The server must
  only call `makeMove` on behalf of the player whose turn it is.
- A rejected move leaves the game unchanged and returns one of these reasons:
  `Game is over`, `Invalid cell`, `Cell occupied`.

## Matchmaking (`matchmaking.js`)

Pairs players into games.

| Export                         | What it does                                                        |
|--------------------------------|---------------------------------------------------------------------|
| `addToQueue(socket, io)`       | Pairs with a waiting player, or queues the socket                   |
| `removeFromQueue(socket)`      | Removes a socket from the waiting queue                             |
| `handleDisconnect(socket, io)` | Removes from queue, or ends the game and notifies the opponent      |
| `endGame(roomId)`              | Deletes a game; both players leave the room and can queue again     |
| `activeGames`                  | Map: `roomId -> { game, players: { X: socket, O: socket } }`        |
| `socketRooms`                  | Map: `socketId -> roomId`                                           |

A socket that is already waiting or already in a game is ignored by
`addToQueue`. After `opponent-left` or `game-over`, the client decides
whether to send `find-game` again.

## Moves (`moves.js`)

`handleMove(socket, index, io)` checks the sender is in a game and that it
is their turn, applies the move with `game.makeMove`, and broadcasts the
result. A finished game is deleted with `endGame`.

## Socket.io events

Client to server:

| Event       | Payload     | Effect                                   |
|-------------|-------------|------------------------------------------|
| `find-game` | none        | Join the queue, or start a game          |
| `make-move` | `{ index }` | Play cell `index` (0-8)                  |

Server to client:

| Event           | Sent to      | Payload                     | When                                         |
|-----------------|--------------|-----------------------------|----------------------------------------------|
| `waiting`       | the player   | none                        | Queued, no opponent yet                      |
| `game-start`    | each player  | `{ symbol, roomId }`        | Paired; `symbol` is `'X'` or `'O'` (random)  |
| `move-made`     | both players | `{ index, symbol, board }`  | A valid move was played                      |
| `move-rejected` | the player   | `{ reason }`                | Move refused (see reasons below)             |
| `game-over`     | both players | `{ winner, winningLine, isDraw, board }` | Sent right after the final `move-made`; `winningLine` is e.g. `[0, 4, 8]`, or `null` on a draw |
| `opponent-left` | the player   | none                        | Opponent disconnected; the game is discarded |

`move-rejected` reasons: `Not in a game`, `Not your turn`, `Invalid cell`,
`Cell occupied`.

## Project layout

| Path               | Purpose                                              |
|--------------------|------------------------------------------------------|
| `server.js`        | Express static server; wires Socket.io events to the modules |
| `game.js`          | `TicTacToeGame` class: board, turns, win/draw logic  |
| `game.test.js`     | Unit tests for `game.js`                             |
| `matchmaking.js`   | Waiting queue, pairing, room tracking, disconnects   |
| `matchmaking.test.js` | Unit tests for `matchmaking.js` (fake sockets)    |
| `moves.js`         | `handleMove`: turn check, apply move, broadcast      |
| `moves.test.js`    | Unit tests for `moves.js`                            |
| `test-utils/fakes.js` | Fake socket and io objects shared by the tests    |
| `public/`          | Client files served to the browser                   |
| `public/index.html`| Game page: Find Game button, status, 3x3 board, Play Again |
| `public/style.css` | Page styles; marks are styled via `data-symbol="X"/"O"` on cells |
| `public/client.js` | Browser game logic: buttons, board clicks, server events |
