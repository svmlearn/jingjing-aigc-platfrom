import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "静境内容获客平台",
  description: "小红书与抖音内容导入、改写和草稿管理后台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
