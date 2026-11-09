# Tic Tac Toe

Real-time two-player tic-tac-toe in the browser, matched over WebSockets.

## How to Play

1. Click **Find Game**. You wait until another player does the same.
2. When paired, each player is randomly assigned **X** or **O**. X moves first.
3. Take turns clicking empty cells. The status line shows whose turn it is
   (blue for X, red for O).
4. Three in a row (horizontal, vertical, or diagonal) wins and is highlighted.
   A full board with no winner is a draw.
5. Click **Play Again** to be matched with the next available player.

If your opponent closes the page or loses their connection, you are told
and can start a new game.

## Tech Stack

- **Node.js** — server runtime
- **Express** — serves the static page
- **Socket.io** — real-time communication over WebSockets
- **Vanilla HTML/CSS/JS** — browser client, no framework or build step

## Run Locally

Requires Node.js 18 or later.

```sh
git clone <repository-url>
cd tic-tac-toe
npm install
node server.js        # or: npm start
```

Open `http://localhost:3000` in two browser windows and click Find Game in
each to play against yourself.

- Different port: `PORT=8080 node server.js`
- Run the tests: `npm test` (Node's built-in test runner, no extra packages)

## How It Works

The server holds all game state and is the single source of truth; the
browser only displays it and sends the player's clicks.

```
Browser (client.js)  <── WebSocket (Socket.io) ──>  server.js
                                                      ├─ matchmaking.js  queue, pairing, rooms
                                                      ├─ moves.js        turn check, apply move
                                                      └─ game.js         board, win/draw rules
```

1. The page opens a persistent WebSocket connection to the server.
2. `find-game` puts the player in a queue. When two are waiting, the server
   creates a game, puts both in a private Socket.io room, and sends each
   `game-start` with their symbol.
3. A click sends `make-move`. The server checks it is that player's game and
   turn, applies it, and broadcasts the new board to both players at once.
   Invalid moves are refused with a reason.
4. After a win or draw the server sends `game-over` and deletes the game.
   Disconnects are detected (within ~15 s for a dropped network) and the
   opponent is notified.

### Events

| Direction        | Event           | Payload                                  |
|------------------|-----------------|------------------------------------------|
| client → server  | `find-game`     | none                                     |
| client → server  | `make-move`     | `{ index }` (cell 0-8)                   |
| server → client  | `waiting`       | none                                     |
| server → client  | `game-start`    | `{ symbol, roomId }`                     |
| server → client  | `move-made`     | `{ index, symbol, board }`               |
| server → client  | `move-rejected` | `{ reason }`                             |
| server → client  | `game-over`     | `{ winner, winningLine, isDraw, board }` |
| server → client  | `opponent-left` | none                                     |

### Files

| Path                  | Purpose                                            |
|-----------------------|----------------------------------------------------|
| `server.js`           | HTTP server, static files, Socket.io event wiring  |
| `matchmaking.js`      | Waiting queue, pairing, room tracking, disconnects |
| `moves.js`            | Turn check, apply move, broadcast result           |
| `game.js`             | `TicTacToeGame`: board, turns, win/draw logic      |
| `*.test.js`           | Unit tests; `test-utils/fakes.js` has fake sockets |
| `public/index.html`   | Game page                                          |
| `public/style.css`    | Styles, animations, mobile layout                  |
| `public/client.js`    | Browser logic: buttons, clicks, server events      |

Each source file has inline comments with further detail.
