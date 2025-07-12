"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSocketContext } from "@/hooks/useSocket";

export default function DrawingCanvas({ roomId, userName, roomData }) {
  const canvasRef = useRef(null);
  const { sendMessage, addEventListener, removeEventListener, isConnected } = useSocketContext();

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [strokeSize, setStrokeSize] = useState(3);
  const [strokeColor, setStrokeColor] = useState("#2563eb");
  const [isReplaying, setIsReplaying] = useState(false);
  // isLoading is now managed by the parent RoomPage component
  const [connectedUsers, setConnectedUsers] = useState(roomData?.userCount || 0);
  const [activeUsers, setActiveUsers] = useState(roomData?.activeUsers || []);
  const [isOwner, setIsOwner] = useState(false);
  const [roomOwner, setRoomOwner] = useState(roomData?.ownerName || null);
  // ownerConflict is now derived from initial roomData and userName
  const [ownerConflict, setOwnerConflict] = useState(false);

  // Cursor tracking state
  const [otherCursors, setOtherCursors] = useState(new Map());
  const [isMouseOnCanvas, setIsMouseOnCanvas] = useState(false);

  // Refs for optimization
  const cursorThrottleRef = useRef(null);
  const drawingStrokeRef = useRef(null); // To store the current stroke being drawn locally

  // Canvas state management - now only stores strokes from the server
  const canvasStateRef = useRef({
    strokes: roomData?.strokes || []
  });

  // Set initial owner status and check for owner conflict
  useEffect(() => {
    if (roomData && userName) {
      const isCurrentOwner = userName === roomData.ownerName;
      setIsOwner(isCurrentOwner);
      setRoomOwner(roomData.ownerName);

      // Check for owner conflict based on initial room data
      if (isCurrentOwner && roomData.activeUsers.includes(userName)) {
        setOwnerConflict(true);
      } else {
        setOwnerConflict(false);
      }
    }
  }, [roomData, userName]);

  // Utility functions
  const generateUserColor = (username) => {
    const colors = [
      '#ef4444', '#f97316', '#eab308', '#22c55e',
      '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // --- Drawing functions ---
  // Draws a complete stroke from start to end
  const drawStroke = useCallback((stroke) => {
    if (!stroke || !stroke.points || stroke.points.length < 2) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.forEach(point => {
      ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }, []);

  // Redraws all strokes stored in canvasStateRef.current.strokes
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear entire canvas

    // Redraw all saved strokes
    canvasStateRef.current.strokes.forEach(stroke => {
      drawStroke(stroke);
    });
  }, [drawStroke]);

  // Socket event listeners
  useEffect(() => {
    // Only set up listeners if we have a socket, room ID, user name, and no owner conflict
    if (!isConnected || !roomId || !userName || ownerConflict) return;

    console.log('Setting up WebSocket listeners for DrawingCanvas...');

    const handleUserConnected = (data) => {
      console.log('User connected:', data);
      setConnectedUsers(data.userCount);
      setActiveUsers(data.activeUsers);
    };

    const handleUserDisconnected = (data) => {
      console.log('User disconnected:', data);
      setConnectedUsers(data.userCount);
      setActiveUsers(data.activeUsers);
      // Remove cursor if disconnected user had one
      setOtherCursors(prev => {
        const newCursors = new Map(prev);
        newCursors.delete(data.userName);
        return newCursors;
      });
    };

    const handleStrokeStart = (data) => {
      if (data.userId !== userName) {
        const ctx = canvasRef.current.getContext("2d");
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.size;
        ctx.beginPath();
        ctx.moveTo(data.x, data.y);
        // Store a temporary stroke for live drawing by others
        drawingStrokeRef.current = {
          userId: data.userId,
          points: [{ x: data.x, y: data.y }],
          color: data.color,
          size: data.size
        };
      }
    };

    const handleStrokeUpdate = (data) => {
      if (data.userId !== userName && drawingStrokeRef.current?.userId === data.userId) {
        const ctx = canvasRef.current.getContext("2d");
        ctx.lineTo(data.x, data.y);
        ctx.stroke();
        // Update the temporary stroke's points
        drawingStrokeRef.current.points.push({ x: data.x, y: data.y });
      }
    };

    const handleStrokeEnd = (data) => {
      if (data.userId !== userName) {
        const ctx = canvasRef.current.getContext("2d");
        ctx.stroke(); // Ensure the path is closed and stroked for the remote stroke

        // If the stroke data is provided, add it to the canvas state
        if (data.stroke) {
          canvasStateRef.current.strokes.push(data.stroke);
          // Redraw the entire canvas to ensure consistency
          redrawCanvas();
        }
        drawingStrokeRef.current = null; // Clear temporary stroke
      }
    };

    const handleCursorMove = (data) => {
      if (data.userId !== userName) {
        setOtherCursors(prev => {
          const newCursors = new Map(prev);
          newCursors.set(data.userId, {
            x: data.x,
            y: data.y,
            color: data.color,
            lastSeen: Date.now()
          });
          return newCursors;
        });
      }
    };

    const handleCursorLeave = (data) => {
      if (data.userId !== userName) {
        setOtherCursors(prev => {
          const newCursors = new Map(prev);
          newCursors.delete(data.userId);
          return newCursors;
        });
      }
    };

    const handleCanvasCleared = () => {
      console.log('Canvas cleared by remote command.');
      clearCanvasLocally();
    };

    // Attach listeners
    addEventListener('user-connected', handleUserConnected);
    addEventListener('user-disconnected', handleUserDisconnected);
    addEventListener('stroke-start', handleStrokeStart);
    addEventListener('stroke-update', handleStrokeUpdate);
    addEventListener('stroke-end', handleStrokeEnd);
    addEventListener('cursor-move', handleCursorMove);
    addEventListener('cursor-leave', handleCursorLeave);
    addEventListener('canvas-cleared', handleCanvasCleared);

    // Cleanup listeners on unmount or dependency change
    return () => {
      console.log('Cleaning up WebSocket listeners...');
      removeEventListener('user-connected', handleUserConnected);
      removeEventListener('user-disconnected', handleUserDisconnected);
      removeEventListener('stroke-start', handleStrokeStart);
      removeEventListener('stroke-update', handleStrokeUpdate);
      removeEventListener('stroke-end', handleStrokeEnd);
      removeEventListener('cursor-move', handleCursorMove);
      removeEventListener('cursor-leave', handleCursorLeave);
      removeEventListener('canvas-cleared', handleCanvasCleared);
    };
  }, [isConnected, roomId, userName, ownerConflict, addEventListener, removeEventListener, redrawCanvas]);

  // Canvas setup and initial drawing
  useEffect(() => {
    if (!canvasRef.current || ownerConflict) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Set canvas size and style
    const setupCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.imageSmoothingEnabled = true;
    };

    setupCanvas();
    redrawCanvas(); // Draw initial strokes from roomData

    // Cleanup other cursors that might have gone stale
    const cursorCleanupInterval = setInterval(() => {
      const now = Date.now();
      setOtherCursors(prev => {
        const newCursors = new Map();
        for (const [user, cursor] of prev) {
          if (now - cursor.lastSeen < 15000) { // Keep cursors seen in the last 15 seconds
            newCursors.set(user, cursor);
          }
        }
        return newCursors;
      });
    }, 5000); // Check every 5 seconds

    // Handle window resize
    const handleResize = () => {
      if (canvasRef.current) {
        setupCanvas();
        redrawCanvas(); // Redraw content after resize
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearInterval(cursorCleanupInterval);
      window.removeEventListener('resize', handleResize);
    };
  }, [ownerConflict, redrawCanvas]); // Depend on ownerConflict to re-run setup if it changes

  // Clear canvas locally
  const clearCanvasLocally = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    canvasStateRef.current.strokes = []; // Clear local stroke array
  }, []);

  // Throttled cursor broadcasting
  const broadcastCursor = useCallback((x, y) => {
    if (cursorThrottleRef.current) {
      clearTimeout(cursorThrottleRef.current);
    }

    cursorThrottleRef.current = setTimeout(() => {
      if (sendMessage('cursor-move', {
        roomId,
        userId: userName,
        x,
        y,
        color: generateUserColor(userName)
      })) {
        // Message sent
      }
    }, 50); // Throttle to roughly 20 FPS
  }, [roomId, userName, sendMessage]);

  // Event handlers for drawing
  const handleMouseDown = (e) => {
    if (isReplaying || ownerConflict) return;

    const pos = getMousePos(e);
    const newStroke = {
      id: crypto.randomUUID(), // Client-side ID for local tracking
      points: [pos],
      size: strokeSize,
      color: strokeColor,
      userId: userName, // Add userId to the stroke
      timestamp: Date.now()
    };

    setIsDrawing(true);
    setCurrentStroke(newStroke); // Store the stroke currently being drawn

    // Emit stroke start to other users
    sendMessage('stroke-start', {
      roomId,
      userId: userName,
      x: pos.x,
      y: pos.y,
      color: strokeColor,
      size: strokeSize
    });

    // Start drawing locally
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeSize;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const handleMouseMove = (e) => {
    const pos = getMousePos(e);
    broadcastCursor(pos.x, pos.y);

    if (isDrawing && currentStroke) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      // Update current stroke points
      const updatedStroke = {
        ...currentStroke,
        points: [...currentStroke.points, pos]
      };
      setCurrentStroke(updatedStroke);

      // Emit stroke update to other users
      sendMessage('stroke-update', {
        roomId,
        userId: userName,
        x: pos.x,
        y: pos.y,
        color: strokeColor,
        size: strokeSize
      });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentStroke) return;

    setIsDrawing(false);

    // Add the completed stroke to the local canvas state
    canvasStateRef.current.strokes.push(currentStroke);

    // Emit stroke end to other users, including the full stroke data for persistence on server
    sendMessage('stroke-end', {
      roomId,
      userId: userName,
      stroke: currentStroke // Send the full stroke object
    });

    setCurrentStroke(null);
  };

  const handleMouseEnter = () => {
    setIsMouseOnCanvas(true);
  };

  const handleMouseLeave = () => {
    setIsMouseOnCanvas(false);

    // Emit cursor leave
    sendMessage('cursor-leave', {
      roomId,
      userId: userName
    });

    // If drawing when mouse leaves canvas, stop drawing
    if (isDrawing) {
      handleMouseUp(); // Call mouseUp to finalize the stroke
    }
  };

  // Clear canvas function (only callable by owner)
  const clearCanvas = () => {
    if (ownerConflict || !isOwner || isReplaying) return;

    // Emit clear-canvas event to the server
    sendMessage('clear-canvas', { roomId });
    // The server will then broadcast 'canvas-cleared' back to all clients,
    // which will trigger clearCanvasLocally via the event listener.
  };

  // Replay strokes function
  const replayStrokes = async () => {
    if (!canvasStateRef.current.strokes.length || ownerConflict || isReplaying) return;

    console.log('Starting replay...');
    setIsReplaying(true);

    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); // Clear for replay

    for (const stroke of canvasStateRef.current.strokes) {
      if (!stroke.points || stroke.points.length < 2) continue;

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 1; i < stroke.points.length; i++) {
        const p0 = stroke.points[i - 1];
        const p1 = stroke.points[i];
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();

        await new Promise((res) => setTimeout(res, 3)); // Small delay for animation
      }
    }
    setIsReplaying(false);
    redrawCanvas(); // Redraw final state after replay
    console.log('Replay completed');
  };

  return (
    <div className="relative">
      {/* Owner conflict warning */}
      {ownerConflict && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h2 className="text-xl font-bold text-red-600 mb-4">Access Denied</h2>
            <p className="text-gray-700 mb-4">
              The room owner ({roomOwner}) is already active on another device.
              Only one device can be logged in as the owner at a time.
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
            >
              Go Back to Home
            </button>
          </div>
        </div>
      )}

      {/* Enhanced control panel */}
      <div className="fixed top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 shadow-lg border z-20">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-600">
              {isConnected ? 'Connected' : 'Disconnected'} - {connectedUsers} user{connectedUsers !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Current User Display */}
        <div className="mb-3">
          <span className="text-sm font-medium">
            You: <span className="text-blue-600">{userName}</span>
            {isOwner && <span className="ml-1">👑</span>}
          </span>
        </div>

        {/* Room Owner Display */}
        <div className="mb-3">
          <span className="text-sm font-medium">
            Room Owner: <span className="text-yellow-600">{roomOwner}</span>
          </span>
        </div>

        {/* Active Users Display */}
        <div className="mb-3">
          <label className="text-sm font-medium mb-1 block">Active Users ({activeUsers.length}):</label>
          <div className="flex flex-wrap gap-1">
            {activeUsers.map((user, index) => (
              <span
                key={index}
                className={`px-2 py-1 rounded-full text-xs ${
                  user === roomOwner
                    ? 'bg-yellow-200 text-yellow-800 border border-yellow-300'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {user} {user === roomOwner && '👑'}
              </span>
            ))}
          </div>
        </div>

        {/* Online cursors display */}
        {otherCursors.size > 0 && (
          <div className="mb-3">
            <label className="text-sm font-medium mb-1 block">Active Cursors ({otherCursors.size}):</label>
            <div className="flex flex-wrap gap-1">
              {Array.from(otherCursors.entries()).map(([user, cursor]) => (
                <span
                  key={user}
                  className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800 flex items-center gap-1"
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: cursor.color }}
                  ></div>
                  {user}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-3">
          <label className="text-sm font-medium">Size:</label>
          <input
            type="range"
            min="1"
            max="20"
            value={strokeSize}
            onChange={(e) => setStrokeSize(+e.target.value)}
            className="flex-1"
            disabled={ownerConflict || isReplaying}
          />
          <span className="text-sm w-8 text-center">{strokeSize}</span>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <label className="text-sm font-medium">Color:</label>
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            className="w-8 h-8 rounded border-2 border-gray-300"
            disabled={ownerConflict || isReplaying}
          />
        </div>

        <div className="flex gap-2 mb-2">
          {isOwner && !ownerConflict && (
            <button
              onClick={clearCanvas}
              disabled={isReplaying}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:bg-gray-400"
            >
              Clear All
            </button>
          )}

          <button
            onClick={replayStrokes}
            disabled={isReplaying || !canvasStateRef.current.strokes.length || ownerConflict}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:bg-gray-400"
          >
            {isReplaying ? "Replaying..." : "Replay"}
          </button>
        </div>
      </div>

      {/* Drawing canvas */}
      <canvas
        ref={canvasRef}
        style={{
          border: "1px solid #ccc",
          cursor: ownerConflict ? "not-allowed" : "crosshair",
          backgroundColor: "#fafafa",
          pointerEvents: ownerConflict ? "none" : "auto"
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
      />

      {/* Other users' cursors */}
      {Array.from(otherCursors.entries()).map(([user, cursor]) => (
        <div
          key={user}
          className="fixed pointer-events-none z-40 transition-all duration-75"
          style={{
            left: cursor.x,
            top: cursor.y,
            transform: 'translate(-2px, -2px)'
          }}
        >
          <div
            className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
            style={{ backgroundColor: cursor.color }}
          />
          <div
            className="absolute top-5 left-0 px-2 py-1 rounded text-xs text-white shadow-lg whitespace-nowrap"
            style={{ backgroundColor: cursor.color }}
          >
            {user}
          </div>
        </div>
      ))}

      {/* Current stroke info */}
      {currentStroke && !ownerConflict && (
        <div className="fixed bottom-4 left-4 bg-black/70 text-white px-3 py-1 rounded text-sm z-20">
          Drawing... {currentStroke.points.length} points
        </div>
      )}
    </div>
  );
}
