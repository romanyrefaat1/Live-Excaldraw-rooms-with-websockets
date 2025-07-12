"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import Cursor from "./Cursor";
import OwnerConflictModal from "./OwnerConflictModal";
import DrawingInfo from "./DrawingInfo";
import { useDrawing } from "@/hooks/useDrawing";
import { useRoomState } from "@/hooks/useRoomState";
import { useCursors } from "@/hooks/useCursors";
import ControlPanel from "./ControlPanel";

export default function DrawingCanvas({ roomId }: { roomId: string }) {
  const canvasRef = useRef(null);
  const [userName, setUserName] = useState(null);
  
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

  // Custom hooks for different concerns
  const roomState = useRoomState(roomId, userName);
  const cursors = useCursors(roomId, userName, roomState.ownerConflict);
  const drawing = useDrawing(canvasRef, roomId, userName, roomState.ownerConflict);

  // Canvas setup
  useEffect(() => {
    if (!roomId || !userName || roomState.ownerConflict) return;
    
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
  }, [roomId, userName, roomState.ownerConflict]);

  return (
    <div className="relative">
      <OwnerConflictModal 
        isVisible={roomState.ownerConflict}
        roomOwner={roomState.roomOwner}
      />

      <ControlPanel
        connectedUsers={roomState.connectedUsers}
        isLoading={drawing.isLoading}
        userName={userName}
        isOwner={roomState.isOwner}
        roomOwner={roomState.roomOwner}
        activeUsers={roomState.activeUsers}
        otherCursors={cursors.otherCursors}
        strokeSize={drawing.strokeSize}
        setStrokeSize={drawing.setStrokeSize}
        strokeColor={drawing.strokeColor}
        setStrokeColor={drawing.setStrokeColor}
        isReplaying={drawing.isReplaying}
        strokes={drawing.strokes}
        onClearCanvas={drawing.clearCanvas}
        onReplayStrokes={drawing.replayStrokes}
        ownerConflict={roomState.ownerConflict}
      />

      <canvas
        ref={canvasRef}
        style={{ 
          border: "1px solid #ccc", 
          cursor: drawing.isLoading || roomState.ownerConflict ? "not-allowed" : "crosshair",
          backgroundColor: "#fafafa",
          pointerEvents: roomState.ownerConflict ? "none" : "auto"
        }}
        onMouseDown={drawing.startDrawing}
        onMouseMove={(e) => {
          cursors.handleMouseMove(e);
          drawing.handleMouseMove(e);
        }}
        onMouseUp={drawing.stopDrawing}
        onMouseLeave={() => {
          cursors.handleMouseLeave();
          drawing.handleMouseLeave();
        }}
        onMouseEnter={cursors.handleMouseEnter}
      />
      
      {/* Other users' cursors */}
      {Array.from(cursors.otherCursors.entries()).map(([user, cursor]) => (
        <Cursor
          key={user}
          user={user}
          cursor={cursor}
        />
      ))}
      
      <DrawingInfo
        currentStroke={drawing.currentStroke}
        ownerConflict={roomState.ownerConflict}
      />
    </div>
  );
}