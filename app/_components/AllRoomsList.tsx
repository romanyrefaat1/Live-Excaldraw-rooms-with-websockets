"use client";

import { useRouter } from "next/navigation";

export default function AllRoomsList({ data, error }) {
  const route = useRouter()
  const handleRedirect = (id)=>{
    sessionStorage.setItem(`room_${id.trim()}_userName`, `user_${Math.trunc(Math.random()*100+10)}`);
    route.push(`/rooms/${id}`)
  }
  
    if (error)
      return (
        <div className="flex items-center justify-center text-red-500 w-full h-full">
          <p>
            Error fetching rooms: {error.mess}
            {error.code}
          </p>
        </div>
      );
  
    if (data.length === 0)
      return (
        <div className="flex items-center justify-center text-red-500 w-full h-full">
          <p>No Rooms found. Be the first person to create a room!</p>
        </div>
      );
  
    return (
      <div className="flex flex-col gap-4 overflow-x-auto">
        <table className="table-auto w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 border border-gray-300">Room ID</th>
              <th className="px-4 py-2 border border-gray-300">Created At</th>
              <th className="px-4 py-2 border border-gray-300">Owner</th>
              <th className="px-4 py-2 border border-gray-300">Active Users</th>
              <th className="px-4 py-2 border border-gray-300">Room Link</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.id} className="even:bg-gray-50">
                <td className="px-4 py-2 border border-gray-300 text-center">{item.id}</td>
                <td className="px-4 py-2 border border-gray-300 text-center">{item.created_at}</td>
                <td className="px-4 py-2 border border-gray-300 text-center">{item.owner_name}</td>
                <td className="px-4 py-2 border border-gray-300 text-center">
                  {Array.isArray(item.active_users)
                    ? item.active_users.join(", ")
                    : "-"}
                </td>
                <td className="px-4 py-2 border border-gray-300 text-center"><button onClick={()=>handleRedirect(item.id)}>Enter Room</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  