import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

export function useDrawing(canvasRef, roomId, userName, ownerConflict) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [strokeSize, setStrokeSize] = useState(3);
  const [strokeColor, setStrokeColor] = useState("#2563eb");
  const [isReplaying, setIsReplaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Keep track of our own strokes to avoid double-drawing
  const myStrokesRef = useRef(new Set());

  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

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

  const handleMouseMove = (e) => {
    if (isDrawing) {
      draw(e);
    }
  };

  const handleMouseLeave = () => {
    if (isDrawing) {
      stopDrawing();
    }
  };

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
    startDrawing,
    handleMouseMove,
    handleMouseLeave,
    stopDrawing,
    clearCanvas,
    replayStrokes
  };
}