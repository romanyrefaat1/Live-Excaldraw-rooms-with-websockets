// page.js (Home page)
"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useSocketContext } from "@/hooks/useSocket";

export default function Home() {
  const [isCreating, setIsCreating] = useState(true);
  const [name, setName] = useState("Josh");
  const [value, setValue] = useState("room-1");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const router = useRouter();
  const { sendMessage, addEventListener, removeEventListener, isConnected } = useSocketContext();

  useEffect(() => {
    // Set up event listeners for WebSocket responses
    const handleCreateRoomResponse = (data) => {
      setIsLoading(false);
      if (data.success) {
        // Store userName in sessionStorage for this room
        sessionStorage.setItem(`room_${value.trim()}_userName`, name.trim());
        router.push("/rooms/" + value.trim());
      } else {
        setError(data.error || "Failed to create room");
      }
    };

    const handleCheckRoomResponse = (data) => {
      setIsLoading(false);
      if (data.exists) {
        const room = data.room;
        
        // Check if trying to join as owner when owner might already be active
        if (name.trim() === room.ownerName && room.activeUsers.includes(name.trim())) {
          setError("The room owner is already active on another device. Only one device can be logged in as the owner at a time.");
          return;
        }
        
        // Store userName in sessionStorage for this room
        sessionStorage.setItem(`room_${value.trim()}_userName`, name.trim());
        router.push("/rooms/" + value.trim());
      } else {
        setError("Room not found");
      }
    };

    addEventListener('create-room-response', handleCreateRoomResponse);
    addEventListener('check-room-response', handleCheckRoomResponse);

    return () => {
      removeEventListener('create-room-response', handleCreateRoomResponse);
      removeEventListener('check-room-response', handleCheckRoomResponse);
    };
  }, [addEventListener, removeEventListener, value, name, router]);

  const handleSubmit = async () => {
    if (name.trim().length === 0) {
      setError("Please type a valid name");
      return;
    }

    if (value.trim().length === 0) {
      setError("Please type a valid room name");
      return;
    }

    if (!isConnected) {
      setError("Not connected to server. Please wait...");
      return;
    }

    setError(null);
    setIsLoading(true);

    if (isCreating) {
      // Create room
      sendMessage('create-room', {
        roomId: value.trim(),
        ownerName: name.trim()
      });
    } else {
      // Check if room exists before joining
      sendMessage('check-room', {
        roomId: value.trim()
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
          Welcome to Live Drawing Board
        </h1>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="room-input" className="block text-sm font-medium text-gray-700 mb-2">
              {isCreating ? "Room Name (to create)" : "Room Name (to join)"}
            </label>
            <input
              id="room-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter room name"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="user-name" className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your name"
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center justify-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
              {isConnected ? 'Connected to server' : 'Disconnected from server'}
            </span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isLoading || !isConnected}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : `${isCreating ? "Create" : "Join"} Room`}
          </button>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            onClick={() => {
              setIsCreating(prev => !prev);
              setError(null);
            }}
            disabled={isLoading}
            className="w-full text-blue-500 underline hover:text-blue-700 disabled:text-gray-400"
          >
            {isCreating ? "Join existing room instead" : "Create new room instead"}
          </button>
        </div>
      </div>
    </div>
  );
}