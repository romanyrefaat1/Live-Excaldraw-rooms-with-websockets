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
    ownerConflict
  }) {
    return (
      <div className="fixed top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-4 shadow-lg border">
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
        
        {/* Online cursors display */}
        {otherCursors.size > 0 && (
          <div className="mb-3">
            <label className="text-sm font-medium mb-1 block">Active Cursors ({otherCursors.size}):</label>
            <div className="flex flex-wrap gap-1">
              {Array.from(otherCursors.entries()).map(([user, cursor]) => (
                <span 
                  key={user} 
                  className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800 flex items-center gap-1"
                >
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: cursor.color }}
                  ></div>
                  {user}
                </span>
              ))}
            </div>
          </div>
        )}
        
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
        </div>
        
        <div className="flex gap-2">
          {isOwner && !ownerConflict && (
            <button 
              onClick={onClearCanvas} 
              disabled={isReplaying || isLoading}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:bg-gray-400"
            >
              Clear All
            </button>
          )}
          <button 
            onClick={onReplayStrokes} 
            disabled={isReplaying || !strokes.length || isLoading || ownerConflict}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:bg-gray-400"
          >
            {isReplaying ? "Replaying..." : "Replay"}
          </button>
        </div>
      </div>
    );
  }