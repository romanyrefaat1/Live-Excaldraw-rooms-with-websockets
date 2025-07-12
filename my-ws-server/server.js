const { createServer } = require('http');
const { WebSocketServer } = require('ws');

// Store all data in memory
const rooms = new Map();
const clientRooms = new Map();

const createRoom = (roomId, ownerName) => ({
  id: roomId,
  ownerName,
  clients: new Set(),
  users: new Map(),
  activeUsers: [],
  userCount: 0,
  strokes: [],
  createdAt: Date.now(),
});

const broadcastToRoom = (roomId, message, excludeClient = null) => {
  if (!rooms.has(roomId)) return;
  const room = rooms.get(roomId);
  const messageStr = JSON.stringify(message);
  room.clients.forEach((client) => {
    if (client !== excludeClient && client.readyState === 1) {
      client.send(messageStr);
    }
  });
};

const sendToRoom = (roomId, message) => {
  if (!rooms.has(roomId)) return;
  const room = rooms.get(roomId);
  const messageStr = JSON.stringify(message);
  room.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(messageStr);
    }
  });
};

// Create HTTP server (only needed to bind WebSocket)
const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  let currentRoom = null;
  let currentUser = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      const { type, ...payload } = message;

      switch (type) {
        case 'create-room': {
          if (rooms.has(payload.roomId)) {
            ws.send(JSON.stringify({
              type: 'create-room-response',
              success: false,
              error: 'Room already exists',
            }));
            return;
          }
          const room = createRoom(payload.roomId, payload.ownerName);
          rooms.set(payload.roomId, room);
          ws.send(JSON.stringify({
            type: 'create-room-response',
            success: true,
            room: { id: payload.roomId, ownerName: payload.ownerName },
          }));
          break;
        }

        case 'check-room': {
          const room = rooms.get(payload.roomId);
          ws.send(JSON.stringify({
            type: 'check-room-response',
            exists: !!room,
            room: room ? { id: room.id, ownerName: room.ownerName, activeUsers: room.activeUsers } : null,
          }));
          break;
        }

        case 'join-room': {
          const room = rooms.get(payload.roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: 'join-room-response', success: false, error: 'Room not found' }));
            return;
          }
          if (payload.userName === room.ownerName && room.activeUsers.includes(payload.userName)) {
            ws.send(JSON.stringify({ type: 'join-room-response', success: false, error: 'Owner already active' }));
            return;
          }

          currentRoom = payload.roomId;
          currentUser = payload.userName;

          if (clientRooms.has(ws)) {
            const previousRoom = clientRooms.get(ws);
            leaveRoom(ws, previousRoom);
          }

          room.clients.add(ws);
          clientRooms.set(ws, payload.roomId);
          room.users.set(ws, { userName: payload.userName, joinedAt: Date.now() });

          const activeUsers = Array.from(room.users.values()).map((u) => u.userName);
          room.activeUsers = [...new Set(activeUsers)];
          room.userCount = room.clients.size;

          ws.send(JSON.stringify({
            type: 'join-room-response',
            success: true,
            room: {
              id: room.id,
              ownerName: room.ownerName,
              activeUsers: room.activeUsers,
              userCount: room.userCount,
              strokes: room.strokes,
            },
          }));

          sendToRoom(payload.roomId, {
            type: 'user-connected',
            userName: payload.userName,
            userCount: room.userCount,
            activeUsers: room.activeUsers,
          });
          break;
        }

        case 'leave-room': {
          leaveRoom(ws, payload.roomId);
          break;
        }

        case 'stroke-start':
        case 'stroke-update':
        case 'stroke-end':
        case 'cursor-move':
        case 'cursor-leave':
        case 'clear-canvas': {
          handleRoomActions(type, payload, ws);
          break;
        }

        case 'get-room-data': {
          const room = rooms.get(payload.roomId);
          if (room) {
            ws.send(JSON.stringify({
              type: 'room-data',
              room: {
                id: room.id,
                ownerName: room.ownerName,
                activeUsers: room.activeUsers,
                userCount: room.userCount,
                strokes: room.strokes,
              },
            }));
          }
          break;
        }

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.log('Unknown type:', type);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom) leaveRoom(ws, currentRoom);
    clientRooms.delete(ws);
  });

  const leaveRoom = (client, roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.clients.delete(client);
    room.users.delete(client);

    const activeUsers = Array.from(room.users.values()).map((u) => u.userName);
    room.activeUsers = [...new Set(activeUsers)];
    room.userCount = room.clients.size;

    if (room.userCount === 0) {
      setTimeout(() => {
        if (room.userCount === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted`);
        }
      }, 30000);
    } else {
      sendToRoom(roomId, {
        type: 'user-disconnected',
        userName: currentUser,
        userCount: room.userCount,
        activeUsers: room.activeUsers,
      });
    }
  };

  const handleRoomActions = (type, payload, ws) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    switch (type) {
      case 'stroke-start':
      case 'stroke-update':
        broadcastToRoom(payload.roomId, { type, ...payload }, ws);
        break;
      case 'stroke-end':
        room.strokes.push({ ...payload.stroke, userId: payload.userId, timestamp: Date.now() });
        broadcastToRoom(payload.roomId, { type, ...payload }, ws);
        break;
      case 'cursor-move':
      case 'cursor-leave':
        broadcastToRoom(payload.roomId, { type, ...payload }, ws);
        break;
      case 'clear-canvas':
        room.strokes = [];
        sendToRoom(payload.roomId, { type: 'canvas-cleared' });
        break;
    }
  };
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});