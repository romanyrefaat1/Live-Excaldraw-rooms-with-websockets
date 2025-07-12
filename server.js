// server.js
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;
const wsPort = 3001; // Separate port for WebSocket

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store all data in memory
const rooms = new Map();
const clientRooms = new Map();
const userSessions = new Map();

// Room data structure
const createRoom = (roomId, ownerName) => ({
  id: roomId,
  ownerName,
  clients: new Set(),
  users: new Map(),
  activeUsers: [],
  userCount: 0,
  strokes: [],
  createdAt: Date.now()
});

// Broadcast message to all clients in a room except sender
const broadcastToRoom = (roomId, message, excludeClient = null) => {
  if (!rooms.has(roomId)) return;

  const room = rooms.get(roomId);
  const messageStr = JSON.stringify(message);

  room.clients.forEach(client => {
    if (client !== excludeClient && client.readyState === 1) {
      client.send(messageStr);
    }
  });
};

// Send message to all clients in a room including sender
const sendToRoom = (roomId, message) => {
  if (!rooms.has(roomId)) return;

  const room = rooms.get(roomId);
  const messageStr = JSON.stringify(message);

  room.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(messageStr);
    }
  });
};

app.prepare().then(() => {
  // Create HTTP server for Next.js
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Create separate HTTP server for WebSocket
  const wsServer = createServer();
  
  // Initialize WebSocket server on separate port
  const wss = new WebSocketServer({ server: wsServer });

  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');

    let currentRoom = null;
    let currentUser = null;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const { type, ...payload } = message;

        switch (type) {
          case 'create-room':
            const handleCreateRoom = ({ roomId, ownerName }) => {
              if (rooms.has(roomId)) {
                ws.send(JSON.stringify({
                  type: 'create-room-response',
                  success: false,
                  error: 'Room already exists'
                }));
                return;
              }
              const room = createRoom(roomId, ownerName);
              rooms.set(roomId, room);
              console.log(`Room ${roomId} created by ${ownerName}`);
              ws.send(JSON.stringify({
                type: 'create-room-response',
                success: true,
                room: { id: roomId, ownerName: ownerName }
              }));
            };
            handleCreateRoom(payload);
            break;

          case 'check-room':
            const handleCheckRoom = ({ roomId }) => {
              const room = rooms.get(roomId);
              ws.send(JSON.stringify({
                type: 'check-room-response',
                exists: !!room,
                room: room ? { id: room.id, ownerName: room.ownerName, activeUsers: room.activeUsers } : null
              }));
            };
            handleCheckRoom(payload);
            break;

          case 'join-room':
            const handleJoinRoom = ({ roomId, userName }) => {
              const room = rooms.get(roomId);
              if (!room) {
                ws.send(JSON.stringify({ type: 'join-room-response', success: false, error: 'Room not found' }));
                return;
              }
              if (userName === room.ownerName && room.activeUsers.includes(userName)) {
                ws.send(JSON.stringify({ type: 'join-room-response', success: false, error: 'Owner is already active on another device' }));
                return;
              }
              currentRoom = roomId;
              currentUser = userName;
              if (clientRooms.has(ws)) {
                const previousRoom = clientRooms.get(ws);
                leaveRoom(ws, previousRoom);
              }
              room.clients.add(ws);
              clientRooms.set(ws, roomId);
              room.users.set(ws, { userName, joinedAt: Date.now() });
              const activeUsers = Array.from(room.users.values()).map(user => user.userName);
              room.activeUsers = [...new Set(activeUsers)];
              room.userCount = room.clients.size;
              console.log(`User ${userName} joined room ${roomId}. Total users: ${room.userCount}`);
              ws.send(JSON.stringify({
                type: 'join-room-response',
                success: true,
                room: { id: roomId, ownerName: room.ownerName, activeUsers: room.activeUsers, userCount: room.userCount, strokes: room.strokes }
              }));
              sendToRoom(roomId, { type: 'user-connected', userName, userCount: room.userCount, activeUsers: room.activeUsers });
            };
            handleJoinRoom(payload);
            break;

          case 'leave-room':
            const handleLeaveRoom = ({ roomId }) => {
              leaveRoom(ws, roomId);
            };
            handleLeaveRoom(payload);
            break;

          case 'stroke-start':
            const handleStrokeStart = ({ roomId, userId, x, y, color, size }) => {
              broadcastToRoom(roomId, { type: 'stroke-start', userId, x, y, color, size }, ws);
            };
            handleStrokeStart(payload);
            break;

          case 'stroke-update':
            const handleStrokeUpdate = ({ roomId, userId, x, y, color, size }) => {
              broadcastToRoom(roomId, { type: 'stroke-update', userId, x, y, color, size }, ws);
            };
            handleStrokeUpdate(payload);
            break;

          case 'stroke-end':
            const handleStrokeEnd = ({ roomId, userId, stroke }) => {
              const room = rooms.get(roomId);
              if (room && stroke) {
                room.strokes.push({ ...stroke, id: stroke.id || Date.now(), userId, timestamp: Date.now() });
              }
              broadcastToRoom(roomId, { type: 'stroke-end', userId, stroke }, ws);
            };
            handleStrokeEnd(payload);
            break;

          case 'cursor-move':
            const handleCursorMove = ({ roomId, userId, x, y, color }) => {
              broadcastToRoom(roomId, { type: 'cursor-move', userId, x, y, color }, ws);
            };
            handleCursorMove(payload);
            break;

          case 'cursor-leave':
            const handleCursorLeave = ({ roomId, userId }) => {
              broadcastToRoom(roomId, { type: 'cursor-leave', userId }, ws);
            };
            handleCursorLeave(payload);
            break;

          case 'clear-canvas':
            const handleClearCanvas = ({ roomId }) => {
              const room = rooms.get(roomId);
              if (room) {
                room.strokes = [];
              }
              sendToRoom(roomId, { type: 'canvas-cleared' });
              console.log(`Canvas cleared in room ${roomId}`);
            };
            handleClearCanvas(payload);
            break;

          case 'get-room-data':
            const handleGetRoomData = ({ roomId }) => {
              const room = rooms.get(roomId);
              if (room) {
                ws.send(JSON.stringify({
                  type: 'room-data',
                  room: { id: roomId, ownerName: room.ownerName, activeUsers: room.activeUsers, userCount: room.userCount, strokes: room.strokes }
                }));
              }
            };
            handleGetRoomData(payload);
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

          default:
            console.log('Unknown message type:', type);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Helper function for leaving a room
    const leaveRoom = (client, roomId) => {
      if (!rooms.has(roomId)) return;

      const room = rooms.get(roomId);
      room.clients.delete(client);
      room.users.delete(client);

      const activeUsers = Array.from(room.users.values()).map(user => user.userName);
      room.activeUsers = [...new Set(activeUsers)];
      room.userCount = room.clients.size;

      console.log(`User ${currentUser} left room ${roomId}. Remaining users: ${room.userCount}`);

      if (room.userCount === 0) {
        setTimeout(() => {
          if (rooms.has(roomId) && rooms.get(roomId).userCount === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
          }
        }, 30000);
      } else {
        sendToRoom(roomId, { type: 'user-disconnected', userName: currentUser, userCount: room.userCount, activeUsers: room.activeUsers });
      }
    };

    const handleDisconnect = (client) => {
      if (currentRoom && rooms.has(currentRoom)) {
        leaveRoom(client, currentRoom);
      }
      clientRooms.delete(client);
    };
  });

  // Start Next.js server
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Next.js server ready on http://${hostname}:${port}`);
  });

  // Start WebSocket server on separate port
  wsServer.listen(wsPort, (err) => {
    if (err) throw err;
    console.log(`> WebSocket server ready on ws://${hostname}:${wsPort}`);
  });
});