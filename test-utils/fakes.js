// test-utils/fakes.js
// Minimal stand-ins for Socket.io objects, shared by the unit tests.
// They record what was sent so tests can inspect it.

// Fake socket: records emitted events and joined rooms.
function fakeSocket(id) {
  return {
    id,
    emitted: [],
    rooms: new Set(),
    emit(event, data) { this.emitted.push({ event, data }); },
    join(room) { this.rooms.add(room); },
    leave(room) { this.rooms.delete(room); },
    // Returns the data of the most recent `event`, or undefined.
    last(event) {
      return this.emitted.filter((e) => e.event === event).pop()?.data;
    },
  };
}

// Fake io server: records every io.to(room).emit(event, data) call
// in `io.sent` as { room, event, data }.
function fakeIo() {
  const io = {
    sent: [],
    to(room) {
      return { emit: (event, data) => io.sent.push({ room, event, data }) };
    },
  };
  return io;
}

module.exports = { fakeSocket, fakeIo };
