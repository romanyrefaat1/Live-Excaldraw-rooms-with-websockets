import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useRoomState(roomId, userName) {
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [activeUsers, setActiveUsers] = useState([]);
  const [roomOwner, setRoomOwner] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [ownerConflict, setOwnerConflict] = useState(false);

  const updateActiveUsers = async (updatedUsers) => {
    if (!roomId) return;
    try {
      await supabase
        .from("rooms")
        .update({ active_users: updatedUsers })
        .eq("id", roomId);
      setActiveUsers(updatedUsers);
    } catch (error) {
      console.error("Error updating active users:", error);
    }
  };

  // Main room setup
  useEffect(() => {
    if (!roomId || !userName) return;

    const setupRoom = async () => {
      try {
        const { data: room, error } = await supabase
          .from("rooms")
          .select("owner_name, active_users")
          .eq("id", roomId)
          .single();

        if (error) {
          console.error("Error fetching room info:", error);
          return;
        }

        if (!room) {
          console.error("Room not found");
          return;
        }

        setRoomOwner(room.owner_name);
        const currentActiveUsers = room.active_users || [];
        setActiveUsers(currentActiveUsers);

        const isRoomOwner = userName === room.owner_name;
        setIsOwner(isRoomOwner);

        if (isRoomOwner && currentActiveUsers.includes(userName)) {
          setOwnerConflict(true);
          return;
        } else {
          setOwnerConflict(false);
        }

        if (!currentActiveUsers.includes(userName)) {
          const updatedUsers = [...currentActiveUsers, userName];
          await updateActiveUsers(updatedUsers);
        }

      } catch (error) {
        console.error("Error in setupRoom:", error);
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
        if (status === "SUBSCRIBED") {
          await channel.track({ user: userName, timestamp: Date.now() });
        }
      });

    return () => {
      const removeUser = async () => {
        try {
          const { data: room } = await supabase
            .from("rooms")
            .select("active_users")
            .eq("id", roomId)
            .single();

          if (room && room.active_users) {
            const updatedUsers = room.active_users.filter(
              (user) => user !== userName
            );
            await updateActiveUsers(updatedUsers);
          }
        } catch (error) {
          console.error("Error removing user:", error);
        }
      };

      removeUser();
      supabase.removeChannel(channel);
    };
  }, [roomId, userName, ownerConflict]);

  return {
    connectedUsers,
    activeUsers,
    roomOwner,
    isOwner,
    ownerConflict,
  };
}
