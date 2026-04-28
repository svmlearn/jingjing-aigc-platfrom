import { redirect } from "next/navigation";

import {
  createSupabaseServerClient,
  isSupabasePublicConfigured,
} from "@/lib/supabase/server";

export async function GET() {
  if (isSupabasePublicConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  redirect("/login");
}
