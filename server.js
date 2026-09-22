require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DEFAULT_TEACHER_KEY = process.env.TEACHER_DEFAULT_KEY || 'PASSWORD';

// ---------- Storage ----------
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let rooms = {};
if (fs.existsSync(DATA_FILE)) {
  try {
    rooms = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    rooms = {};
  }
}

function saveRooms() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(rooms, null, 2));
}

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- REST API ----------
app.post('/api/create-room', (req, res) => {
  const { roomId, teacherKey } = req.body;
  if (!roomId || !teacherKey)
    return res.status(400).json({ error: 'roomId and teacherKey required' });

  if (teacherKey !== DEFAULT_TEACHER_KEY)
    return res.status(403).json({ error: 'Invalid teacher key' });

  if (rooms[roomId])
    return res.status(409).json({ error: 'Room already exists' });

  rooms[roomId] = {
    teacherKey,
    currentVideoId: null,
    queue: [],
    createdAt: Date.now()
  };
  saveRooms();

  res.json({ success: true, roomId });
});

app.get('/api/room/:roomId', (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(404).json({ exists: false });
  res.json({ exists: true, hasVideo: !!room.currentVideoId });
});

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  console.log('[socket] connected:', socket.id);

  socket.on('teacher-join', ({ roomId, teacherKey }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error-msg', 'Room not found');
    if (room.teacherKey !== teacherKey)
      return socket.emit('error-msg', 'Wrong teacher key');

    socket.join(roomId);
    socket.role = 'teacher';
    socket.roomId = roomId;

    socket.emit('sync-state', {
      videoId: room.currentVideoId,
      queue: room.queue
    });

    io.to(roomId).emit('teacher-online');
  });

  socket.on('student-join', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error-msg', 'Room not found');

    socket.join(roomId);
    socket.role = 'student';
    socket.roomId = roomId;

    socket.emit('sync-state', {
      videoId: room.currentVideoId,
      queue: room.queue
    });
  });

  socket.on('play-video', ({ roomId, videoId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.currentVideoId = videoId;
    saveRooms();

    io.to(roomId).emit('video-changed', { videoId });
  });

  socket.on('add-to-queue', ({ roomId, videoId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.queue.push(videoId);
    saveRooms();

    io.to(roomId).emit('queue-updated', { queue: room.queue });
  });

  socket.on('play-next', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.queue.length === 0) return;

    const next = room.queue.shift();
    room.currentVideoId = next;
    saveRooms();

    io.to(roomId).emit('video-changed', { videoId: next });
    io.to(roomId).emit('queue-updated', { queue: room.queue });
  });

  socket.on('stop-video', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.currentVideoId = null;
    saveRooms();

    io.to(roomId).emit('video-stopped');
  });

  socket.on('chat-message', ({ roomId, name, text }) => {
    io.to(roomId).emit('chat-message', { name, text, time: Date.now() });
  });

  socket.on('disconnect', () => {
    if (socket.role === 'teacher' && socket.roomId) {
      io.to(socket.roomId).emit('teacher-offline');
    }
    console.log('[socket] disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`   Teacher key: ${DEFAULT_TEACHER_KEY}`);
});