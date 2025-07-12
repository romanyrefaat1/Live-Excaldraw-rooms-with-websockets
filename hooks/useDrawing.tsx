import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useDrawing(canvasRef, roomId, userName, ownerConflict, infiniteCanvas) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [strokeSize, setStrokeSize] = useState(3);
  const [strokeColor, setStrokeColor] = useState("#2563eb");
  const [isReplaying, setIsReplaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // New state for drawing tools
  const [drawingTool, setDrawingTool] = useState('freehand'); // 'freehand', 'rectangle', 'circle', 'line'
  const [previewShape, setPreviewShape] = useState(null);
  const [startPoint, setStartPoint] = useState(null);
  
  // Keep track of our own strokes to avoid double-drawing
  const myStrokesRef = useRef(new Set());
  const animationFrameId = useRef(null); // To store requestAnimationFrame ID

  const getDistance = useCallback((p1, p2) => {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }, []);

  const drawStrokeOnCanvas = useCallback((ctx, stroke) => {
    if (!stroke.points || stroke.points.length < 2) return;
    
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    if (stroke.type === 'freehand') {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    } else if (stroke.type === 'rectangle') {
      const start = stroke.points[0];
      const end = stroke.points[1];
      const width = end.x - start.x;
      const height = end.y - start.y;
      
      ctx.beginPath();
      ctx.rect(start.x, start.y, width, height);
      ctx.stroke();
    } else if (stroke.type === 'circle') {
      const start = stroke.points[0];
      const end = stroke.points[1];
      const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
      
      ctx.beginPath();
      ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (stroke.type === 'line') {
      const start = stroke.points[0];
      const end = stroke.points[1];
      
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }, []);

  const drawPreviewShape = useCallback((ctx, shape) => {
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.7; // Make preview semi-transparent
    
    drawStrokeOnCanvas(ctx, shape);
    
    ctx.globalAlpha = 1; // Reset alpha
  }, [drawStrokeOnCanvas]);

  const generateShapePoints = useCallback((tool, startPoint, endPoint) => {
    switch (tool) {
      case 'rectangle':
      case 'circle':
      case 'line':
        return [startPoint, endPoint];
      default:
        return [startPoint, endPoint];
    }
  }, []);

  // The main redraw function, now managed by requestAnimationFrame
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear the entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid background
    infiniteCanvas.drawGrid(ctx);
    
    // Apply camera transform for drawing strokes
    infiniteCanvas.applyTransform(ctx);
    
    // Draw all strokes in world coordinates
    strokes.forEach(stroke => {
      drawStrokeOnCanvas(ctx, stroke);
    });
    
    // Draw current stroke if drawing
    if (currentStroke) {
      drawStrokeOnCanvas(ctx, currentStroke);
    }
    
    // Draw preview shape
    if (previewShape) {
      drawPreviewShape(ctx, previewShape);
    }
    
    // Reset transform
    infiniteCanvas.resetTransform(ctx);
  }, [canvasRef, infiniteCanvas, strokes, currentStroke, previewShape, drawStrokeOnCanvas, drawPreviewShape]);


  // Effect to manage the animation frame loop for drawing
  useEffect(() => {
    const animate = () => {
      redrawCanvas();
      animationFrameId.current = requestAnimationFrame(animate);
    };

    if (!ownerConflict) { // Only animate if no owner conflict
      animationFrameId.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [redrawCanvas, ownerConflict]); // RedrawCanvas is a dependency, it will trigger re-animation if it changes.

  const loadExistingSketches = useCallback(async () => {
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

      setStrokes(sketches || []); // Update strokes, which will trigger redraw via useEffect
      
    } catch (error) {
      console.error("Error loading existing sketches:", error);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  // Initial load of sketches
  useEffect(() => {
    if (roomId && !ownerConflict) {
      loadExistingSketches();
    }
  }, [roomId, ownerConflict, loadExistingSketches]);


  const startDrawing = useCallback((e) => {
    // Check if infinite canvas is handling this event (panning)
    // This check is already done in DrawingCanvas.jsx, no need to repeat here.
    if (isReplaying || isLoading || ownerConflict) return;

    // Get world coordinates instead of screen coordinates
    const worldPos = infiniteCanvas.getWorldMousePos(e);
    const strokeId = crypto.randomUUID();
    
    setIsDrawing(true);
    setStartPoint(worldPos);
    
    if (drawingTool === 'freehand') {
      setCurrentStroke({
        id: strokeId,
        type: 'freehand',
        points: [worldPos],
        size: strokeSize,
        color: strokeColor,
        length: 0,
        room_id: roomId,
      });
    } else {
      // For shapes, we'll create the stroke when mouse is released
      setPreviewShape({
        id: strokeId,
        type: drawingTool,
        points: [worldPos, worldPos],
        size: strokeSize,
        color: strokeColor,
        length: 0,
        room_id: roomId,
      });
    }
    
    myStrokesRef.current.add(strokeId);
  }, [isReplaying, isLoading, ownerConflict, infiniteCanvas, drawingTool, strokeSize, strokeColor, roomId]);

  const handleMouseMove = useCallback((e) => {
    // Check if infinite canvas is handling this event
    // This check is already done in DrawingCanvas.jsx, no need to repeat here.
    if (!isDrawing || isReplaying || isLoading || ownerConflict) return;

    // Get world coordinates
    const worldPos = infiniteCanvas.getWorldMousePos(e);
    
    if (drawingTool === 'freehand') {
      if (!currentStroke) return;
      
      const lastPoint = currentStroke.points.slice(-1)[0];
      const dist = getDistance(lastPoint, worldPos);

      // Update current stroke
      const updatedStroke = {
        ...currentStroke,
        points: [...currentStroke.points, worldPos],
        length: currentStroke.length + dist,
      };
      
      setCurrentStroke(updatedStroke);
    } else {
      // Update preview shape
      if (previewShape && startPoint) {
        const updatedShape = {
          ...previewShape,
          points: generateShapePoints(drawingTool, startPoint, worldPos),
        };
        setPreviewShape(updatedShape);
      }
    }
  }, [isDrawing, isReplaying, isLoading, ownerConflict, infiniteCanvas, drawingTool, currentStroke, previewShape, startPoint, getDistance, generateShapePoints]);

  const stopDrawing = useCallback(async (e) => {
    // Check if infinite canvas is handling this event
    // This check is already done in DrawingCanvas.jsx, no need to repeat here.
    if (!isDrawing || isReplaying || isLoading || ownerConflict) return;

    let finalStroke = null;

    if (drawingTool === 'freehand') {
      finalStroke = currentStroke;
    } else {
      // For shapes, finalize the stroke from the preview
      if (previewShape && startPoint) {
        const worldPos = infiniteCanvas.getWorldMousePos(e);
        finalStroke = {
          ...previewShape,
          points: generateShapePoints(drawingTool, startPoint, worldPos),
        };
      }
    }

    if (finalStroke && finalStroke.points && finalStroke.points.length >= 2) {
      // Add stroke to local state
      setStrokes(prev => [...prev, finalStroke]);

      // Save to Supabase
      try {
        const { error } = await supabase.from("sketches").insert({
          id: finalStroke.id,
          room_id: roomId,
          user_name: userName,
          type: finalStroke.type,
          points: finalStroke.points,
          size: finalStroke.size,
          color: finalStroke.color,
          length: finalStroke.length,
        });

        if (error) {
          console.error("Error saving stroke:", error);
        }
      } catch (error) {
        console.error("Error saving stroke:", error);
      }
    }

    setIsDrawing(false);
    setCurrentStroke(null);
    setPreviewShape(null);
    setStartPoint(null);
    myStrokesRef.current.delete(finalStroke?.id);
  }, [isDrawing, isReplaying, isLoading, ownerConflict, drawingTool, currentStroke, previewShape, startPoint, infiniteCanvas, roomId, userName, generateShapePoints]);

  const handleMouseLeave = useCallback(() => {
    if (isDrawing) {
      // If mouse leaves while drawing, stop the current stroke
      stopDrawing();
    }
  }, [isDrawing, stopDrawing]);

  // Realtime subscription for other users' strokes
  useEffect(() => {
    if (!roomId || !userName || ownerConflict) return;

    const channel = supabase
      .channel("strokes-" + roomId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sketches", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const newStroke = payload.new;
          // Only add if it's not our own stroke
          if (!myStrokesRef.current.has(newStroke.id)) {
            setStrokes(prev => [...prev, newStroke]);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up strokes channel');
      supabase.removeChannel(channel);
    };
  }, [roomId, userName, ownerConflict]);


  // Expose redrawCanvas to DrawingCanvas component for external triggers (like resize)
  const exposedRedrawCanvas = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current); // Cancel current frame
    }
    redrawCanvas(); // Redraw immediately
    // Re-start animation loop only if not in conflict, as the main useEffect handles this
    if (!ownerConflict) {
        animationFrameId.current = requestAnimationFrame(() => {
            const animate = () => {
                redrawCanvas();
                animationFrameId.current = requestAnimationFrame(animate);
            };
            animate();
        });
    }
  }, [redrawCanvas, ownerConflict]);

  return {
    isDrawing,
    strokes,
    currentStroke,
    strokeSize,
    setStrokeSize,
    strokeColor,
    setStrokeColor,
    drawingTool,
    setDrawingTool,
    isReplaying,
    setIsReplaying,
    isLoading,
    startDrawing,
    handleMouseMove,
    stopDrawing,
    handleMouseLeave,
    redrawCanvas: exposedRedrawCanvas, // Expose the redraw function
  };
}