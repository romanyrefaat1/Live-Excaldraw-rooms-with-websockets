"use client";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function JoinOrCreateRoomForm() {
  const [isCreating, setIsCreating] = useState(true);
  const [name, setName] = useState("Josh");
  const [value, setValue] = useState("room-1");
  const [password, setPassword] = useState("123")
  const [ppassword, setPPassword] = useState("")
  const router = useRouter();
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setError(null);
    if (name.trim().length === 0) {
      setError("Please type a valid name");
      return;
    }

    if ( password.trim().length === 0 || password.length < 3 || ppassword.trim().length === 0 || ppassword.length < 3 ) {
      setError("Password must be at least 3 letters")
      return;
    }

    if (isCreating) {
      const { error } = await supabase.from("rooms").insert([
        {
          id: value,
          owner_name: name,
          active_users: [],
          password,
          p_password: ppassword
        },
      ]);
      if (error) {
        setError(error?.message);
        return;
      }
      sessionStorage.setItem(`room_${value.trim()}_userName`, name.trim());
      router.push("/rooms/" + value.trim());
      return;
    }

    const { data, error: fetchError } = await supabase
      .from("rooms")
      .select("id,owner_name,active_users")
      .eq("id", value.trim())
      .eq("password", password)
      .single();

    if (fetchError || !data) {
      setError("Room not found or wrong password");
      return;
    }

    if (name.trim() === data.owner_name) {
      const activeUsers = data.active_users || [];
      if (activeUsers.includes(name.trim())) {
        setError(
          "The room owner is already active on another device. Only one device can be logged in as the owner at a time."
        );
        return;
      }
    }

    sessionStorage.setItem(`room_${value.trim()}_userName`, name.trim());
    router.push("/rooms/" + value.trim());
  };

  return (
    <div className="max-w-md mx-auto mt-8 p-6 border border-gray-300 rounded-lg shadow-lg bg-white">
      <h2 className="text-2xl font-bold mb-4 text-center">
        {isCreating ? "Create a Room" : "Join a Room"}
      </h2>

      <label htmlFor="room-input" className="block text-gray-700 font-medium mb-1">
        Room Name
      </label>
      <input
        id="room-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter room name"
        className="w-full mb-4 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <label htmlFor="user-name" className="block text-gray-700 font-medium mb-1">
        Your Name
      </label>
      <input
        id="user-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter your name"
        className="w-full mb-4 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      
<label htmlFor="password-input" className="block text-gray-700 font-medium mb-1">
        Public Password (Users enter as "User" role)
      </label>
      <input
        id="password-input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Enter a strong password"
        className="w-full mb-4 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span>If you want your room to be public leave it as 123.</span>

<label htmlFor="private-password-input" className="block text-gray-700 font-medium mb-1">
        Private Password (User enters as "Owner" role)
      </label>
      <input
        id="private-password-input"
        value={ppassword}
        onChange={(e) => setPPassword(e.target.value)}
        placeholder="Enter a strong password"
        className="w-full mb-4 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {error && <p className="text-red-500 mb-4">{error}</p>}

      <button
        onClick={handleSubmit}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition"
      >
        {isCreating ? "Create" : "Join"} Room
      </button>

      <button
        className="w-full mt-4 text-sm text-blue-600 underline hover:text-blue-800"
        onClick={() => {
          setIsCreating((prev) => !prev);
          setError(null);
        }}
      >
        {isCreating ? "Want to join instead?" : "Want to create instead?"}
      </button>
    </div>
  );
}