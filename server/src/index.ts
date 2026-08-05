import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import path from 'path';
import { z } from 'zod';
import { RateLimiterMemory } from 'rate-limiter-flexible';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = Number(process.env.PORT || 3000);
const MESSAGE_LIMIT = 300;
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;
const possibleStaticDirs = [
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(process.cwd(), '../client/dist'),
];
const staticDir = possibleStaticDirs.find((dir) => existsSync(dir)) || path.resolve(process.cwd(), 'client/dist');

const messageSchema = z.object({
  roomId: z.string(),
  text: z.string().min(1).max(MESSAGE_LIMIT),
  replyTo: z.string().optional(),
  username: z.string(),
});

const usernameSchema = z.object({
  username: z.string().regex(USERNAME_REGEX),
});

const rateLimiter = new RateLimiterMemory({
  points: 12,
  duration: 5,
});

const rooms = new Map<string, { id: string; name: string; owner: string; members: Set<string>; messages: Message[] }>();
const users = new Map<string, { username: string; roomId: string | null; socketId: string }>();
const globalRoomId = 'global';

interface Message {
  id: string;
  roomId: string;
  username: string;
  text: string;
  createdAt: number;
  replyTo?: string;
}

const createRoomCode = () => randomBytes(3).toString('hex').toUpperCase();

const sanitize = (value: string) => value.replace(/[<>]/g, '').trim().slice(0, MESSAGE_LIMIT);

const emitRoomState = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;

  io.to(roomId).emit('room-state', {
    roomId,
    roomCode: room.id,
    owner: room.owner,
    members: Array.from(room.members).map((member) => ({ username: users.get(member)?.username || member })),
    messageCount: room.messages.length,
  });
};

