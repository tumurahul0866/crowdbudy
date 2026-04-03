const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join_room', (data) => {
    const { roomCode, name, role, color } = data;
    socket.join(roomCode);
    
    if (!rooms[roomCode]) {
      rooms[roomCode] = {};
    }
    
    rooms[roomCode][socket.id] = { id: socket.id, name, role, color, lat: null, lng: null, seen: Date.now() };
    console.log(${name} joined room: );
    
    socket.to(roomCode).emit('member_joined', rooms[roomCode][socket.id]);
    socket.emit('room_state', Object.values(rooms[roomCode]));
    
    socket.roomCode = roomCode;
    socket.userName = name;
  });

  socket.on('position_update', (data) => {
    const { lat, lng } = data;
    if (socket.roomCode && rooms[socket.roomCode] && rooms[socket.roomCode][socket.id]) {
      rooms[socket.roomCode][socket.id].lat = lat;
      rooms[socket.roomCode][socket.id].lng = lng;
      rooms[socket.roomCode][socket.id].seen = Date.now();
      socket.to(socket.roomCode).emit('member_moved', { id: socket.id, lat, lng, seen: Date.now() });
    }
  });

  socket.on('sos_alert', () => {
    if (socket.roomCode) {
      socket.to(socket.roomCode).emit('sos_received', { id: socket.id, name: socket.userName });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.roomCode && rooms[socket.roomCode]) {
      delete rooms[socket.roomCode][socket.id];
      socket.to(socket.roomCode).emit('member_left', { id: socket.id });
      if (Object.keys(rooms[socket.roomCode]).length === 0) {
        delete rooms[socket.roomCode];
      }
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(Server running on http://localhost:);
});
