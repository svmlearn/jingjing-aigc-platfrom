import Link from "next/link";

import { RegistrationFlow } from "@/components/dashboard/registration-flow";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fa] px-4 py-6 text-[#17202a] md:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <section className="order-2 lg:order-1">
          <Link href="/dashboard/import" className="text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]">
            返回后台
          </Link>
          <h1 className="mt-5 max-w-xl text-3xl font-semibold md:text-5xl">
            用邀请码开通商户内容工作台
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#5d6b7a]">
            先创建 owner 账号，再补全商户资料。后续导入和改写都会围绕这份商户资料生成。
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["邀请码校验", "创建商户", "进入资料页"].map((item, index) => (
              <div key={item} className="rounded-md border border-[#dde3ea] bg-white p-4">
                <p className="text-xs font-semibold text-[#0f766e]">0{index + 1}</p>
                <p className="mt-2 text-sm font-medium">{item}</p>
              </div>
            ))}
          </div>
        </section>
        <RegistrationFlow />
      </div>
    </main>
  );
}
