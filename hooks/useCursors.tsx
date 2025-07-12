import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

export function useCursors(roomId, userName, ownerConflict, infiniteCanvas) {
  const [otherCursors, setOtherCursors] = useState(new Map());
  const [isMouseOnCanvas, setIsMouseOnCanvas] = useState(false);
  const cursorThrottleRef = useRef(null);
  const cameraThrottleRef = useRef(null);
  const channelRef = useRef(null);

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

  // Throttled cursor broadcasting with world coordinates
  const broadcastCursor = (screenX, screenY) => {
    if (cursorThrottleRef.current) {
      clearTimeout(cursorThrottleRef.current);
    }
    
    cursorThrottleRef.current = setTimeout(() => {
      if (channelRef.current && isMouseOnCanvas && infiniteCanvas) {
        // Convert screen coordinates to world coordinates
        const worldPos = infiniteCanvas.screenToWorld(screenX, screenY);
        
        channelRef.current.send({
          type: "broadcast",
          event: "cursor-move",
          payload: { 
            user: userName, 
            x: worldPos.x, 
            y: worldPos.y, 
            color: generateUserColor(userName),
            // Include camera state for followers
            camera: {
              x: infiniteCanvas.camera.x,
              y: infiniteCanvas.camera.y,
              zoom: infiniteCanvas.camera.zoom
            }
          }
        });
      }
    }, 16); // ~60fps
  };

  // Throttled camera broadcasting (separate from cursor for better performance)
  const broadcastCamera = () => {
    if (cameraThrottleRef.current) {
      clearTimeout(cameraThrottleRef.current);
    }
    
    cameraThrottleRef.current = setTimeout(() => {
      if (channelRef.current && infiniteCanvas) {
        channelRef.current.send({
          type: "broadcast",
          event: "camera-update",
          payload: { 
            user: userName,
            camera: {
              x: infiniteCanvas.camera.x,
              y: infiniteCanvas.camera.y,
              zoom: infiniteCanvas.camera.zoom
            }
          }
        });
      }
    }, 100); // Less frequent than cursor updates
  };

  // Mouse event handlers
  const handleMouseMove = (e) => {
    if (!infiniteCanvas) return;
    
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    broadcastCursor(screenX, screenY);
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
  };

  // Expose camera broadcasting function for when camera changes
  const handleCameraChange = () => {
    broadcastCamera();
  };

  // Realtime subscription for cursor updates
  useEffect(() => {
    if (!roomId || !userName || ownerConflict) return;

    const channel = supabase
      .channel("cursors-" + roomId)
      .on("broadcast", { event: "cursor-move" }, (payload) => {
        const { user, x, y, color, camera } = payload.payload;
        
        // Don't show our own cursor
        if (user !== userName) {
          setOtherCursors(prev => {
            const newCursors = new Map(prev);
            // Store world coordinates and camera state
            newCursors.set(user, { 
              x, 
              y, 
              color, 
              camera: camera || null,
              lastSeen: Date.now() 
            });
            return newCursors;
          });
        }
      })
      .on("broadcast", { event: "camera-update" }, (payload) => {
        const { user, camera } = payload.payload;
        
        // Don't process our own camera updates
        if (user !== userName) {
          setOtherCursors(prev => {
            const newCursors = new Map(prev);
            const existingCursor = newCursors.get(user);
            if (existingCursor) {
              // Update camera info for existing cursor
              newCursors.set(user, {
                ...existingCursor,
                camera: camera,
                lastSeen: Date.now()
              });
            }
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
      .subscribe();

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
      console.log('Cleaning up cursor channel');
      
      // Broadcast cursor leave
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "cursor-leave",
          payload: { user: userName }
        });
      }
      
      clearInterval(cursorCleanupInterval);
      supabase.removeChannel(channel);
    };
  }, [roomId, userName, ownerConflict]);

  return {
    otherCursors,
    handleMouseMove,
    handleMouseEnter,
    handleMouseLeave,
    handleCameraChange
  };
}