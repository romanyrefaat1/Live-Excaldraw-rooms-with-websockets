export default function Cursor({ user, cursor }) {
    return (
      <div
        className="fixed pointer-events-none z-40 transition-all duration-75"
        style={{
          left: cursor.x,
          top: cursor.y,
          transform: 'translate(-2px, -2px)'
        }}
      >
        {/* <MousePointer  size={24} /> */}
        {/* Cursor dot */}
        <div
          className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
          style={{ backgroundColor: cursor.color }}
        />
        {/* User name label */}
        <div
          className="absolute top-5 left-0 px-2 py-1 rounded text-xs text-white shadow-lg whitespace-nowrap"
          style={{ backgroundColor: cursor.color }}
        >
          {user}
        </div>
      </div>
    );
  }