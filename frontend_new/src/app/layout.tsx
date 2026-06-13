import type { Metadata } from "next";
import AppErrorBoundary from "@/components/common/AppErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "OfficeCraft AI - AI 驱动的 2D 像素数智化数字孪生办公室",
  description:
    "面向极客与开发者的 2D 虚拟办公室沙盒：基于 GLM-5 驱动的多智能体协作站会、RAG 语义检索、代码沙箱实训与高维交互式能力星图。",
  keywords: "OfficeCraft AI, GLM-5, AI, 2D 虚拟办公室, 职业模拟, 游戏化学习, 像素风, 技能树, RAG 检索",
  openGraph: {
    title: "OfficeCraft AI - AI 驱动的 2D 像素数智化数字孪生办公室",
    description: "基于 GLM-5 驱动的多智能体协作站会、RAG 语义检索、代码沙箱实训与高维交互式能力星图。",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        {/* 像素风 Favicon */}
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎮</text></svg>"
        />
      </head>
      <body
        style={{
          fontFamily: "'Press Start 2P', 'VT323', 'Courier New', monospace",
        }}
      >
        <AppErrorBoundary>{children}</AppErrorBoundary>
      </body>
    </html>
  );
}
