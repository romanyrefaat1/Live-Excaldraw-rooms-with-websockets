import { useEffect, useState, useRef } from "react";
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

  const getDistance = (p1, p2) => {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  };

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
        // Clear and redraw with infinite canvas
        redrawCanvas();
        setStrokes(sketches || []);
      }
      
    } catch (error) {
      console.error("Error loading existing sketches:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const redrawCanvas = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    // Clear the entire canvas
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
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
  };

  const drawStrokeOnCanvas = (ctx, stroke) => {
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
  };

  const drawPreviewShape = (ctx, shape) => {
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.7; // Make preview semi-transparent
    
    drawStrokeOnCanvas(ctx, shape);
    
    ctx.globalAlpha = 1; // Reset alpha
  };

  const generateShapePoints = (tool, startPoint, endPoint) => {
    switch (tool) {
      case 'rectangle':
      case 'circle':
      case 'line':
        return [startPoint, endPoint];
      default:
        return [startPoint, endPoint];
    }
  };

  const startDrawing = (e) => {
    // Check if infinite canvas is handling this event (panning)
    if (infiniteCanvas.handleMouseDown(e)) {
      return; // Infinite canvas is handling the event
    }
    
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
  };

  const draw = (e) => {
    // Check if infinite canvas is handling this event
    if (infiniteCanvas.handleMouseMove(e)) {
      redrawCanvas(); // Redraw during panning
      return;
    }
    
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
          length: getDistance(startPoint, worldPos),
        };
        setPreviewShape(updatedShape);
      }
    }
    
    // Redraw canvas to show the current stroke or preview
    redrawCanvas();
  };

  const stopDrawing = async () => {
    // Check if infinite canvas is handling this event
    if (infiniteCanvas.handleMouseUp()) {
      redrawCanvas(); // Redraw after panning ends
      return;
    }
    
    if (!isDrawing) return;
    setIsDrawing(false);

    try {
      let strokeToSave = null;
      
      if (drawingTool === 'freehand' && currentStroke) {
        strokeToSave = currentStroke;
      } else if (previewShape) {
        strokeToSave = previewShape;
      }
      
      if (strokeToSave) {
        console.log('Saving stroke:', strokeToSave);
        
        const { data, error } = await supabase.from("sketches").insert([
          {
            room_id: roomId,
            type: strokeToSave.type,
            points: strokeToSave.points,
            color: strokeToSave.color,
            size: strokeToSave.size,
            length: strokeToSave.length,
          },
        ]).select();

        if (error) {
          console.error('Error saving stroke:', error);
          throw error;
        }
        
        console.log('Stroke saved successfully:', data);
        setStrokes(prev => [...prev, strokeToSave]);
      }
      
    } catch (error) {
      console.error("Error saving stroke:", error);
      alert('Failed to save drawing. Please check your connection.');
    }

    // Reset drawing state
    setCurrentStroke(null);
    setPreviewShape(null);
    setStartPoint(null);
  };

  const clearCanvas = async () => {
    if (isLoading || ownerConflict) return;
    
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

      // Clear local state and redraw
      setStrokes([]);
      setCurrentStroke(null);
      setPreviewShape(null);
      setStartPoint(null);
      myStrokesRef.current.clear();
      redrawCanvas();
      
    } catch (error) {
      console.error("Error clearing canvas:", error);
      alert('Failed to clear canvas. Please try again.');
    }
  };

  const replayStrokes = async () => {
    if (!strokes.length || isLoading || ownerConflict) return;
    setIsReplaying(true);
    
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    // Clear canvas and draw grid
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    infiniteCanvas.drawGrid(ctx);
    
    // Apply transform for replay
    infiniteCanvas.applyTransform(ctx);

    for (const stroke of strokes) {
      if (!stroke.points || stroke.points.length < 2) continue;
      
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      
      if (stroke.type === 'freehand') {
        // Draw freehand stroke progressively
        for (let i = 1; i < stroke.points.length; i++) {
          const p0 = stroke.points[i - 1];
          const p1 = stroke.points[i];
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
          
          await new Promise((res) => setTimeout(res, 3));
        }
      } else {
        // Draw shapes instantly
        drawStrokeOnCanvas(ctx, stroke);
        await new Promise((res) => setTimeout(res, 100));
      }
    }
    
    infiniteCanvas.resetTransform(ctx);
    setIsReplaying(false);
  };

  const handleMouseMove = (e) => {
    draw(e);
  };

  const handleMouseLeave = () => {
    if (isDrawing) {
      stopDrawing();
    }
  };

  // Zoom to fit all content
  const zoomToFitContent = () => {
    if (!strokes.length) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    strokes.forEach(stroke => {
      stroke.points.forEach(point => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    });
    
    if (minX !== Infinity) {
      infiniteCanvas.zoomToFit({ minX, minY, maxX, maxY });
    }
  };

  // Redraw when camera changes
  useEffect(() => {
    if (!isLoading && !ownerConflict) {
      redrawCanvas();
    }
  }, [infiniteCanvas.camera, strokes, currentStroke, previewShape, isLoading, ownerConflict]);

  // Load existing sketches when component mounts
  useEffect(() => {
    if (!roomId || !userName || ownerConflict) return;
    loadExistingSketches();
  }, [roomId, userName, ownerConflict]);

  // Set up realtime subscription for drawing updates
  useEffect(() => {
    if (!roomId || !userName || ownerConflict) return;

    const channel = supabase
      .channel("drawing-" + roomId)
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
          
          // Only add strokes from other users
          if (!myStrokesRef.current.has(stroke.id)) {
            setStrokes((prev) => [...prev, stroke]);
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
          setStrokes([]);
          myStrokesRef.current.clear();
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      console.log('Cleaning up drawing channel');
      supabase.removeChannel(channel);
    };
  }, [roomId, userName, ownerConflict]);

  return {
    isDrawing,
    strokes,
    currentStroke,
    strokeSize,
    setStrokeSize,
    strokeColor,
    setStrokeColor,
    isReplaying,
    isLoading,
    drawingTool,
    setDrawingTool,
    startDrawing,
    handleMouseMove,
    handleMouseLeave,
    stopDrawing,
    clearCanvas,
    replayStrokes,
    zoomToFitContent,
    redrawCanvas
  };
}