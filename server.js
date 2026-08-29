const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Serve static files from root directory
app.use(express.static(__dirname));

// Explicit route to load index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let waitingUser = null;

io.on('connection', (socket) => {
  // 1. Matchmaking Queue
  socket.on('find-match', () => {
    if (waitingUser && waitingUser.id !== socket.id) {
      const roomID = `room_${socket.id}_${waitingUser.id}`;
      socket.join(roomID);
      waitingUser.join(roomID);

      socket.currentRoom = roomID;
      waitingUser.currentRoom = roomID;

      io.to(socket.id).emit('matched', { roomID, initiator: true });
      io.to(waitingUser.id).emit('matched', { roomID, initiator: false });

      waitingUser = null;
    } else {
      waitingUser = socket;
      socket.emit('waiting');
    }
  });

  // 2. WebRTC Signaling Relays
  socket.on('signal', ({ roomID, data }) => {
    socket.to(roomID).emit('signal', data);
  });

  // 3. Text Chat Relay
  socket.on('send-message', ({ roomID, text }) => {
    socket.to(roomID).emit('receive-message', { text, sender: 'Stranger' });
  });

  // 4. Leave / Next Action
  function leaveCurrentRoom(userSocket) {
    if (userSocket.currentRoom) {
      userSocket.to(userSocket.currentRoom).emit('stranger-disconnected');
      userSocket.leave(userSocket.currentRoom);
      userSocket.currentRoom = null;
    }
    if (waitingUser && waitingUser.id === userSocket.id) {
      waitingUser = null;
    }
  }

  socket.on('leave-match', () => {
    leaveCurrentRoom(socket);
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));