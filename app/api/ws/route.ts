// pages/api/ws.js
import { WebSocketServer } from 'ws';

// Store all data in memory
const rooms = new Map();
const clientRooms = new Map();
const userSessions = new Map(); // Track user sessions

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

const WebSocketHandler = (req, res) => {
  if (res.socket.server.wss) {
    console.log('WebSocket server already running');
    res.end();
    return;
  }

  console.log('Starting WebSocket server...');

  const wss = new WebSocketServer({ 
    server: res.socket.server,
    path: '/api/ws'
  });

  res.socket.server.wss = wss;

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
            handleCreateRoom(ws, payload);
            break;
          
          case 'join-room':
            handleJoinRoom(ws, payload);
            break;
          
          case 'check-room':
            handleCheckRoom(ws, payload);
            break;
          
          case 'leave-room':
            handleLeaveRoom(ws, payload);
            break;
          
          case 'stroke-start':
            handleStrokeStart(ws, payload);
            break;
          
          case 'stroke-update':
            handleStrokeUpdate(ws, payload);
            break;
          
          case 'stroke-end':
            handleStrokeEnd(ws, payload);
            break;
          
          case 'cursor-move':
            handleCursorMove(ws, payload);
            break;
          
          case 'cursor-leave':
            handleCursorLeave(ws, payload);
            break;
          
          case 'clear-canvas':
            handleClearCanvas(ws, payload);
            break;
          
          case 'get-room-data':
            handleGetRoomData(ws, payload);
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

    // Message handlers
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
        room: {
          id: roomId,
          ownerName: ownerName
        }
      }));
    };

    const handleCheckRoom = ({ roomId }) => {
      const room = rooms.get(roomId);
      
      ws.send(JSON.stringify({
        type: 'check-room-response',
        exists: !!room,
        room: room ? {
          id: room.id,
          ownerName: room.ownerName,
          activeUsers: room.activeUsers
        } : null
      }));
    };

    const handleJoinRoom = ({ roomId, userName }) => {
      const room = rooms.get(roomId);
      
      if (!room) {
        ws.send(JSON.stringify({
          type: 'join-room-response',
          success: false,
          error: 'Room not found'
        }));
        return;
      }

      // Check if trying to join as owner when owner is already active
      if (userName === room.ownerName && room.activeUsers.includes(userName)) {
        ws.send(JSON.stringify({
          type: 'join-room-response',
          success: false,
          error: 'Owner is already active on another device'
        }));
        return;
      }

      currentRoom = roomId;
      currentUser = userName;
      
      // Remove from previous room if any
      if (clientRooms.has(ws)) {
        const previousRoom = clientRooms.get(ws);
        leaveRoom(ws, previousRoom);
      }
      
      // Add client to room
      room.clients.add(ws);
      clientRooms.set(ws, roomId);
      
      // Add user to room
      room.users.set(ws, {
        userName,
        joinedAt: Date.now()
      });
      
      // Update active users list
      const activeUsers = Array.from(room.users.values()).map(user => user.userName);
      room.activeUsers = [...new Set(activeUsers)];
      room.userCount = room.clients.size;
      
      console.log(`User ${userName} joined room ${roomId}. Total users: ${room.userCount}`);
      
      // Send success response with room data
      ws.send(JSON.stringify({
        type: 'join-room-response',
        success: true,
        room: {
          id: roomId,
          ownerName: room.ownerName,
          activeUsers: room.activeUsers,
          userCount: room.userCount,
          strokes: room.strokes
        }
      }));
      
      // Notify all users in the room
      sendToRoom(roomId, {
        type: 'user-connected',
        userName,
        userCount: room.userCount,
        activeUsers: room.activeUsers
      });
    };

    const handleLeaveRoom = ({ roomId }) => {
      leaveRoom(ws, roomId);
    };

    const handleStrokeStart = ({ roomId, userId, x, y, color, size }) => {
      broadcastToRoom(roomId, {
        type: 'stroke-start',
        userId,
        x,
        y,
        color,
        size
      }, ws);
    };

    const handleStrokeUpdate = ({ roomId, userId, x, y, color, size }) => {
      broadcastToRoom(roomId, {
        type: 'stroke-update',
        userId,
        x,
        y,
        color,
        size
      }, ws);
    };

    const handleStrokeEnd = ({ roomId, userId, stroke }) => {
      const room = rooms.get(roomId);
      if (room && stroke) {
        // Save stroke to room
        room.strokes.push({
          ...stroke,
          id: stroke.id || Date.now(),
          userId,
          timestamp: Date.now()
        });
      }
      
      broadcastToRoom(roomId, {
        type: 'stroke-end',
        userId,
        stroke
      }, ws);
    };

    const handleCursorMove = ({ roomId, userId, x, y, color }) => {
      broadcastToRoom(roomId, {
        type: 'cursor-move',
        userId,
        x,
        y,
        color
      }, ws);
    };

    const handleCursorLeave = ({ roomId, userId }) => {
      broadcastToRoom(roomId, {
        type: 'cursor-leave',
        userId
      }, ws);
    };

    const handleClearCanvas = ({ roomId }) => {
      const room = rooms.get(roomId);
      if (room) {
        room.strokes = []; // Clear all strokes
      }
      
      sendToRoom(roomId, {
        type: 'canvas-cleared'
      });
      
      console.log(`Canvas cleared in room ${roomId}`);
    };

    const handleGetRoomData = ({ roomId }) => {
      const room = rooms.get(roomId);
      if (room) {
        ws.send(JSON.stringify({
          type: 'room-data',
          room: {
            id: roomId,
            ownerName: room.ownerName,
            activeUsers: room.activeUsers,
            userCount: room.userCount,
            strokes: room.strokes
          }
        }));
      }
    };

    const handleDisconnect = () => {
      if (currentRoom && rooms.has(currentRoom)) {
        leaveRoom(ws, currentRoom);
      }
      clientRooms.delete(ws);
    };

    const leaveRoom = (client, roomId) => {
      if (!rooms.has(roomId)) return;
      
      const room = rooms.get(roomId);
      
      // Remove client from room
      room.clients.delete(client);
      room.users.delete(client);
      
      // Update active users list
      const activeUsers = Array.from(room.users.values()).map(user => user.userName);
      room.activeUsers = [...new Set(activeUsers)];
      room.userCount = room.clients.size;
      
      console.log(`User ${currentUser} left room ${roomId}. Remaining users: ${room.userCount}`);
      
      // If room is empty, clean it up after a delay
      if (room.userCount === 0) {
        setTimeout(() => {
          if (rooms.has(roomId) && rooms.get(roomId).userCount === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
          }
        }, 30000);
      } else {
        // Notify remaining users
        sendToRoom(roomId, {
          type: 'user-disconnected',
          userName: currentUser,
          userCount: room.userCount,
          activeUsers: room.activeUsers
        });
      }
    };
  });

  console.log('WebSocket server setup complete');
  res.end();
};

export default WebSocketHandler;