'use client';

import React, { useEffect } from 'react';
import SpaceBoard from '@/components/SpaceBoard';
import { useCareer } from '@/hooks';
import { useSpaceStore } from '@/stores/spaceStore';

export default function HomePage() {
  const { refresh } = useCareer();
  const { syncFromBackend } = useSpaceStore();

  useEffect(() => {
    refresh().catch(() => undefined);
    syncFromBackend().catch(() => undefined);
  }, [refresh, syncFromBackend]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 font-mono select-none crt-flicker">
      {/* Retro Sci-fi Ambient Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[length:100%_4px] opacity-40 pointer-events-none z-10" />
      <div className="absolute inset-0 bg-radial-at-t from-cyan-950/20 via-slate-950/90 to-slate-950 pointer-events-none z-0" />
      
      {/* Full screen CRT scanline filter */}
      <div className="crt-scanline-overlay z-40 pointer-events-none" />
      
      {/* Centered 2D Office cockpit console */}
      <div className="w-full h-full flex items-center justify-center relative z-20">
        <SpaceBoard />
      </div>
    </main>
  );
}
