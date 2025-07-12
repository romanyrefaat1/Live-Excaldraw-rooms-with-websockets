import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Store room data in memory
const rooms = new Map();
const clientRooms = new Map(); // Track which room each client is in

// Helper function to update active users in database
const updateActiveUsersInDatabase = async (roomId, activeUsers) => {
  try {
    const { error } = await supabase
      .from('rooms')
      .update({ active_users: activeUsers })
      .eq('id', roomId);
    
    if (error) {
      console.error('Error updating active users in database:', error);
    } else {
      console.log(`Updated active users in database for room ${roomId}:`, activeUsers);
    }
  } catch (error) {
    console.error('Error updating active users in database:', error);
  }
};

// Broadcast message to all clients in a room except sender
const broadcastToRoom = (roomId, message, excludeClient = null) => {
  if (!rooms.has(roomId)) return;
  
  const room = rooms.get(roomId);
  const messageStr = JSON.stringify(message);
  
  room.clients.forEach(client => {
    if (client !== excludeClient && client.readyState === 1) { // WebSocket.OPEN = 1
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
    if (client.readyState === 1) { // WebSocket.OPEN = 1
      client.send(messageStr);
    }
  });
};

const WebSocketHandler = (req, res) => {
  // Check if WebSocket server is already running
  if (res.socket.server.wss) {
    console.log('WebSocket server already running');
    res.end();
    return;
  }

  console.log('Starting WebSocket server...');

  // Initialize WebSocket server
  const wss = new WebSocketServer({ 
    server: res.socket.server,
    path: '/api/ws'
  });

  // Store WebSocket server instance
  res.socket.server.wss = wss;

  // WebSocket connection handling
  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    
    let currentRoom = null;
    let currentUser = null;

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const { type, ...payload } = message;

        switch (type) {
          case 'join-room':
            await handleJoinRoom(ws, payload);
            break;
          
          case 'leave-room':
            await handleLeaveRoom(ws, payload);
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
          
          case 'strokes-saved':
            handleStrokesSaved(ws, payload);
            break;
          
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
          
          case 'get-room-info':
            handleGetRoomInfo(ws, payload);
            break;
          
          default:
            console.log('Unknown message type:', type);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', async () => {
      console.log('WebSocket client disconnected');
      await handleDisconnect(ws);
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Message handlers
    const handleJoinRoom = async ({ roomId, userName }) => {
      currentRoom = roomId;
      currentUser = userName;
      
      // Remove from previous room if any
      if (clientRooms.has(ws)) {
        const previousRoom = clientRooms.get(ws);
        await leaveRoom(ws, previousRoom);
      }
      
      // Initialize room if it doesn't exist
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          clients: new Set(),
          users: new Map(),
          activeUsers: [],
          userCount: 0
        });
      }
      
      const room = rooms.get(roomId);
      
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
      room.activeUsers = [...new Set(activeUsers)]; // Remove duplicates
      room.userCount = room.clients.size;
      
      console.log(`User ${userName} joined room ${roomId}. Total users: ${room.userCount}`);
      
      // Update database with new active users
      await updateActiveUsersInDatabase(roomId, room.activeUsers);
      
      // Notify all users in the room
      sendToRoom(roomId, {
        type: 'user-connected',
        userName,
        userCount: room.userCount,
        activeUsers: room.activeUsers
      });
    };

    const handleLeaveRoom = async ({ roomId }) => {
      await leaveRoom(ws, roomId);
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

    const handleStrokeEnd = ({ roomId, userId }) => {
      broadcastToRoom(roomId, {
        type: 'stroke-end',
        userId
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
      broadcastToRoom(roomId, {
        type: 'canvas-cleared'
      }, ws);
      console.log(`Canvas cleared in room ${roomId}`);
    };

    const handleStrokesSaved = ({ roomId, userId, count }) => {
      broadcastToRoom(roomId, {
        type: 'strokes-saved',
        count,
        userId
      }, ws);
    };

    const handleGetRoomInfo = ({ roomId }) => {
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        ws.send(JSON.stringify({
          type: 'room-info',
          userCount: room.userCount,
          activeUsers: room.activeUsers
        }));
      }
    };

    const handleDisconnect = async () => {
      if (currentRoom && rooms.has(currentRoom)) {
        await leaveRoom(ws, currentRoom);
      }
      clientRooms.delete(ws);
    };

    const leaveRoom = async (client, roomId) => {
      if (!rooms.has(roomId)) return;
      
      const room = rooms.get(roomId);
      
      // Remove client from room
      room.clients.delete(client);
      room.users.delete(client);
      
      // Update active users list
      const activeUsers = Array.from(room.users.values()).map(user => user.userName);
      room.activeUsers = [...new Set(activeUsers)]; // Remove duplicates
      room.userCount = room.clients.size;
      
      console.log(`User ${currentUser} left room ${roomId}. Remaining users: ${room.userCount}`);
      
      // Update database with new active users
      await updateActiveUsersInDatabase(roomId, room.activeUsers);
      
      // If room is empty, clean it up after a delay
      if (room.userCount === 0) {
        setTimeout(async () => {
          if (rooms.has(roomId) && rooms.get(roomId).userCount === 0) {
            rooms.delete(roomId);
            // Clear active users in database when room is empty
            await updateActiveUsersInDatabase(roomId, []);
            console.log(`Room ${roomId} deleted (empty)`);
          }
        }, 30000); // 30 second delay before cleanup
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