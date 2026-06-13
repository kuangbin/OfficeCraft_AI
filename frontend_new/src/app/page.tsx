'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, ScenePage } from '@/components/layout';
import { PixelBadge, PixelButton, PixelCard, PixelProgress } from '@/components/pixel';
import { IMAGES } from '@/constants/images';
import { ROUTES } from '@/constants';
import { useCareer } from '@/hooks';
import SpaceBoard from '@/components/SpaceBoard';
import { useSpaceStore } from '@/stores/spaceStore';

export default function HomePage() {
  const router = useRouter();
  const { currentCareerId, totalXp, activeCareer, loading, refresh } = useCareer();
  const { ambientTheme, syncFromBackend } = useSpaceStore();

  useEffect(() => {
    refresh().catch(() => undefined);
    syncFromBackend().catch(() => undefined);
  }, [refresh, syncFromBackend]);

  return (
    <AppShell>
      <ScenePage backgroundImage={IMAGES.CAREER_CAMPUS_BACKDROP} maxWidth="7xl" position="center center">
        <section className="py-6 space-y-6">
          {/* Header Title Section */}
          <div className="border-4 border-slate-700 bg-slate-950/85 p-6 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            {/* Ambient indicator lights on header corner */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-cyan-400 to-purple-500" />
            
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <PixelBadge variant="warning" className="text-xs uppercase tracking-widest animate-pulse">
                  OfficeCraft Twin Console v1.0.2
                </PixelBadge>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">Space Server Connected</span>
                </div>
              </div>

              <h1 className="pixel-title text-4xl leading-tight text-amber-300 md:text-5xl">
                OfficeCraft AI
              </h1>
              
              <p className="max-w-2xl text-xs leading-6 text-slate-400 font-mono">
                2D 像素数字孪生办公室与沉浸交互。用 W-A-S-D 控制你的数字小人在办公室网格中探索、去物理资料库点击书架触发 RAG 检索、或者靠近 AI 导师进行专业咨询。
              </p>
            </div>

            {/* Global User status badge */}
            <div className="border-2 border-slate-700 bg-slate-900/60 p-3 flex gap-4 font-mono select-none">
              <div className="min-w-[100px]">
                <div className="text-[9px] text-slate-500 uppercase">Current Career</div>
                <div className="text-xs font-bold text-amber-300 truncate max-w-[120px]">
                  {activeCareer?.name || '尚未选择职业'}
                </div>
              </div>
              <div className="w-[1px] h-8 bg-slate-800" />
              <div className="text-right">
                <div className="text-[9px] text-slate-500 uppercase">Growth Rating</div>
                <div className="text-xs font-bold text-cyan-400">{totalXp} XP</div>
              </div>
            </div>
          </div>

          {/* Core RPG 2D Board Section */}
          <div className="border-4 border-slate-700 bg-slate-950/40 p-4 backdrop-blur-md flex justify-center">
            <SpaceBoard />
          </div>

          {/* Quick Stats and Action Panels below RPG board */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Card 1: Active Quest */}
            <PixelCard className="border-slate-700 bg-slate-950/80 p-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">Active Objectives</div>
                <h3 className="font-bold text-amber-300 text-sm font-mono">主线研发任务进度</h3>
                <p className="text-xs text-slate-400 font-mono leading-5">
                  你可以在办公室右侧的会议讨论区去找产品经理 Amy 或技术主管高凌领取今日份的主线挑战任务。
                </p>
              </div>
              <div className="pt-4 border-t border-slate-800/40 mt-3 flex justify-between gap-2">
                <PixelButton
                  variant="secondary"
                  className="py-1 text-[10px] flex-1"
                  onClick={() => router.push('/lobby')}
                >
                  前往办事大厅
                </PixelButton>
              </div>
            </PixelCard>

            {/* Card 2: Environment Overlays */}
            <PixelCard className="border-slate-700 bg-slate-950/80 p-4">
              <div className="space-y-3">
                <div className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">Prompt-to-Light</div>
                <h3 className="font-bold text-slate-200 text-sm font-mono">空间环境光效传感器</h3>
                <p className="text-xs text-slate-400 font-mono leading-5">
                  办公室光效与你的任务深度同步。当遇到关键事件时，数字孪生办公室的主题光效会自动进行渐变转换。
                </p>

                {/* Legend lights preview */}
                <div className="flex gap-2 pt-2 select-none">
                  <div className="flex-1 py-1 text-center font-mono text-[8px] bg-blue-950/40 border border-cyan-800/30 text-cyan-400 rounded">
                    🔵 静谧幽蓝
                  </div>
                  <div className="flex-1 py-1 text-center font-mono text-[8px] bg-red-950/40 border border-red-800/30 text-red-400 rounded">
                    🔴 警报闪烁
                  </div>
                  <div className="flex-1 py-1 text-center font-mono text-[8px] bg-amber-950/40 border border-amber-800/30 text-amber-400 rounded animate-pulse">
                    ✨ 金色庆典
                  </div>
                </div>
              </div>
            </PixelCard>

            {/* Card 3: Growth Portfolio */}
            <PixelCard className="border-slate-700 bg-slate-950/80 p-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">Sandbox Archive</div>
                <h3 className="font-bold text-slate-200 text-sm font-mono">个人成长档案馆</h3>
                <p className="text-xs text-slate-400 font-mono leading-5">
                  你所有的代码修改、API 对接成果以及 AI 同事的反馈都将自动归档，形成极具竞争力的数据作品集。
                </p>
                <div className="pt-2">
                  <PixelProgress value={Math.min(totalXp / 10, 100)} label="职业成长" color="#f59e0b" />
                </div>
              </div>
              <div className="pt-4 border-t border-slate-800/40 mt-3 flex justify-between gap-2">
                <PixelButton
                  variant="ghost"
                  className="py-1 text-[10px] flex-1 text-amber-200"
                  onClick={() => router.push('/portfolio')}
                >
                  查看能力证书 (Portfolio)
                </PixelButton>
              </div>
            </PixelCard>
          </div>
        </section>
      </ScenePage>
    </AppShell>
  );
}
