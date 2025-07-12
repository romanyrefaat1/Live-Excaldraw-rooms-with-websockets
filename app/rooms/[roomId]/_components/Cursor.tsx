import { useEffect, useState } from 'react';

export default function Cursor({ user, cursor, infiniteCanvas }) {
  const [screenPos, setScreenPos] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);

  // Convert world coordinates to screen coordinates
  useEffect(() => {
    if (!cursor || !infiniteCanvas || cursor.x === undefined || cursor.y === undefined) {
      setIsVisible(false);
      return;
    }

    const screenCoords = infiniteCanvas.worldToScreen(cursor.x, cursor.y);
    setScreenPos(screenCoords);

    // Check if cursor is visible on screen
    const margin = 50; // Allow some margin for cursors near edges
    const visible = screenCoords.x >= -margin && 
                   screenCoords.x <= window.innerWidth + margin && 
                   screenCoords.y >= -margin && 
                   screenCoords.y <= window.innerHeight + margin;
    setIsVisible(visible);
  }, [cursor, infiniteCanvas.camera]); // Re-calculate when cursor position or camera changes

  if (!isVisible) return null;

  return (
    <div
      className="fixed pointer-events-none z-50 transition-all duration-100"
      style={{
        left: screenPos.x,
        top: screenPos.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Cursor dot */}
      <div
        className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
        style={{ backgroundColor: cursor.color }}
      />
      
      {/* User label */}
      <div
        className="absolute top-5 left-1/2 transform -translate-x-1/2 
                   px-2 py-1 text-xs font-medium text-white rounded-md shadow-lg whitespace-nowrap"
        style={{ backgroundColor: cursor.color }}
      >
        {user}
      </div>
    </div>
  );
}