app.use(cors());
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(express.static(staticDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.post('/api/validate-username', async (req, res) => {
  try {
    const parsed = usernameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Username must be 3–20 letters, numbers, or underscores.' });
    }

    const { username } = parsed.data;
    const taken = Array.from(users.values()).some((user) => user.username === username);

    if (taken) {
      return res.status(409).json({
        error: 'This username is already taken.',
        suggestions: [
          `${username}_${Math.floor(Math.random() * 90 + 10)}`,
          `${username}1`,
          `${username}_1`,
        ],
      });
    }

    return res.json({ valid: true, available: true });
  } catch (error) {
    return res.status(500).json({ error: 'Unexpected validation error.' });
  }
});

io.on('connection', (socket) => {
  socket.on('register-user', async (payload, callback) => {
    try {
      const parsed = usernameSchema.safeParse(payload);
      if (!parsed.success) {
        callback?.({ ok: false, error: 'Invalid username.' });
        return;
      }

      const { username } = parsed.data;
      const taken = Array.from(users.values()).some((user) => user.username === username);
      if (taken) {
        callback?.({ ok: false, error: 'This username is already taken.', suggestions: [`${username}_${Math.floor(Math.random() * 90 + 10)}`, `${username}1`, `${username}_1`] });
        return;
      }

      users.set(socket.id, { username, roomId: globalRoomId, socketId: socket.id });
      socket.join(globalRoomId);

      const globalRoom = rooms.get(globalRoomId) ?? {
        id: globalRoomId,
        name: 'Global Chat',
        owner: username,
        members: new Set<string>(),
        messages: [] as Message[],
      };

      globalRoom.members.add(socket.id);
      rooms.set(globalRoomId, globalRoom);

      io.emit('user-online', { username, onlineCount: users.size });
      io.to(globalRoomId).emit('receive-message', {
        system: true,
        text: `${username} joined global chat`,
        username: 'System',
        roomId: globalRoomId,
        createdAt: Date.now(),
      });
      callback?.({ ok: true, roomId: globalRoomId, username });
    } catch (error) {
      callback?.({ ok: false, error: 'Unable to register user.' });
    }
  });

  socket.on('create-room', async (payload, callback) => {
    try {
      const user = users.get(socket.id);
      if (!user) {
        callback?.({ ok: false, error: 'Register first.' });
        return;
      }

      await rateLimiter.consume(socket.id);
      const roomCode = createRoomCode();
      const roomId = `room-${roomCode}`;

      const room = {
        id: roomId,
        name: `Room ${roomCode}`,
        owner: user.username,
        members: new Set<string>([socket.id]),
        messages: [] as Message[],
      };

      rooms.set(roomId, room);
      socket.leave(globalRoomId);
      socket.join(roomId);
      user.roomId = roomId;

      callback?.({ ok: true, room: { id: roomId, code: roomCode, owner: user.username } });
      io.to(roomId).emit('room-created', { roomId, roomCode, owner: user.username, members: [user.username] });
    } catch {
      callback?.({ ok: false, error: 'Rate limit exceeded.' });
    }
  });

  socket.on('join-room', (payload, callback) => {
    try {
      const user = users.get(socket.id);
      const parsed = z.object({ roomCode: z.string().min(4).max(8) }).safeParse(payload);
      if (!user || !parsed.success) {
        callback?.({ ok: false, error: 'Invalid room code.' });
        return;
      }

      const roomCode = parsed.data.roomCode.toUpperCase();
      const roomId = Array.from(rooms.keys()).find((id) => id.endsWith(roomCode));
      if (!roomId) {
        callback?.({ ok: false, error: 'Room not found.' });
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        callback?.({ ok: false, error: 'Room unavailable.' });
        return;
      }

      const previousRoomId = user.roomId;
      if (previousRoomId && previousRoomId !== roomId) {
        socket.leave(previousRoomId);
        rooms.get(previousRoomId)?.members.delete(socket.id);
      }

      socket.join(roomId);
      room.members.add(socket.id);
      user.roomId = roomId;

      callback?.({ ok: true, roomId, roomCode, members: Array.from(room.members).map((member) => users.get(member)?.username || member) });
      emitRoomState(roomId);
    } catch {
      callback?.({ ok: false, error: 'Unable to join room.' });
    }
  });

  socket.on('leave-room', (payload, callback) => {
    const user = users.get(socket.id);
    const roomId = payload?.roomId || user?.roomId;
    if (!user || !roomId) {
      callback?.({ ok: false, error: 'No active room.' });
      return;
    }

    const room = rooms.get(roomId);
    if (room) {
      room.members.delete(socket.id);
      socket.leave(roomId);
      if (room.members.size === 0) {
        rooms.delete(roomId);
      } else {
        emitRoomState(roomId);
      }
    }

    user.roomId = globalRoomId;
    socket.join(globalRoomId);
    callback?.({ ok: true, roomId: globalRoomId });
  });

  socket.on('send-message', (payload, callback) => {
    const user = users.get(socket.id);
    const parsed = messageSchema.safeParse(payload);
    if (!user || !parsed.success) {
      callback?.({ ok: false, error: 'Invalid message payload.' });
      return;
    }

    const roomId = parsed.data.roomId || user.roomId || globalRoomId;
    const message: Message = {
      id: randomBytes(8).toString('hex'),
      roomId,
      username: user.username,
      text: sanitize(parsed.data.text),
      createdAt: Date.now(),
      replyTo: parsed.data.replyTo,
    };

    const room = rooms.get(roomId);
    if (!room) {
      callback?.({ ok: false, error: 'Room not found.' });
      return;
    }

    room.messages.push(message);
    io.to(roomId).emit('receive-message', message);
    callback?.({ ok: true, message });
  });

  socket.on('typing', (payload) => {
    const user = users.get(socket.id);
    if (!user) return;
    socket.to(payload?.roomId || user.roomId || globalRoomId).emit('typing', { username: user.username });
  });

  socket.on('stop-typing', (payload) => {
    const user = users.get(socket.id);
    if (!user) return;
    socket.to(payload?.roomId || user.roomId || globalRoomId).emit('stop-typing', { username: user.username });
  });

  socket.on('reaction', (payload) => {
    io.to(payload.roomId).emit('reaction', payload);
  });

  socket.on('edit-message', (payload) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const message = room.messages.find((item) => item.id === payload.messageId);
    if (!message) return;
    message.text = sanitize(payload.text);
    io.to(payload.roomId).emit('message-edited', message);
  });

  socket.on('delete-message', (payload) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    room.messages = room.messages.filter((item) => item.id !== payload.messageId);
    io.to(payload.roomId).emit('message-deleted', payload.messageId);
  });

  socket.on('disconnect', () => {
    const currentUser = users.get(socket.id);
    if (!currentUser) return;

    const roomId = currentUser.roomId || globalRoomId;
    const room = rooms.get(roomId);
    if (room) {
      room.members.delete(socket.id);
      if (room.members.size === 0) {
        rooms.delete(roomId);
      } else {
        emitRoomState(roomId);
      }
    }

    users.delete(socket.id);
    io.emit('user-offline', { username: currentUser.username, onlineCount: users.size });
  });
});

httpServer.listen(PORT, () => {
  console.log(`ChatVerse server running on http://localhost:${PORT}`);
});
