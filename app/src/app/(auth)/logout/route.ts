import { redirect } from "next/navigation";

import { signOutDomesticUser } from "@/lib/auth/domestic-session";

export async function GET() {
  redirect("/login");
}

export async function POST() {
  await signOutDomesticUser();
  redirect("/login");
}
