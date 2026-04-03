const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const dbFile = path.resolve(__dirname, 'crowdbuddy.sqlite');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS rooms (
    room_code TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    room_code TEXT,
    name TEXT,
    role TEXT,
    color TEXT,
    lat REAL,
    lng REAL,
    seen INTEGER,
    FOREIGN KEY(room_code) REFERENCES rooms(room_code)
  )`);
});

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join_room', (data) => {
    const { roomCode, name, role, color } = data;
    socket.join(roomCode);
    
    socket.roomCode = roomCode;
    socket.userName = name;

    db.serialize(() => {
      db.run(`INSERT OR IGNORE INTO rooms (room_code) VALUES (?)`, [roomCode]);
      
      const now = Date.now();
      db.run(`INSERT INTO users (id, room_code, name, role, color, lat, lng, seen)
              VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
              ON CONFLICT(id) DO UPDATE SET room_code=excluded.room_code, name=excluded.name, seen=excluded.seen`,
             [socket.id, roomCode, name, role, color, now], function(err) {
        if (err) return console.error(err);
        
        db.get(`SELECT * FROM users WHERE id = ?`, [socket.id], (err, newUser) => {
          if (newUser) socket.to(roomCode).emit('member_joined', newUser);
        });
        
        db.all(`SELECT * FROM users WHERE room_code = ?`, [roomCode], (err, rows) => {
          if (!err && rows) socket.emit('room_state', rows);
        });
      });
    });
  });

  socket.on('position_update', (data) => {
    if (!socket.roomCode) return;
    const { lat, lng } = data;
    const now = Date.now();
    db.run(`UPDATE users SET lat = ?, lng = ?, seen = ? WHERE id = ?`, [lat, lng, now, socket.id]);
    socket.to(socket.roomCode).emit('member_moved', { id: socket.id, lat, lng, seen: now });
  });

  socket.on('sos_alert', () => {
    if (socket.roomCode) {
      socket.to(socket.roomCode).emit('sos_received', { id: socket.id, name: socket.userName });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (!socket.roomCode) return;
    
    socket.to(socket.roomCode).emit('member_left', { id: socket.id });
    db.run(`DELETE FROM users WHERE id = ?`, [socket.id]);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CrowdBuddy DB Server running on http://localhost:${PORT}`);
});
