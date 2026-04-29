import { AuthBackButton } from "@/components/app/auth-back-button";
import { RegistrationFlow } from "@/components/dashboard/registration-flow";

export default function RegisterPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-4 py-6 text-white md:px-6">
      <AuthBackButton fallbackHref="/login" />
      <div className="pointer-events-none absolute left-[-14rem] top-[-16rem] size-[32rem] rounded-full bg-amber-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-18rem] right-[-12rem] size-[34rem] rounded-full bg-orange-900/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/45 to-transparent" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl items-center justify-center py-10">
        <RegistrationFlow />
      </div>
    </main>
  );
}
