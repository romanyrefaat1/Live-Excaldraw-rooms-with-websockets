"use client";

import { useEffect, useRef, useState } from "react";
import { useInfiniteCanvas } from "@/hooks/useInfiniteCanvas";
import { useDrawing } from "@/hooks/useDrawing";
import { useRoomState } from "@/hooks/useRoomState";
import { useCursors } from "@/hooks/useCursors";
import Cursor from "./Cursor";
import OwnerConflictModal from "./OwnerConflictModal";
import DrawingInfo from "./DrawingInfo";
import Navbar from "./nav/Navbar";

export default function DrawingCanvas({ roomId }) {
  const canvasRef = useRef(null);
  const [userName, setUserName] = useState(null);
  const [canvasStyle, setCanvasStyle] = useState('grid');
  const [gridOpacity, setGridOpacity] = useState(0.3);
  
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

  // Initialize infinite canvas with style parameters
  const infiniteCanvas = useInfiniteCanvas(canvasRef, canvasStyle, gridOpacity);
  
  // Custom hooks for different concerns
  const roomState = useRoomState(roomId, userName);
  const cursors = useCursors(roomId, userName, roomState.ownerConflict, infiniteCanvas);
  const drawing = useDrawing(canvasRef, roomId, userName, roomState.ownerConflict, infiniteCanvas);

  // Canvas setup
  useEffect(() => {
    if (!roomId || !userName || roomState.ownerConflict) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size to full window
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      
      // Redraw after resize
      setTimeout(() => {
        drawing.redrawCanvas();
      }, 0);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.imageSmoothingEnabled = true;

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [roomId, userName, roomState.ownerConflict, drawing.redrawCanvas]);

  // Apply canvas style changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    switch (canvasStyle) {
      case 'white':
        canvas.style.backgroundColor = '#ffffff';
        break;
      case 'empty':
        canvas.style.backgroundColor = 'transparent';
        break;
      case 'grid':
      default:
        canvas.style.backgroundColor = '#fafafa';
        break;
    }

    // Trigger redraw to update grid
    setTimeout(() => {
      drawing.redrawCanvas();
    }, 0);
  }, [canvasStyle, gridOpacity, drawing.redrawCanvas]);

  // Handle mouse events with proper coordination between infinite canvas and drawing
  const handleMouseDown = (e) => {
    // Let infinite canvas handle first (for panning)
    if (!infiniteCanvas.handleMouseDown(e)) {
      // If infinite canvas doesn't handle it, let drawing handle it
      drawing.startDrawing(e);
    }
  };

  const handleMouseMove = (e) => {
    // Handle cursor tracking
    cursors.handleMouseMove(e);
    
    // Handle infinite canvas mouse move first
    if (!infiniteCanvas.handleMouseMove(e)) {
      // If infinite canvas doesn't handle it, let drawing handle it
      drawing.handleMouseMove(e);
    }
  };

  const handleMouseUp = (e) => {
    // Let infinite canvas handle first
    if (!infiniteCanvas.handleMouseUp(e)) {
      // If infinite canvas doesn't handle it, let drawing handle it
      drawing.stopDrawing(e);
    }
  };

  const handleMouseLeave = () => {
    cursors.handleMouseLeave();
    drawing.handleMouseLeave();
  };

  // Update cursor style based on mode and drawing tool
  const getCursorStyle = () => {
    if (drawing.isLoading || roomState.ownerConflict) return "not-allowed";
    if (infiniteCanvas.isPanning) return "grabbing";
    if (infiniteCanvas.isSpacePressed) return "grab";
    
    // Different cursors for different drawing tools
    switch (drawing.drawingTool) {
      case 'freehand':
        return "crosshair";
      case 'line':
        return "crosshair";
      case 'rectangle':
        return "crosshair";
      case 'circle':
        return "crosshair";
      default:
        return "crosshair";
    }
  };

  // Handle camera changes and notify cursors
  useEffect(() => {
    if (cursors.handleCameraChange) {
      cursors.handleCameraChange();
    }
  }, [infiniteCanvas.camera, cursors.handleCameraChange]);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <OwnerConflictModal 
        isVisible={roomState.ownerConflict}
        roomOwner={roomState.roomOwner}
      />

      <div className="fixed top-4 left-4 z-10">
        <Navbar 
          drawing={drawing}
          roomState={roomState}
          userName={userName}
          cursors={cursors}
          infiniteCanvas={infiniteCanvas}
          canvasStyle={canvasStyle}
          setCanvasStyle={setCanvasStyle}
          gridOpacity={gridOpacity}
          setGridOpacity={setGridOpacity}
        />
      </div>

      <canvas
        ref={canvasRef}
        style={{
          border: "1px solid #ccc",
          cursor: getCursorStyle(),
          backgroundColor: canvasStyle === 'white' ? '#ffffff' : canvasStyle === 'empty' ? 'transparent' : '#fafafa',
          pointerEvents: roomState.ownerConflict ? "none" : "auto",
          display: "block"
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={cursors.handleMouseEnter}
        onContextMenu={(e) => e.preventDefault()} // Prevent right-click menu
      />
      
      {/* Other users' cursors */}
      {cursors.otherCursors && Array.from(cursors.otherCursors.entries()).map(([user, cursor]) => (
        <Cursor
          key={user}
          user={user}
          cursor={cursor}
          infiniteCanvas={infiniteCanvas}
        />
      ))}
      
      <DrawingInfo
        currentStroke={drawing.currentStroke}
        ownerConflict={roomState.ownerConflict}
      />

      {/* Instructions overlay */}
      {!roomState.ownerConflict && (
        <div className="fixed bottom-4 right-4 bg-black/70 text-white px-3 py-2 rounded-lg text-sm">
          <div className="flex flex-col gap-1">
            <div>🖱️ Click and drag to draw</div>
            <div>⌨️ Hold Space + drag to pan</div>
            <div>🖱️ Scroll to zoom</div>
            <div>👁️ Follow other users' cursors</div>
          </div>
        </div>
      )}
    </div>
  );
}