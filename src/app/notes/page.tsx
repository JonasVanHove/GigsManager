import { redirect } from "next/navigation";

export default function NotesRoute() {
  redirect("/app?tab=setlists");
}
