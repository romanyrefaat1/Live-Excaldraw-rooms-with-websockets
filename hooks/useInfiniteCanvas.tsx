import { useState, useRef, useCallback, useEffect } from 'react';

export function useInfiniteCanvas(canvasRef, canvasStyle = 'grid', gridOpacity = 0.3) {
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  const [isTouchPanning, setIsTouchPanning] = useState(false);
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const panStartRef = useRef({ x: 0, y: 0 });
  const lastPanPosRef = useRef({ x: 0, y: 0 });

  const worldToScreen = useCallback((worldX, worldY) => {
    return {
      x: (worldX - camera.x) * camera.zoom,
      y: (worldY - camera.y) * camera.zoom
    };
  }, [camera]);

  const screenToWorld = useCallback((screenX, screenY) => {
    return {
      x: screenX / camera.zoom + camera.x,
      y: screenY / camera.zoom + camera.y
    };
  }, [camera]);

  const getCanvasMousePos = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, [canvasRef]);

  const getWorldMousePos = useCallback((e) => {
    const screenPos = getCanvasMousePos(e);
    return screenToWorld(screenPos.x, screenPos.y);
  }, [getCanvasMousePos, screenToWorld]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    
    // Check if shift is held for horizontal/vertical panning
    if (e.shiftKey) {
      const panSpeed = 50; // Adjust this value to control pan sensitivity
      // Pure horizontal panning - only use deltaY for left/right movement
      const deltaX = e.deltaY > 0 ? panSpeed : -panSpeed;
      
      setCamera(prev => ({
        ...prev,
        x: prev.x + deltaX / prev.zoom,
        y: prev.y // Keep Y unchanged for pure horizontal movement
      }));
      return;
    }
    
    // Normal zoom behavior when shift is not held
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldPos = screenToWorld(mouseX, mouseY);

    const zoomFactor = 1.1;
    const deltaZoom = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
    const newZoom = Math.max(0.1, Math.min(5, camera.zoom * deltaZoom));

    const newCameraX = worldPos.x - mouseX / newZoom;
    const newCameraY = worldPos.y - mouseY / newZoom;

    setCamera({ x: newCameraX, y: newCameraY, zoom: newZoom });
  }, [camera, screenToWorld, canvasRef]);

  const handleMouseDown = useCallback((e) => {
    if (isModifierPressed || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      const pos = getCanvasMousePos(e);
      panStartRef.current = pos;
      lastPanPosRef.current = pos;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      return true;
    }
    return false;
  }, [isModifierPressed, getCanvasMousePos, canvasRef]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      const pos = getCanvasMousePos(e);
      const deltaX = pos.x - lastPanPosRef.current.x;
      const deltaY = pos.y - lastPanPosRef.current.y;

      setCamera(prev => ({ ...prev, x: prev.x - deltaX / prev.zoom, y: prev.y - deltaY / prev.zoom }));

      lastPanPosRef.current = pos;
      return true;
    }
    return false;
  }, [isPanning, getCanvasMousePos]);

  const getTouchPos = useCallback((touch) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  }, [canvasRef]);

  const getTouchDistance = useCallback((touch1, touch2) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const getTouchCenter = useCallback((touch1, touch2) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (touch1.clientX + touch2.clientX) / 2 - rect.left,
      y: (touch1.clientY + touch2.clientY) / 2 - rect.top
    };
  }, [canvasRef]);

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      // Single touch - start panning
      const touch = e.touches[0];
      const pos = getTouchPos(touch);
      setIsTouchPanning(true);
      panStartRef.current = pos;
      lastPanPosRef.current = pos;
      return true;
    } else if (e.touches.length === 2) {
      // Two touches - prepare for zoom
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      setLastTouchDistance(distance);
      setIsTouchPanning(false);
      return true;
    }
    return false;
  }, [getTouchPos, getTouchDistance]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    
    if (e.touches.length === 1 && isTouchPanning) {
      // Single touch - pan
      const touch = e.touches[0];
      const pos = getTouchPos(touch);
      const deltaX = pos.x - lastPanPosRef.current.x;
      const deltaY = pos.y - lastPanPosRef.current.y;

      setCamera(prev => ({ 
        ...prev, 
        x: prev.x - deltaX / prev.zoom, 
        y: prev.y - deltaY / prev.zoom 
      }));

      lastPanPosRef.current = pos;
      return true;
    } else if (e.touches.length === 2) {
      // Two touches - zoom
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      const center = getTouchCenter(e.touches[0], e.touches[1]);
      const worldCenter = screenToWorld(center.x, center.y);
      
      if (lastTouchDistance > 0) {
        const scale = distance / lastTouchDistance;
        const newZoom = Math.max(0.1, Math.min(5, camera.zoom * scale));
        
        const newCameraX = worldCenter.x - center.x / newZoom;
        const newCameraY = worldCenter.y - center.y / newZoom;
        
        setCamera({ x: newCameraX, y: newCameraY, zoom: newZoom });
      }
      
      setLastTouchDistance(distance);
      return true;
    }
    return false;
  }, [isTouchPanning, getTouchPos, getTouchDistance, getTouchCenter, screenToWorld, camera, lastTouchDistance]);

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      if (canvasRef.current) canvasRef.current.style.cursor = isModifierPressed ? 'grab' : 'crosshair';
      return true;
    }
    return false;
  }, [isPanning, isModifierPressed, canvasRef]);

  const handleTouchEnd = useCallback((e) => {
    if (e.touches.length === 0) {
      setIsTouchPanning(false);
      setLastTouchDistance(0);
      return true;
    } else if (e.touches.length === 1) {
      // Switched from two touches to one - restart panning
      const touch = e.touches[0];
      const pos = getTouchPos(touch);
      setIsTouchPanning(true);
      lastPanPosRef.current = pos;
      setLastTouchDistance(0);
      return true;
    }
    return false;
  }, [getTouchPos]);

  const handleKeyDown = useCallback((e) => {
    if ((e.code === 'Space' || e.ctrlKey) && !isModifierPressed) {
      e.preventDefault();
      setIsModifierPressed(true);
      if (canvasRef.current && !isPanning) canvasRef.current.style.cursor = 'grab';
    }
  }, [isModifierPressed, isPanning, canvasRef]);

  const handleKeyUp = useCallback((e) => {
    if ((e.code === 'Space' || e.code === 'ControlLeft' || e.code === 'ControlRight') && isModifierPressed) {
      e.preventDefault();
      setIsModifierPressed(false);
      if (canvasRef.current && !isPanning) canvasRef.current.style.cursor = 'crosshair';
    }
  }, [isModifierPressed, isPanning, canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mouse and keyboard events
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    // Touch events
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleWheel, handleKeyDown, handleKeyUp, handleTouchStart, handleTouchMove, handleTouchEnd, canvasRef]);

  const drawGrid = useCallback((ctx) => {
    if (!ctx || !canvasRef.current || canvasStyle !== 'grid') return;
    
    const canvas = canvasRef.current;
    const gridSize = 50;
    const baseGridColor = '#e0e0e0';
    const baseMajorGridColor = '#d0d0d0';
    
    // Apply opacity to grid colors
    const gridColor = `rgba(${parseInt(baseGridColor.slice(1, 3), 16)}, ${parseInt(baseGridColor.slice(3, 5), 16)}, ${parseInt(baseGridColor.slice(5, 7), 16)}, ${gridOpacity})`;
    const majorGridColor = `rgba(${parseInt(baseMajorGridColor.slice(1, 3), 16)}, ${parseInt(baseMajorGridColor.slice(3, 5), 16)}, ${parseInt(baseMajorGridColor.slice(5, 7), 16)}, ${gridOpacity})`;

    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(canvas.width, canvas.height);

    const startX = Math.floor(topLeft.x / gridSize) * gridSize;
    const endX = Math.ceil(bottomRight.x / gridSize) * gridSize;
    const startY = Math.floor(topLeft.y / gridSize) * gridSize;
    const endY = Math.ceil(bottomRight.y / gridSize) * gridSize;

    for (let x = startX; x <= endX; x += gridSize) {
      const screenX = (x - camera.x) * camera.zoom;
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, canvas.height);
      ctx.strokeStyle = x % (gridSize * 5) === 0 ? majorGridColor : gridColor;
      ctx.lineWidth = x % (gridSize * 5) === 0 ? 2 : 1;
      ctx.stroke();
    }

    for (let y = startY; y <= endY; y += gridSize) {
      const screenY = (y - camera.y) * camera.zoom;
      ctx.beginPath();
      ctx.moveTo(0, screenY);
      ctx.lineTo(canvas.width, screenY);
      ctx.strokeStyle = y % (gridSize * 5) === 0 ? majorGridColor : gridColor;
      ctx.lineWidth = y % (gridSize * 5) === 0 ? 2 : 1;
      ctx.stroke();
    }

    ctx.restore();
  }, [camera, screenToWorld, canvasRef, canvasStyle, gridOpacity]);

  const applyTransform = useCallback((ctx) => {
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
  }, [camera]);

  const resetTransform = useCallback((ctx) => {
    ctx.restore();
  }, []);

  const resetCamera = useCallback(() => {
    setCamera({ x: 0, y: 0, zoom: 1 });
  }, []);

  const zoomToFit = useCallback((bounds) => {
    if (!canvasRef.current || !bounds) return;
    const canvas = canvasRef.current;
    const padding = 50;

    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;

    const zoomX = (canvas.width - padding * 2) / contentWidth;
    const zoomY = (canvas.height - padding * 2) / contentHeight;
    const zoom = Math.min(zoomX, zoomY, 1);

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    setCamera({
      x: centerX - canvas.width / (2 * zoom),
      y: centerY - canvas.height / (2 * zoom),
      zoom: zoom
    });
  }, [canvasRef]);

  return {
    camera,
    setCamera,
    isPanning,
    isTouchPanning,
    isModifierPressed,
    isSpacePressed: isModifierPressed,
    worldToScreen,
    screenToWorld,
    getWorldMousePos,
    getCanvasMousePos,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    drawGrid,
    applyTransform,
    resetTransform,
    resetCamera,
    zoomToFit
  };
}