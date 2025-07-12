import ControlPanel from "./ControlPanel";

export default function Navbar({
    drawing,
    roomState,
    userName,
    cursors,
    infiniteCanvas,
    canvasStyle,
    setCanvasStyle,
    gridOpacity,
    setGridOpacity
}) {

    return (
        <nav className="bg-white/95 backdrop-blur-sm rounded-lg p-4 shadow-lg border max-w-sm flex gap-2">
             <ControlPanel
                    connectedUsers={roomState.connectedUsers}
                    isLoading={drawing.isLoading}
                    userName={userName}
                    isOwner={roomState.isOwner}
                    roomOwner={roomState.roomOwner}
                    activeUsers={roomState.activeUsers}
                    otherCursors={cursors.otherCursors}
                    strokeSize={drawing.strokeSize}
                    setStrokeSize={drawing.setStrokeSize}
                    strokeColor={drawing.strokeColor}
                    setStrokeColor={drawing.setStrokeColor}
                    isReplaying={drawing.isReplaying}
                    strokes={drawing.strokes}
                    onClearCanvas={drawing.clearCanvas}
                    onReplayStrokes={drawing.replayStrokes}
                    ownerConflict={roomState.ownerConflict}
                    // Infinite canvas props
                    camera={infiniteCanvas.camera}
                    isPanning={infiniteCanvas.isPanning}
                    isSpacePressed={infiniteCanvas.isSpacePressed}
                    onResetCamera={infiniteCanvas.resetCamera}
                    onZoomToFit={drawing.zoomToFitContent}
                    setCamera={infiniteCanvas.setCamera}
                    // Canvas style props
                    canvasStyle={canvasStyle}
                    setCanvasStyle={setCanvasStyle}
                    gridOpacity={gridOpacity}
                    setGridOpacity={setGridOpacity}
                  />
                  <button>Button 2</button>
        </nav>
    )
}