import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

export function useCursors(roomId, userName, ownerConflict) {
  const [otherCursors, setOtherCursors] = useState(new Map());
  const [isMouseOnCanvas, setIsMouseOnCanvas] = useState(false);
  const cursorThrottleRef = useRef(null);
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

  const getMousePos = (e) => {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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

  // Realtime subscription for cursor updates
  useEffect(() => {
    if (!roomId || !userName || ownerConflict) return;

    const channel = supabase
      .channel("cursors-" + roomId)
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
    handleMouseLeave
  };
}