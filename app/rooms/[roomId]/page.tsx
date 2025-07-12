// rooms/[roomId]/page.js
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSocketContext } from "@/hooks/useSocket";
import DrawingCanvas from "./_components/DrawingCanvas";

export default function RoomPage() {
  const { roomId } = useParams();
  const router = useRouter();
  const { sendMessage, addEventListener, removeEventListener, isConnected } = useSocketContext();
  const [roomData, setRoomData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userName, setUserName] = useState(null);

  useEffect(() => {
    if (!roomId) return;

    // Get userName from sessionStorage
    const storedUserName = sessionStorage.getItem(`room_${roomId}_userName`);
    if (!storedUserName) {
      router.push('/');
      return;
    }
    setUserName(storedUserName);

    // Set up event listeners
    const handleJoinRoomResponse = (data) => {
      setIsLoading(false);
      if (data.success) {
        setRoomData(data.room);
        setError(null);
      } else {
        setError(data.error || "Failed to join room");
      }
    };

    addEventListener('join-room-response', handleJoinRoomResponse);

    return () => {
      removeEventListener('join-room-response', handleJoinRoomResponse);
    };
  }, [roomId, router, addEventListener, removeEventListener]);

  useEffect(() => {
    if (!roomId || !userName || !isConnected) return;

    // Join the room
    setIsLoading(true);
    sendMessage('join-room', {
      roomId: roomId,
      userName: userName
    });
  }, [roomId, userName, isConnected, sendMessage]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Connecting to room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
          >
            Go Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!roomData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading room data...</p>
        </div>
      </div>
    );
  }

  return (
    <DrawingCanvas 
      roomId={roomId} 
      userName={userName}
      roomData={roomData}
    />
  );
}