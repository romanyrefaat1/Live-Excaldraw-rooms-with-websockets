import { supabase } from "@/lib/supabase";
import DrawingCanvas from "./_components/DrawingCanvas";
import { notFound } from "next/navigation";

export default async function RoomPage ({params}){
    const {roomId} = await params;
    const {data, error} = await supabase.from("rooms").select("id,owner_name").eq("id", roomId).single();

    console.log("data", data, "error", error)
    if (error || !data) return notFound();

    return (
        <DrawingCanvas roomId={roomId}/>
    )
}