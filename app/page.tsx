"use client";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Home() {
  const [isCreating, setIsCreating] = useState(true);
  const [name, setName] = useState("Josh")
  const [value, setValue] = useState("room-1");
  const router = useRouter()
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (name.trim().length === 0) {
      setError("Please type a valid name");
      return;
    }
    
    if (isCreating) {
      const { error } = await supabase.from("rooms").insert([
        {
          id: value,
          owner_name: name,
          active_users: [] // Initialize as empty array
        }
      ])
      console.log("done")
      if (error) {
        console.log("error", error)
        setError(error?.message)
        return;
      }
      console.log("passed")

      // Store userName in sessionStorage for this room
      sessionStorage.setItem(`room_${value.trim()}_userName`, name.trim());
      
      router.push("/rooms/" + value.trim())
      return;
    }

    const { data, error } = await supabase.from("rooms").select("id,owner_name,active_users").eq("id", value.trim()).single()

    console.log("data", data, "error", error);

    if (error || !data) {
      setError("Room not found");
      return;
    }
    
    // Check if trying to join as owner when owner might already be active
    if (name.trim() === data.owner_name) {
      // Check if owner is already active
      const activeUsers = data.active_users || [];
      if (activeUsers.includes(name.trim())) {
        setError("The room owner is already active on another device. Only one device can be logged in as the owner at a time.");
        return;
      }
    }
    
    // Store userName in sessionStorage for this room
    sessionStorage.setItem(`room_${value.trim()}_userName`, name.trim());
    
    router.push("/rooms/" + value.trim());
  }
  
  return (
    <div>
      <h1>Welcome to live drawing board</h1>
      <label htmlFor="room-input">Enter {isCreating ? "Room Name" : "Room Name"}</label>
      <input id="room-input" value={value} onChange={(e) => setValue(e.target.value)} />
      
      <label htmlFor="user-name">Your Name</label>
      <input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />

      <button onClick={handleSubmit}>{isCreating ? "Create" : "Join"} Room</button>
      {error && <p className="text-red-500">{error}</p>}
      <button className="block" onClick={() => { setIsCreating(prev => !prev) }}>{isCreating ? "Join" : "Create"} Room Instead</button>
    </div>
  );
}