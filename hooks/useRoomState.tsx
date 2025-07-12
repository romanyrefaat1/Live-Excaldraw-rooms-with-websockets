import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useRoomState(roomId, userName) {
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [activeUsers, setActiveUsers] = useState([]);
  const [roomOwner, setRoomOwner] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [ownerConflict, setOwnerConflict] = useState(false);

  // Main room setup - only runs when we have both roomId and userName
  useEffect(() => {
    if (!roomId || !userName) return;
    
    console.log('Setting up room for user:', userName);
    
    const setupRoom = async () => {
      try {
        const { data: room, error } = await supabase
          .from('rooms')
          .select('owner_name, active_users')
          .eq('id', roomId)
          .single();
        
        if (error) {
          console.error('Error fetching room info:', error);
          return;
        }
        
        if (!room) {
          console.error('Room not found');
          return;
        }
        
        setRoomOwner(room.owner_name);
        const currentActiveUsers = room.active_users || [];
        setActiveUsers(currentActiveUsers);
        
        // Check ownership and conflicts
        const isRoomOwner = userName === room.owner_name;
        setIsOwner(isRoomOwner);
        
        if (isRoomOwner && currentActiveUsers.includes(userName)) {
          // Owner is already active - show conflict
          setOwnerConflict(true);
          return;
        } else {
          setOwnerConflict(false);
        }
        
        // Add user to active_users if not already there
        if (!currentActiveUsers.includes(userName)) {
          const updatedUsers = [...currentActiveUsers, userName];
          setActiveUsers(updatedUsers);
          
          await supabase
            .from('rooms')
            .update({ active_users: updatedUsers })
            .eq('id', roomId);
        }
        
      } catch (error) {
        console.error('Error in setupRoom:', error);
      }
    };
    
    setupRoom();
  }, [roomId, userName]);

  // Realtime subscription for room updates
  useEffect(() => {
    if (!roomId || !userName || ownerConflict) return;

    const channel = supabase
      .channel("room-state-" + roomId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          console.log('Room updated:', payload.new);
          if (payload.new.active_users) {
            setActiveUsers(payload.new.active_users);
          }
        }
      )
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        setConnectedUsers(Object.keys(presenceState).length);
      })
      .subscribe(async (status) => {
        console.log('Room state channel status:', status);
        if (status === "SUBSCRIBED") {
          await channel.track({ user: userName, timestamp: Date.now() });
        }
      });

    // Cleanup function
    return () => {
      console.log('Cleaning up room state channel');
      
      const removeUserFromRoom = async () => {
        try {
          const { data: room } = await supabase
            .from('rooms')
            .select('active_users')
            .eq('id', roomId)
            .single();
          
          if (room && room.active_users) {
            const updatedUsers = room.active_users.filter(user => user !== userName);
            await supabase
              .from('rooms')
              .update({ active_users: updatedUsers })
              .eq('id', roomId);
          }
        } catch (error) {
          console.error('Error removing user from room:', error);
        }
      };
      
      removeUserFromRoom();
      supabase.removeChannel(channel);
    };
  }, [roomId, userName, ownerConflict]);

  return {
    connectedUsers,
    activeUsers,
    roomOwner,
    isOwner,
    ownerConflict
  };
}