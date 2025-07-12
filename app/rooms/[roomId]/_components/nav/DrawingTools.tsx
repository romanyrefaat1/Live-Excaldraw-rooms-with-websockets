import React from 'react';

const DrawingTools = ({ drawingTool, setDrawingTool, ownerConflict, isLoading }) => {
  const tools = [
    {
      id: 'freehand',
      name: 'Freehand',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ),
    },
    {
      id: 'line',
      name: 'Straight Line',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      ),
    },
    {
      id: 'rectangle',
      name: 'Rectangle',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        </svg>
      ),
    },
    {
      id: 'circle',
      name: 'Circle',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex gap-1 p-1 bg-gray-50 rounded-lg">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setDrawingTool(tool.id)}
          disabled={ownerConflict || isLoading}
          className={`
            p-2 rounded-md transition-all duration-200 relative group
            ${drawingTool === tool.id
              ? 'bg-blue-500 text-white shadow-md'
              : 'bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            }
            ${ownerConflict || isLoading 
              ? 'opacity-50 cursor-not-allowed' 
              : 'hover:scale-105 active:scale-95'
            }
          `}
          title={tool.name}
        >
          {tool.icon}
          
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
            {tool.name}
          </div>
        </button>
      ))}
    </div>
  );
};

export default DrawingTools;