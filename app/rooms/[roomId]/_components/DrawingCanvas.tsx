"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DrawingCanvas({ roomId }: { roomId: string }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [strokeSize, setStrokeSize] = useState(3);
  const [strokeColor, setStrokeColor] = useState("#2563eb");
  const [isReplaying, setIsReplaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [activeUsers, setActiveUsers] = useState([]);
  const [roomOwner, setRoomOwner] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [userName, setUserName] = useState(null);
  const [ownerConflict, setOwnerConflict] = useState(false);
  
  // Cursor tracking state
  const [otherCursors, setOtherCursors] = useState(new Map());
  const [isMouseOnCanvas, setIsMouseOnCanvas] = useState(false);
  const cursorThrottleRef = useRef(null);
  const channelRef = useRef(null);
  
  // Keep track of our own strokes to avoid double-drawing
  const myStrokesRef = useRef(new Set());

  // Generate a random color for each user's cursor
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

  // Initialize userName first
  useEffect(() => {
    if (!roomId) return;
    
    const storedUserName = sessionStorage.getItem(`room_${roomId}_userName`);
    if (!storedUserName) {
      window.location.href = '/';
      return;
    }
    
    setUserName(storedUserName);
  }, [roomId]);

  // Main room setup - only runs when we have both roomId and userName
  useEffect(() => {
    if (!roomId || !userName) return;
    
    console.log('Setting up room for user:', userName);
    
    const setupRoom = async () => {
      try {
        const { data: room, error } = await supabase
          .from('rooms')
          .select('owner_name, active_users')
          .eq('id', roomId)
          .single();
        
        if (error) {
          console.error('Error fetching room info:', error);
          return;
        }
        
        if (!room) {
          console.error('Room not found');
          return;
        }
        
        setRoomOwner(room.owner_name);
        const currentActiveUsers = room.active_users || [];
        setActiveUsers(currentActiveUsers);
        
        // Check ownership and conflicts
        const isRoomOwner = userName === room.owner_name;
        setIsOwner(isRoomOwner);
        
        if (isRoomOwner && currentActiveUsers.includes(userName)) {
          // Owner is already active - show conflict
          setOwnerConflict(true);
          return;
        } else {
          setOwnerConflict(false);
        }
        
        // Add user to active_users if not already there
        if (!currentActiveUsers.includes(userName)) {
          const updatedUsers = [...currentActiveUsers, userName];
          setActiveUsers(updatedUsers);
          
          await supabase
            .from('rooms')
            .update({ active_users: updatedUsers })
            .eq('id', roomId);
        }
        
      } catch (error) {
        console.error('Error in setupRoom:', error);
      }
    };
    
    setupRoom();
  }, [roomId, userName]);

  // Canvas and realtime setup
  useEffect(() => {
    if (!roomId || !userName || ownerConflict) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';

    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.imageSmoothingEnabled = true;

    console.log('Setting up canvas for room:', roomId);

    // Load existing sketches first
    loadExistingSketches();

    // Set up realtime subscription
    const channel = supabase
      .channel("room-" + roomId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sketches",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          console.log('Received new stroke:', payload.new);
          const stroke = payload.new;
          
          // Only draw strokes from other users
          if (!myStrokesRef.current.has(stroke.id)) {
            drawStroke(stroke);
            setStrokes((prev) => [...prev, stroke]);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          console.log('Room updated:', payload.new);
          if (payload.new.active_users) {
            setActiveUsers(payload.new.active_users);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "sketches",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          console.log('Sketches cleared');
          // Clear canvas when sketches are deleted
          const ctx = canvasRef.current?.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
          setStrokes([]);
          myStrokesRef.current.clear();
        }
      )
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        setConnectedUsers(Object.keys(presenceState).length);
      })
      // Listen for cursor broadcasts
      .on("broadcast", { event: "cursor-move" }, (payload) => {
        const { user, x, y, color } = payload.payload;
        
        // Don't show our own cursor
        if (user !== userName) {
          setOtherCursors(prev => {
            const newCursors = new Map(prev);
            newCursors.set(user, { x, y, color, lastSeen: Date.now() });
            return newCursors;
          });
        }
      })
      .on("broadcast", { event: "cursor-leave" }, (payload) => {
        const { user } = payload.payload;
        setOtherCursors(prev => {
          const newCursors = new Map(prev);
          newCursors.delete(user);
          return newCursors;
        });
      })
      .subscribe(async (status) => {
        console.log('Channel status:', status);
        if (status === "SUBSCRIBED") {
          await channel.track({ user: userName, timestamp: Date.now() });
        }
      });

    // Store channel reference for cursor broadcasting
    channelRef.current = channel;

    // Clean up stale cursors every 5 seconds
    const cursorCleanupInterval = setInterval(() => {
      const now = Date.now();
      setOtherCursors(prev => {
        const newCursors = new Map();
        for (const [user, cursor] of prev) {
          // Keep cursors that were seen in the last 10 seconds
          if (now - cursor.lastSeen < 10000) {
            newCursors.set(user, cursor);
          }
        }
        return newCursors;
      });
    }, 5000);

    // Cleanup function
    return () => {
      console.log('Cleaning up channel');
      
      // Broadcast cursor leave
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "cursor-leave",
          payload: { user: userName }
        });
      }
      
      clearInterval(cursorCleanupInterval);
      
      const removeUserFromRoom = async () => {
        try {
          const { data: room } = await supabase
            .from('rooms')
            .select('active_users')
            .eq('id', roomId)
            .single();
          
          if (room && room.active_users) {
            const updatedUsers = room.active_users.filter(user => user !== userName);
            await supabase
              .from('rooms')
              .update({ active_users: updatedUsers })
              .eq('id', roomId);
          }
        } catch (error) {
          console.error('Error removing user from room:', error);
        }
      };
      
      removeUserFromRoom();
      supabase.removeChannel(channel);
    };
  }, [roomId, userName, ownerConflict]);

  const loadExistingSketches = async () => {
    if (!roomId) return;
    
    try {
      console.log('Loading existing sketches for room:', roomId);
      setIsLoading(true);
      
      const { data: sketches, error } = await supabase
        .from("sketches")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error('Error loading sketches:', error);
        throw error;
      }

      console.log('Loaded sketches:', sketches?.length || 0);

      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        
        setStrokes(sketches || []);
        
        (sketches || []).forEach(stroke => {
          drawStroke(stroke);
        });
      }
      
    } catch (error) {
      console.error("Error loading existing sketches:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const getDistance = (p1, p2) => {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  };

  // Throttled cursor broadcasting
  const broadcastCursor = (x, y) => {
    if (cursorThrottleRef.current) {
      clearTimeout(cursorThrottleRef.current);
    }
    
    cursorThrottleRef.current = setTimeout(() => {
      if (channelRef.current && isMouseOnCanvas) {
        channelRef.current.send({
          type: "broadcast",
          event: "cursor-move",
          payload: { 
            user: userName, 
            x, 
            y, 
            color: generateUserColor(userName) 
          }
        });
      }
    }, 16); // ~60fps
  };

  // Mouse event handlers
  const handleMouseMove = (e) => {
    const pos = getMousePos(e);
    broadcastCursor(pos.x, pos.y);
    
    if (isDrawing) {
      draw(e);
    }
  };

  const handleMouseEnter = () => {
    setIsMouseOnCanvas(true);
  };

  const handleMouseLeave = () => {
    setIsMouseOnCanvas(false);
    
    // Broadcast cursor leave
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "cursor-leave",
        payload: { user: userName }
      });
    }
    
    if (isDrawing) {
      stopDrawing();
    }
  };

  const startDrawing = (e) => {
    if (isReplaying || isLoading || ownerConflict) return;
    const pos = getMousePos(e);

    const strokeId = crypto.randomUUID();
    setIsDrawing(true);
    setCurrentStroke({
      id: strokeId,
      points: [pos],
      size: strokeSize,
      color: strokeColor,
      length: 0,
      room_id: roomId,
    });
    
    myStrokesRef.current.add(strokeId);
  };

  const draw = (e) => {
    if (!isDrawing || !currentStroke || isReplaying || isLoading || ownerConflict) return;
    const pos = getMousePos(e);
    const ctx = canvasRef.current.getContext("2d");

    ctx.strokeStyle = currentStroke.color;
    ctx.lineWidth = currentStroke.size;

    const lastPoint = currentStroke.points.slice(-1)[0];
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    const dist = getDistance(lastPoint, pos);
    setCurrentStroke({
      ...currentStroke,
      points: [...currentStroke.points, pos],
      length: currentStroke.length + dist,
    });
  };

  const stopDrawing = async () => {
    if (!isDrawing || !currentStroke) return;
    setIsDrawing(false);

    try {
      console.log('Saving stroke:', currentStroke);
      
      const { data, error } = await supabase.from("sketches").insert([
        {
          room_id: roomId,
          points: currentStroke.points,
          color: currentStroke.color,
          size: currentStroke.size,
          length: currentStroke.length,
        },
      ]).select();

      if (error) {
        console.error('Error saving stroke:', error);
        throw error;
      }
      
      console.log('Stroke saved successfully:', data);
      setStrokes(prev => [...prev, currentStroke]);
      
    } catch (error) {
      console.error("Error saving stroke:", error);
      alert('Failed to save drawing. Please check your connection.');
    }

    setCurrentStroke(null);
  };

  const drawStroke = (stroke) => {
    if (!stroke.points || stroke.points.length < 2) return;
    
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  };

  const clearCanvas = async () => {
    if (isLoading || !isOwner || ownerConflict) return;
    
    try {
      console.log('Clearing canvas as owner:', userName);
      
      const { error } = await supabase
        .from("sketches")
        .delete()
        .eq("room_id", roomId);

      if (error) {
        console.error('Error clearing canvas:', error);
        throw error;
      }

      // Clear local state immediately
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      setStrokes([]);
      setCurrentStroke(null);
      myStrokesRef.current.clear();
      
    } catch (error) {
      console.error("Error clearing canvas:", error);
      alert('Failed to clear canvas. Please try again.');
    }
  };

  const replayStrokes = async () => {
    if (!strokes.length || isLoading || ownerConflict) return;
    setIsReplaying(true);
    
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    for (const stroke of strokes) {
      if (!stroke.points || stroke.points.length < 2) continue;
      
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      
      for (let i = 1; i < stroke.points.length; i++) {
        const p0 = stroke.points[i - 1];
        const p1 = stroke.points[i];
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        
        await new Promise((res) => setTimeout(res, 3));
      }
    }
    setIsReplaying(false);
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
      <div className="fixed top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 shadow-lg border">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600">
              {connectedUsers} user{connectedUsers !== 1 ? 's' : ''} connected
            </span>
          </div>
          {isLoading && (
            <span className="text-sm text-blue-600">Loading...</span>
          )}
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
            disabled={ownerConflict}
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
            disabled={ownerConflict}
          />
        </div>
        
        <div className="flex gap-2">
          {isOwner && !ownerConflict && (
            <button 
              onClick={clearCanvas} 
              disabled={isReplaying || isLoading}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:bg-gray-400"
            >
              Clear All
            </button>
          )}
          <button 
            onClick={replayStrokes} 
            disabled={isReplaying || !strokes.length || isLoading || ownerConflict}
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
          cursor: isLoading || ownerConflict ? "not-allowed" : "crosshair",
          backgroundColor: "#fafafa",
          pointerEvents: ownerConflict ? "none" : "auto"
        }}
        onMouseDown={startDrawing}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrawing}
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
          {/* Cursor dot */}
          <div
            className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
            style={{ backgroundColor: cursor.color }}
          />
          {/* User name label */}
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
        <div className="fixed bottom-4 left-4 bg-black/70 text-white px-3 py-1 rounded text-sm">
          Drawing... {currentStroke.points.length} points
        </div>
      )}
    </div>
  );
}