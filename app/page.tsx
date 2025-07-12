import { supabase } from "@/lib/supabase";
import JoinOrCreateRoomForm from "./_components/join-create-form";
import AllRoomsList from "./_components/AllRoomsList";

export default async function Home() {
  const {data, error: fetchErr} = await supabase.from("rooms").select("*");

  let error = null;

  if (fetchErr) error = fetchErr;
  
  return (
    <div>
      <h1>Welcome to live drawing board</h1>
     <JoinOrCreateRoomForm />
     <AllRoomsList error={error} data={data}/>
    </div>
  );
}