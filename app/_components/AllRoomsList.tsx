import Link from "next/link";

export default function AllRoomsList({ data, error }) {
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
                <td className="px-4 py-2 border border-gray-300 text-center"><Link href={"/rooms/"+item.id}>Enter Room</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  