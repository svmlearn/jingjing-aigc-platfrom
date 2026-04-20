import { ArrowRight, Database, LockKeyhole, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f7f2e8,_transparent_34%),linear-gradient(135deg,_#fffaf1_0%,_#f6f7f2_48%,_#edf5f0_100%)] px-6 py-8 text-stone-950">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col justify-between gap-12">
        <div className="flex items-center justify-between gap-8">
          <div>
            <p className="text-sm font-medium tracking-[0.24em] text-stone-500 uppercase">
              Jingjing V0.1-A
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
              内容导入到改写的共同脚手架
            </h1>
          </div>
          <Badge
            variant="secondary"
            className="hidden rounded-full px-4 py-2 sm:inline-flex"
          >
            API-first scaffold
          </Badge>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          <Card className="border-stone-200/80 bg-white/75 shadow-xl shadow-stone-900/5 backdrop-blur">
            <CardHeader className="pb-6">
              <CardTitle className="text-2xl">当前主链路</CardTitle>
              <CardDescription className="text-base">
                邀请码注册、商户资料、Apify 导入、内容中心、AI 改写和草稿保存。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["01", "邀请码注册", "一个商户一个 owner"],
                  ["02", "导入内容", "小红书 / 抖音 detail + comments"],
                  ["03", "改写草稿", "结合商户服务项目生成版本"],
                ].map(([step, title, body]) => (
                  <div key={step} className="rounded-2xl border bg-stone-50/80 p-5">
                    <p className="text-xs font-semibold text-stone-400">{step}</p>
                    <h2 className="mt-3 font-semibold">{title}</h2>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{body}</p>
                  </div>
                ))}
              </div>
              <Button className="mt-8 rounded-full">
                等待 A/B 分支接入
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-5">
            {[
              {
                Icon: LockKeyhole,
                title: "密钥只在服务端",
                body: "Apify、OpenAI、service role 不进入浏览器。",
              },
              {
                Icon: Database,
                title: "Supabase 可迁移",
                body: "业务层通过封装访问，后续可换自有 Postgres。",
              },
              {
                Icon: Workflow,
                title: "Adapter 隔离",
                body: "导入供应商先接 Apify，后续可替换 Bright Data 或 Worker。",
              },
            ].map(({ Icon, title, body }) => (
              <Card key={title} className="border-stone-200/80 bg-white/65 backdrop-blur">
                <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                  <div className="rounded-2xl bg-stone-900 p-3 text-white">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription className="mt-2 leading-6">{body}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
