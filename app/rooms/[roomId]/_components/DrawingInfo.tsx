export default function DrawingInfo({ currentStroke, ownerConflict }) {
    if (!currentStroke || ownerConflict) return null;
  
    return (
      <div className="fixed bottom-4 left-4 bg-black/70 text-white px-3 py-1 rounded text-sm">
        Drawing... {currentStroke.points.length} points
      </div>
    );
  }