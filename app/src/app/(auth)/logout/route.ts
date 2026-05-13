import { redirect } from "next/navigation";

import { isDomesticSessionEnabled, signOutDomesticUser } from "@/lib/auth/domestic-session";
import {
  createSupabaseServerClient,
  isSupabasePublicConfigured,
} from "@/lib/supabase/server";

export async function GET() {
  redirect("/login");
}

export async function POST() {
  if (isDomesticSessionEnabled()) {
    await signOutDomesticUser();
    redirect("/login");
  }

  if (isSupabasePublicConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  redirect("/login");
}
