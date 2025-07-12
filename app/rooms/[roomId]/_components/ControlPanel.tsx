import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Move, Eye, EyeOff, Navigation, ArrowDown, ArrowUp } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function ControlPanel({
  connectedUsers,
  isLoading,
  userName,
  isOwner,
  roomOwner,
  activeUsers,
  otherCursors,
  strokeSize,
  setStrokeSize,
  strokeColor,
  setStrokeColor,
  isReplaying,
  strokes,
  onClearCanvas,
  onReplayStrokes,
  ownerConflict,
  // Infinite canvas props
  camera,
  isPanning,
  isSpacePressed,
  onResetCamera,
  onZoomToFit,
  setCamera,
  // Canvas style props
  canvasStyle,
  setCanvasStyle,
  gridOpacity,
  setGridOpacity
}) {
  const [followingUser, setFollowingUser] = useState(null);
  const [isOpen, setIsOpen] = useState(true);

  // Follow cursor functionality
  const handleFollowUser = (user) => {
    if (followingUser === user) {
      setFollowingUser(null);
    } else {
      setFollowingUser(user);
    }
  };

  const handleGoToUser = (user) => {
    const cursor = otherCursors.get(user);
    if (cursor && cursor.x !== undefined && cursor.y !== undefined) {
      // Convert cursor position to world coordinates if needed
      // The cursor position should already be in world coordinates
      const worldX = cursor.x;
      const worldY = cursor.y;
      
      // Calculate where to position the camera to center the cursor
      // We want the cursor to appear in the center of the screen
      const canvasWidth = window.innerWidth;
      const canvasHeight = window.innerHeight;
      
      // Calculate the camera position to center the cursor
      const newCameraX = worldX - (canvasWidth / 2) / camera.zoom;
      const newCameraY = worldY - (canvasHeight / 2) / camera.zoom;
      
      // Add some random offset so it's not perfectly centered (for better UX)
      const offsetX = (Math.random() - 0.5) * 200 / camera.zoom; // Scale offset with zoom
      const offsetY = (Math.random() - 0.5) * 200 / camera.zoom;
      
      setCamera({
        ...camera,
        x: newCameraX + offsetX,
        y: newCameraY + offsetY
      });
    }
  };

  // Auto-follow logic with proper camera handling
  useEffect(() => {
    if (!followingUser || !otherCursors.has(followingUser)) return;
    
    const cursor = otherCursors.get(followingUser);
    if (cursor && cursor.x !== undefined && cursor.y !== undefined) {
      // Convert cursor world position to screen coordinates
      const screenX = (cursor.x - camera.x) * camera.zoom;
      const screenY = (cursor.y - camera.y) * camera.zoom;
      
      // Screen center coordinates
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      
      // Calculate distance from center
      const deltaX = screenX - centerX;
      const deltaY = screenY - centerY;
      
      // Define a dead zone around the center (scaled with zoom level)
      const deadZone = Math.max(100, 200 / camera.zoom); // Adaptive dead zone
      
      // Only move camera if cursor is outside the dead zone
      if (Math.abs(deltaX) > deadZone || Math.abs(deltaY) > deadZone) {
        // Calculate smooth following movement
        const smoothingFactor = 0.08; // Adjust for smoother/faster following
        
        // Calculate how much to move the camera in world coordinates
        const worldDeltaX = deltaX * smoothingFactor / camera.zoom;
        const worldDeltaY = deltaY * smoothingFactor / camera.zoom;
        
        setCamera(prev => ({
          ...prev,
          x: prev.x + worldDeltaX,
          y: prev.y + worldDeltaY
        }));
      }
    }
  }, [otherCursors, followingUser, camera, setCamera]);

  // Stop following if user disconnects
  useEffect(() => {
    if (followingUser && !otherCursors.has(followingUser)) {
      setFollowingUser(null);
    }
  }, [followingUser, otherCursors]);

  const handleZoomIn = () => {
    setCamera(prev => ({ 
      ...prev, 
      zoom: Math.min(prev.zoom * 1.2, 5) 
    }));
  };

  const handleZoomOut = () => {
    setCamera(prev => ({ 
      ...prev, 
      zoom: Math.max(prev.zoom / 1.2, 0.1) 
    }));
  };

  const formatZoom = (zoom) => {
    return Math.round(zoom * 100) + '%';
  };

  const formatCoords = (x, y) => {
    return `(${Math.round(x)}, ${Math.round(y)})`;
  };

  // Helper function to get cursor position relative to current view
  const getCursorScreenPosition = (cursor) => {
    if (!cursor || cursor.x === undefined || cursor.y === undefined) return null;
    
    const screenX = (cursor.x - camera.x) * camera.zoom;
    const screenY = (cursor.y - camera.y) * camera.zoom;
    
    // Check if cursor is visible on screen
    const isVisible = screenX >= 0 && screenX <= window.innerWidth && 
                     screenY >= 0 && screenY <= window.innerHeight;
    
    return { screenX, screenY, isVisible };
  };

  return (
    <div className="fixed top-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg p-4 shadow-lg border max-w-sm max-h-[calc(100vh-2rem)] overflow-y-auto">
      {/* Connection Status */}
      <button onClick={() => setIsOpen(prev => !prev)}>{isOpen ? <ArrowDown /> : <ArrowUp />}</button>
      {isOpen && <>
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
      
      {/* Online cursors display with follow/go to options */}
      <div className="mb-3">
        <label className="text-sm font-medium mb-1 block">Active Cursors ({otherCursors.size}):</label>
        <div className="space-y-2">
          {Array.from(otherCursors.entries()).map(([user, cursor]) => {
            const screenPos = getCursorScreenPosition(cursor);
            return (
              <div 
                key={user} 
                className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border"
              >
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full border-2 border-white shadow-sm" 
                    style={{ backgroundColor: cursor.color }}
                  ></div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{user}</span>
                    {screenPos && (
                      <span className="text-xs text-gray-500">
                        {screenPos.isVisible ? '👁️ Visible' : '📍 Off-screen'}
                      </span>
                    )}
                  </div>
                  {followingUser === user && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                      Following
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleGoToUser(user)}
                    className="p-1 hover:bg-gray-200 rounded text-gray-600 hover:text-gray-800"
                    title="Go to user"
                  >
                    <Navigation size={14} />
                  </button>
                  <button
                    onClick={() => handleFollowUser(user)}
                    className={`p-1 rounded ${
                      followingUser === user 
                        ? 'bg-green-200 text-green-800 hover:bg-green-300' 
                        : 'hover:bg-gray-200 text-gray-600 hover:text-gray-800'
                    }`}
                    title={followingUser === user ? "Stop following" : "Follow user"}
                  >
                    {followingUser === user ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Canvas Style Controls */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <label className="text-sm font-semibold mb-2 block text-gray-700">Canvas Style</label>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="grid"
              name="canvasStyle"
              value="grid"
              checked={canvasStyle === 'grid'}
              onChange={(e) => setCanvasStyle(e.target.value)}
              className="w-4 h-4"
            />
            <label htmlFor="grid" className="text-sm">Grid Background</label>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="white"
              name="canvasStyle"
              value="white"
              checked={canvasStyle === 'white'}
              onChange={(e) => setCanvasStyle(e.target.value)}
              className="w-4 h-4"
            />
            <label htmlFor="white" className="text-sm">White Background</label>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="empty"
              name="canvasStyle"
              value="empty"
              checked={canvasStyle === 'empty'}
              onChange={(e) => setCanvasStyle(e.target.value)}
              className="w-4 h-4"
            />
            <label htmlFor="empty" className="text-sm">Transparent</label>
          </div>
          
          {canvasStyle === 'grid' && (
            <div className="mt-2">
              <label className="text-xs text-gray-600 mb-1 block">Grid Opacity:</label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={gridOpacity}
                onChange={(e) => setGridOpacity(parseFloat(e.target.value))}
                className="w-full"
              />
              <span className="text-xs text-gray-500">{Math.round(gridOpacity * 100)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Infinite Canvas Controls */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <label className="text-sm font-semibold mb-2 block text-gray-700">Canvas View</label>
        
        {/* Camera Info */}
        <div className="text-xs text-gray-600 mb-2">
          <div>Zoom: {formatZoom(camera.zoom)}</div>
          <div>Position: {formatCoords(camera.x, camera.y)}</div>
          {isPanning && (
            <div className="text-blue-600 font-medium">
              {isSpacePressed ? 'Panning (Space)' : 'Panning'}
            </div>
          )}
          {followingUser && (
            <div className="text-green-600 font-medium">
              Following {followingUser}
            </div>
          )}
        </div>
        
        {/* Zoom Controls */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={handleZoomOut}
            className="p-1 bg-white border rounded hover:bg-gray-100 disabled:opacity-50"
            disabled={camera.zoom <= 0.1}
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          
          <div className="flex-1 text-center text-sm font-medium">
            {formatZoom(camera.zoom)}
          </div>
          
          <button
            onClick={handleZoomIn}
            className="p-1 bg-white border rounded hover:bg-gray-100 disabled:opacity-50"
            disabled={camera.zoom >= 5}
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
        </div>
        
        {/* Canvas Actions */}
        <div className="flex gap-2">
          <button
            onClick={onResetCamera}
            className="flex-1 p-2 bg-white border rounded text-sm hover:bg-gray-100 flex items-center justify-center gap-1"
            title="Reset View"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          
          <button
            onClick={onZoomToFit}
            disabled={!strokes.length}
            className="flex-1 p-2 bg-white border rounded text-sm hover:bg-gray-100 disabled:opacity-50 flex items-center justify-center gap-1"
            title="Zoom to Fit Content"
          >
            <Maximize2 size={14} />
            Fit
          </button>
        </div>
        
        {/* Navigation Hint */}
        <div className="mt-2 text-xs text-gray-500 text-center">
          Hold <kbd className="px-1 py-0.5 bg-white border rounded text-xs">Space</kbd> + drag to pan
          <br />
          Use mouse wheel to zoom
        </div>
      </div>
      
      {/* Drawing Controls */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <label className="text-sm font-semibold mb-2 block text-gray-700">Drawing Tools</label>
        
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
          <span className="text-sm text-gray-600">{strokeColor}</span>
        </div>
      </div>
      
      {/* Canvas Actions */}
      <div className="flex gap-2">
        {isOwner && !ownerConflict && (
          <button 
            onClick={onClearCanvas} 
            disabled={isReplaying || isLoading}
            className="px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:bg-gray-400"
          >
            Clear All
          </button>
        )}
        <button 
          onClick={onReplayStrokes} 
          disabled={isReplaying || !strokes.length || isLoading || ownerConflict}
          className="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:bg-gray-400"
        >
          {isReplaying ? "Replaying..." : "Replay"}
        </button>
      </div>
      </>}
    </div>
  );
}