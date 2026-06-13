'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSpaceStore } from '@/stores/spaceStore';
import { api, streamChat, SpatialRagChunk } from '@/services/apiClient';
import { PixelBadge, PixelButton, PixelCard } from '@/components/pixel';

// Map area labels
const ZONES = {
  LOBBY: { name: '大厅接待区 (Lobby)', color: 'from-amber-950/20 to-transparent border-amber-950/20 text-amber-300' },
  DEV_BAY: { name: '技术开发区 (Dev Bay)', color: 'from-slate-900/30 to-transparent border-slate-900/20 text-blue-300' },
  MEETING: { name: '会议讨论区 (Meeting Room)', color: 'from-indigo-950/20 to-transparent border-indigo-950/20 text-indigo-300' },
  ARCHIVE: { name: '物理资料库 (Archive Room)', color: 'from-emerald-950/20 to-transparent border-emerald-950/20 text-emerald-300' },
};

// NPCs descriptions and details
const NPC_INFO = {
  mentor_ling: {
    id: 'mentor_ling',
    name: '高凌 | 技术主管 (Tech Lead)',
    roleName: '高凌',
    emoji: '👩‍💻',
    color: 'text-purple-400 border-purple-500',
    bgColor: 'bg-purple-950/40',
    greeting: '你好，我是技术主管高凌。写代码最忌讳浮躁，遇到技术卡点先查阅“物理资料库/书架区”的技术文档或 Pandas 手册。有不明白的可以向我领任务或咨询。',
    desc: '严谨认真的前端与系统架构专家，对代码规范和性能优化有极高要求。',
  },
  pm_amy: {
    id: 'pm_amy',
    name: 'Amy | 产品经理 (Product Manager)',
    roleName: 'Amy',
    emoji: '👩‍💼',
    color: 'text-amber-400 border-amber-500',
    bgColor: 'bg-amber-950/40',
    greeting: '嗨，我是产品主管 Amy！我们现在的迭代节奏非常快。如果你想要锻炼自己的产品思维、领取业务分析需求，可以直接找我。记住，数据分析才是支撑需求的硬道理！',
    desc: '敏锐高效的业务线 PM，热衷于通过敏捷开发与用户数据驱动产品迭代。',
  },
  mentor_ying: {
    id: 'mentor_ying',
    name: '郑莹 | 高级分析师 (Senior Analyst)',
    roleName: '郑莹',
    emoji: '🧠',
    color: 'text-cyan-400 border-cyan-500',
    bgColor: 'bg-cyan-950/40',
    greeting: '我是高级分析顾问郑莹。数据是一门艺术，也是最具说服力的武器。在开始你的分析任务前，最好多去书架区检索一些 Pandas 指南和分析规范。有任何疑惑随时来问我。',
    desc: '沉稳的数据建模大师，精通清洗、挖掘和业务指标体系搭建。',
  },
};

// Bookcase details
const BOOKCASES = {
  pandas_library: {
    id: 'pandas_library',
    name: '📖 Pandas 物理书架',
    coords: { x: 4, y: 5 },
    desc: '包含 Pandas 常用语法、清洗指令、Merge / Join 手册以及常见数据处理异常的解决方案。',
    quickQueries: ['DataFrame merge', 'fillna method', 'groupby aggregate', 'SettingWithCopyWarning'],
  },
  software_design_rules: {
    id: 'software_design_rules',
    name: '📚 软件设计原则书架',
    coords: { x: 10, y: 15 },
    desc: '包含 SOLID 原则、Clean Code 规范、面向对象设计、设计模式以及单元测试最佳实践。',
    quickQueries: ['SOLID principles', 'try-except exception handling', 'Dependency Injection', 'Clean Code naming'],
  },
};

export default function SpaceBoard() {
  const {
    playerCoords,
    ambientTheme,
    activeMission,
    unresolvedConflict,
    interactiveNpcId,
    collisionMatrix,
    syncFromBackend,
    movePlayer,
    triggerBookcaseSearch,
  } = useSpaceStore();

  const lastMoveTimeRef = useRef<number>(0);
  const [activeZone, setActiveZone] = useState<string>('Lobby');

  // Bookcase state
  const [selectedBookcase, setSelectedBookcase] = useState<typeof BOOKCASES.pandas_library | null>(null);
  const [bookcaseQuery, setBookcaseQuery] = useState('');
  const [ragResults, setRagResults] = useState<SpatialRagChunk[]>([]);
  const [isSearchingRag, setIsSearchingRag] = useState(false);

  // Chat state
  const [activeChatNpc, setActiveChatNpc] = useState<typeof NPC_INFO.mentor_ling | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'npc'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [isNpcStreaming, setIsNpcStreaming] = useState(false);

  // Meeting & Arbitration state
  const [isMeetingOpen, setIsMeetingOpen] = useState(false);
  const [meetingAmyText, setMeetingAmyText] = useState('');
  const [meetingLingText, setMeetingLingText] = useState('');
  const [meetingPlayerText, setMeetingPlayerText] = useState('');
  const [isMeetingStreaming, setIsMeetingStreaming] = useState(false);
  const [meetingFinished, setMeetingFinished] = useState(false);
  const [arbitrationResponse, setArbitrationResponse] = useState<any | null>(null);

  // Computed Proximity for Table
  const isAdjacentToTable =
    playerCoords.x >= 16 &&
    playerCoords.x <= 19 &&
    playerCoords.y >= 5 &&
    playerCoords.y <= 8 &&
    !(playerCoords.x >= 17 && playerCoords.x <= 18 && playerCoords.y >= 6 && playerCoords.y <= 7);

  // Sync state initially
  useEffect(() => {
    syncFromBackend();
  }, [syncFromBackend]);

  // Track active zone name
  useEffect(() => {
    const { x, y } = playerCoords;
    if (x <= 11) {
      setActiveZone(y <= 10 ? 'Lobby' : 'Dev Bay');
    } else {
      setActiveZone(y <= 12 ? 'Meeting Room' : 'Archive Room');
    }
  }, [playerCoords]);

  // Handle Keyboard Inputs
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ignore if user is writing in inputs
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // Check key-spam throttle: 50ms
      const now = Date.now();
      if (now - lastMoveTimeRef.current < 50) return;

      let dx = 0;
      let dy = 0;

      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          dy = -1;
          break;
        case 's':
        case 'arrowdown':
          dy = 1;
          break;
        case 'a':
        case 'arrowleft':
          dx = -1;
          break;
        case 'd':
        case 'arrowright':
          dx = 1;
          break;
        case ' ':
        case 'enter':
          e.preventDefault();
          // If adjacent to table, open meeting modal
          if (isAdjacentToTable) {
            startTeamMeetingModal();
            return;
          }
          // Interact with NPC if nearby
          if (interactiveNpcId) {
            const npc = NPC_INFO[interactiveNpcId as keyof typeof NPC_INFO];
            if (npc) {
              startConversation(npc);
            }
          }
          return;
        default:
          return; // Exit handler
      }

      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        lastMoveTimeRef.current = now;
        await movePlayer(dx, dy);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [movePlayer, interactiveNpcId, isAdjacentToTable]);

  const startTeamMeetingModal = async () => {
    setIsMeetingOpen(true);
    setMeetingAmyText('');
    setMeetingLingText('');
    setMeetingPlayerText('');
    setMeetingFinished(false);
    setArbitrationResponse(null);

    if (unresolvedConflict) {
      return;
    }

    setIsMeetingStreaming(true);
    try {
      const { streamTeamMeeting } = await import('@/services/apiClient');
      await streamTeamMeeting((chunk) => {
        if (chunk.speaker === 'pm_amy') {
          if (chunk.chunk) {
            setMeetingAmyText((prev) => prev + chunk.chunk);
          }
        } else if (chunk.speaker === 'mentor_ling') {
          if (chunk.chunk) {
            setMeetingLingText((prev) => prev + chunk.chunk);
          }
        } else if (chunk.status === 'finished') {
          setMeetingFinished(true);
        }
      });
    } catch (e) {
      console.warn('Meeting standup stream error, falling back.', e);
      setMeetingAmyText('大家早上好！本周运营部门逼得非常紧，我们必须把「优惠券核心中心」这一业务抓手快速闭环上线，跑出MVP数据！时间非常紧迫，大家打起精神，本周五务必发布！');
      setMeetingLingText('Amy，过度追求速度只会埋下无穷的技术债。不重构核心类、不编写完备的测试用例，强行发版只会酿成生产环境事故。质量才是一切的核心。');
      setMeetingFinished(true);
    } finally {
      setIsMeetingStreaming(false);
    }
  };

  const handleArbitrateChoice = async (choice: 'speed' | 'quality' | 'balance') => {
    if (!unresolvedConflict || isMeetingStreaming) return;
    setIsMeetingStreaming(true);
    try {
      const res = await api.arbitrateConflict(unresolvedConflict.conflict_id, choice);
      setArbitrationResponse(res);

      const playerTurn = res.dialogue_history.find((d: any) => d.speaker === 'player')?.text || '';
      const amyTurn = res.dialogue_history.find((d: any) => d.speaker === 'pm_amy' && d.text !== 'Hurry up!' && !d.text.includes('听说'))?.text || '';
      const lingTurn = res.dialogue_history.find((d: any) => d.speaker === 'mentor_ling' && !d.text.includes('急躁'))?.text || '';

      setMeetingPlayerText(playerTurn);
      
      // Amy Reaction typewriter
      let amyWritten = '';
      for (let i = 0; i < amyTurn.length; i++) {
        amyWritten += amyTurn[i];
        setMeetingAmyText(amyWritten);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      // Ling Reaction typewriter
      let lingWritten = '';
      for (let i = 0; i < lingTurn.length; i++) {
        lingWritten += lingTurn[i];
        setMeetingLingText(lingWritten);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      setMeetingFinished(true);
    } catch (e) {
      console.error('Failed to arbitrate conflict:', e);
    } finally {
      setIsMeetingStreaming(false);
    }
  };

  const handleCloseMeeting = () => {
    setIsMeetingOpen(false);
    syncFromBackend();
  };

  // Open Chat Dialogue
  const startConversation = (npc: typeof NPC_INFO.mentor_ling) => {
    setActiveChatNpc(npc);
    setChatMessages([
      { role: 'npc', content: npc.greeting }
    ]);
    setChatInput('');
  };

  // Close Chat
  const closeConversation = () => {
    setActiveChatNpc(null);
    setChatMessages([]);
  };

  // Send Chat message (streams response)
  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || !activeChatNpc || isNpcStreaming) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setIsNpcStreaming(true);

    // Append an empty NPC message that we'll stream into
    setChatMessages((prev) => [...prev, { role: 'npc', content: '' }]);

    try {
      await streamChat(
        activeChatNpc.roleName,
        userMsg,
        (chunk: string) => {
          setChatMessages((prev) => {
            const copy = [...prev];
            const lastIndex = copy.length - 1;
            if (lastIndex >= 0 && copy[lastIndex].role === 'npc') {
              copy[lastIndex].content += chunk;
            }
            return copy;
          });
        }
      );
    } catch (error) {
      console.warn('Feynman chat streaming encounter an error, falling back.', error);
      // Fallback response
      setChatMessages((prev) => {
        const copy = [...prev];
        const lastIndex = copy.length - 1;
        if (lastIndex >= 0 && copy[lastIndex].role === 'npc') {
          copy[lastIndex].content = '抱歉，我的神经元连接暂时不稳定，建议你检查本地网络或者稍后再试。你可以先去完成目前工位上的任务！';
        }
        return copy;
      });
    } finally {
      setIsNpcStreaming(false);
    }
  };

  // Execute RAG Query
  const handleRagSearch = async (queryText = bookcaseQuery) => {
    if (!queryText.trim() || !selectedBookcase || isSearchingRag) return;

    setBookcaseQuery(queryText);
    setIsSearchingRag(true);
    try {
      const response = await triggerBookcaseSearch(selectedBookcase.id, queryText);
      setRagResults(response.top_k_chunks || []);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearchingRag(false);
    }
  };

  // Click on map bookcase item
  const openBookcasePanel = (bookcase: typeof BOOKCASES.pandas_library) => {
    setSelectedBookcase(bookcase);
    setBookcaseQuery('');
    setRagResults([]);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start justify-center max-w-7xl mx-auto w-full px-2">
      {/* 2D Digital Twin Map View */}
      <div className="flex flex-col items-center">
        {/* HUD Area */}
        <div className="w-[816px] border-4 border-slate-700 bg-slate-900 p-4 mb-4 flex justify-between items-center relative overflow-hidden shadow-lg select-none">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-950/15 via-transparent to-purple-950/15 pointer-events-none" />
          <div className="flex items-center gap-3">
            <span className="text-xl">🕹️</span>
            <div>
              <div className="font-mono text-[10px] font-bold text-slate-400 tracking-wider">CURRENT LOCATION</div>
              <h3 className="font-bold text-slate-100 font-mono text-sm uppercase">
                {activeZone === 'Lobby' && ZONES.LOBBY.name}
                {activeZone === 'Dev Bay' && ZONES.DEV_BAY.name}
                {activeZone === 'Meeting Room' && ZONES.MEETING.name}
                {activeZone === 'Archive Room' && ZONES.ARCHIVE.name}
              </h3>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-4 font-mono text-xs">
            <div className="border border-slate-700 bg-slate-950 px-3 py-1.5 flex items-center gap-2">
              <span className="text-cyan-400">📍 COORDINATES</span>
              <span className="font-bold text-cyan-300">({playerCoords.x}, {playerCoords.y})</span>
            </div>
            {activeMission && (
              <div className="border border-indigo-800/40 bg-indigo-950/40 px-3 py-1.5 flex items-center gap-2 animate-pulse">
                <span className="text-indigo-400">🔥 QUEST:</span>
                <span className="font-bold text-indigo-300 max-w-[120px] truncate">{activeMission.title}</span>
              </div>
            )}
          </div>
        </div>

        {/* The Absolute 25x25 Render Grid */}
        <div className="relative w-[816px] h-[816px] border-8 border-slate-700 bg-slate-950 p-1 overflow-hidden shadow-2xl crt-screen select-none">
          
          {/* ================== RPG Split Floors (Exactly matching the image) ================== */}
          {/* Left half (x < 12): slate tiled floor */}
          <div className="absolute inset-y-0 left-0 w-[384px] pixel-slate-floor z-0 pointer-events-none" />
          {/* Right half (x >= 13): warm wood floorboards */}
          <div className="absolute inset-y-0 left-[416px] right-0 pixel-wood-floor z-0 pointer-events-none" />
          {/* Under vertical partition wall (x = 12): dark baseboard filler floor */}
          <div className="absolute inset-y-0 left-[384px] w-[32px] bg-[#492e1f] z-0 pointer-events-none" />

          {/* Subtle Grid cells layered on top of floors */}
          <div className="absolute inset-0 bg-pixel-grid opacity-10 pointer-events-none z-5" />

          {/* Patterned Rug under Conference Table from image */}
          <div className="absolute top-[160px] left-[512px] w-[128px] h-[128px] pixel-patterned-rug z-5 pointer-events-none" />

          {/* Cozy Green Retro Sofas matching the image */}
          {/* Lobby sofa */}
          <div className="absolute top-[64px] left-[64px] w-[64px] h-[32px] pixel-green-sofa z-10 pointer-events-none" />
          {/* Meeting room sofa (bottom-right area) */}
          <div className="absolute top-[512px] left-[672px] w-[64px] h-[32px] pixel-green-sofa z-10 pointer-events-none" />

          {/* Decorative Terracotta Potted Plants from the image */}
          <div className="absolute top-[32px] left-[32px] w-[32px] h-[32px] pixel-potted-plant z-10 pointer-events-none" />
          <div className="absolute top-[32px] left-[736px] w-[32px] h-[32px] pixel-potted-plant z-10 pointer-events-none" />

          {/* Cardboard Boxes matching the top-left boxes stack in image */}
          <div className="absolute top-[224px] left-[32px] w-[48px] h-[48px] pixel-boxes z-10 pointer-events-none" />

          {/* Mechanical Toolboxes & Drills from left floor of image */}
          <div className="absolute top-[288px] left-[32px] w-[32px] h-[32px] pixel-toolboxes z-10 pointer-events-none" />

          {/* Lobby Reception desks styled as high-fidelity pixel reception */}
          <div className="absolute top-[96px] left-[96px] w-[160px] h-[32px] pixel-reception-desk flex items-center justify-center font-bold text-[10px] text-amber-200 z-10">
            💼 接听前台
          </div>

          {/* Dev Bay Desks styled as premium oak work desks */}
          <div className="absolute top-[448px] left-[64px] w-[224px] h-[32px] pixel-dev-desk flex items-center justify-center font-bold text-[10px] text-slate-100 z-10">
            💻 研发工位 A (Lead Dev)
          </div>
          <div className="absolute top-[576px] left-[64px] w-[224px] h-[32px] pixel-dev-desk flex items-center justify-center font-bold text-[10px] text-slate-100 z-10">
            💻 研发工位 B (Data Eng)
          </div>

          {/* Divider Walls */}
          {/* Vertical wood panel wall divider x=12 -> exactly separates left grey tiles and right wood floors */}
          {Array.from({ length: 25 }).map((_, y) => {
            if (y !== 5 && y !== 16) {
              return (
                <div
                  key={`v-wall-${y}`}
                  className="absolute w-[32px] h-[32px] pixel-wood-wall z-10"
                  style={{ transform: `translate3d(${12 * 32}px, ${y * 32}px, 0)` }}
                />
              );
            }
            return null;
          })}

          {/* Horizontal left slate divider y=10 (Lobby/Dev) */}
          {Array.from({ length: 12 }).map((_, x) => {
            if (x !== 4) {
              return (
                <div
                  key={`h-left-wall-${x}`}
                  className="absolute w-[32px] h-[32px] pixel-slate-wall z-10"
                  style={{ transform: `translate3d(${x * 32}px, ${10 * 32}px, 0)` }}
                />
              );
            }
            return null;
          })}

          {/* Horizontal right wood panel divider y=12 (Meeting/Archive) */}
          {Array.from({ length: 12 }).map((_, i) => {
            const x = i + 13;
            if (x !== 18) {
              return (
                <div
                  key={`h-right-wall-${x}`}
                  className="absolute w-[32px] h-[32px] pixel-wood-wall z-10"
                  style={{ transform: `translate3d(${x * 32}px, ${12 * 32}px, 0)` }}
                />
              );
            }
            return null;
          })}

          {/* RAG Bookcases styled as wooden multi-tiered bookshelf */}
          {Object.values(BOOKCASES).map((bookcase) => (
            <div
              key={bookcase.id}
              onClick={() => openBookcasePanel(bookcase)}
              className="absolute w-[32px] h-[32px] pixel-bookshelf hover:scale-110 active:scale-95 transition-all duration-100 flex items-center justify-center text-sm cursor-pointer z-20 group"
              style={{ transform: `translate3d(${bookcase.coords.x * 32}px, ${bookcase.coords.y * 32}px, 0)` }}
              title="点击查阅该物理书架 (RAG)"
            >
              <div className="absolute bottom-8 scale-0 group-hover:scale-100 transition-all bg-slate-900/90 border border-emerald-500 text-[10px] text-emerald-300 font-mono py-1 px-2 whitespace-nowrap rounded shadow-lg pointer-events-none z-30">
                {bookcase.name}
              </div>
            </div>
          ))}

          {/* Conference Table in Meeting Room (y = 6 to 7, x = 17 to 18) styled as wood-grain conference table with potted plant */}
          <div
            onClick={startTeamMeetingModal}
            className={`absolute top-[192px] left-[544px] w-[64px] h-[64px] pixel-meeting-table rounded flex flex-col items-center justify-center font-bold text-[10px] text-amber-100 z-15 select-none transition-all duration-500 border-4 cursor-pointer hover:scale-105 active:scale-95 ${
              unresolvedConflict
                ? 'border-yellow-400 shadow-[0_0_25px_rgba(234,179,8,0.7)] animate-pulse'
                : 'border-[#513123] hover:border-[#cf8754]'
            }`}
          >
            <span className="text-lg">{unresolvedConflict ? '⚠️' : '🪴'}</span>
            <span className="text-[8px] font-mono tracking-wide uppercase">会议桌</span>
          </div>

          {/* Table Proximity HUD Tip overlay */}
          {isAdjacentToTable && (
            <div className="absolute top-[144px] left-[512px] flex flex-col items-center animate-bounce z-30 pointer-events-none">
              <div className="bg-slate-900/95 border-2 border-yellow-500 text-[9px] font-bold text-yellow-300 font-mono py-1 px-1.5 rounded whitespace-nowrap shadow-md">
                {unresolvedConflict ? '👉 按 [Enter] 解决团队冲突' : '👉 按 [Enter] 发起每日晨会'}
              </div>
              <div className="w-1.5 h-1.5 bg-yellow-500 rotate-45 -mt-1 border-r border-b border-yellow-500" />
            </div>
          )}

          {/* Spawn NPCs on map */}
          {Object.values(NPC_INFO).map((npc) => {
            const coords = npc.id === 'mentor_ling' ? { x: 15, y: 6 } : npc.id === 'pm_amy' ? { x: 18, y: 5 } : { x: 20, y: 20 };
            const isTargetNear = interactiveNpcId === npc.id;
            return (
              <div
                key={npc.id}
                onClick={() => startConversation(npc)}
                className={`absolute w-[32px] h-[32px] flex items-center justify-center text-xl cursor-pointer z-20 select-none group`}
                style={{ transform: `translate3d(${coords.x * 32}px, ${coords.y * 32}px, 0)` }}
              >
                {/* Adjacent Speech Indicator bubble */}
                {isTargetNear && (
                  <div className="absolute bottom-8 flex flex-col items-center animate-bounce z-30">
                    <div className="bg-slate-900/95 border-2 border-amber-500 text-[9px] font-bold text-amber-300 font-mono py-1 px-1.5 rounded whitespace-nowrap shadow-md">
                      [Space] 对话
                    </div>
                    <div className="w-1.5 h-1.5 bg-amber-500 rotate-45 -mt-1 border-r border-b border-amber-500" />
                  </div>
                )}

                {/* Pulsing ring around NPC */}
                <div className={`absolute inset-0 w-8 h-8 rounded-full border border-dashed animate-spin ${isTargetNear ? 'border-amber-500 opacity-60' : 'border-slate-700 opacity-35'}`} />
                
                {/* Character avatar */}
                <span className="relative z-10 text-2xl filter drop-shadow-md group-hover:scale-110 transition-transform">{npc.emoji}</span>

                {/* Subtitle Indicator */}
                <div className="absolute top-8 scale-0 group-hover:scale-100 transition-all bg-slate-900/90 border border-slate-700 text-[9px] text-slate-300 py-0.5 px-2 rounded whitespace-nowrap pointer-events-none">
                  {npc.name}
                </div>
              </div>
            );
          })}

          {/* The Player Avatar with Custom CSS Pixel Art Character matching the image */}
          <div
            className="absolute w-[32px] h-[32px] flex items-center justify-center z-30 transition-all duration-100 select-none pointer-events-none"
            style={{ transform: `translate3d(${playerCoords.x * 32}px, ${playerCoords.y * 32}px, 0)` }}
          >
            {/* Glowing neon shadow ring underneath */}
            <div className="absolute w-8 h-8 rounded-full bg-cyan-500/20 blur-xs scale-110 animate-ping" />
            <div className="absolute w-8 h-8 rounded-full border-2 border-cyan-400/40 scale-100" />

            {/* Cute mini coordinate tag on top */}
            <div className="absolute -top-6 bg-cyan-950/90 border border-cyan-500/60 text-[8px] text-cyan-300 py-0.5 px-1.5 font-mono rounded select-none opacity-0 hover:opacity-100 transition-opacity whitespace-nowrap">
              YOU ({playerCoords.x},{playerCoords.y})
            </div>

            {/* Retro CSS Pixel Character Sprite matching the image! */}
            <div className="pixel-char-sprite">
              <div className="pixel-char-hair" />
              <div className="pixel-char-face" />
              <div className="pixel-char-body" />
            </div>
          </div>

          {/* ================== Ambient Overlays (Breathing Colors) ================== */}
          {/* Quiet Blue breathing Theme */}
          {ambientTheme === 'quiet-blue' && (
            <div className="absolute inset-0 bg-blue-950/20 mix-blend-color-dodge backdrop-brightness-95 pointer-events-none z-10 transition-all duration-1000 animate-pulse border-8 border-cyan-950/40">
              <div className="absolute inset-0 bg-radial-at-t from-cyan-900/10 via-transparent to-transparent" />
            </div>
          )}

          {/* Alert Red Warning pulsing Theme */}
          {ambientTheme === 'alert-red' && (
            <div className="absolute inset-0 bg-red-950/25 mix-blend-color-burn pointer-events-none z-10 transition-all duration-300 border-8 border-red-900/40 shadow-[inset_0_0_50px_rgba(239,68,68,0.2)]">
              <div className="absolute inset-0 bg-radial-at-center from-red-600/10 via-transparent to-transparent" />
              {/* Overlay Alert text */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-950 border-2 border-red-500 text-red-500 font-mono text-[10px] py-1 px-3 rounded flex items-center gap-1.5 font-bold animate-pulse">
                <span>⚠️ SYSTEM CRITICAL SHIELD BREACHED</span>
              </div>
            </div>
          )}

          {/* Celebrate Gold twinkling Theme */}
          {ambientTheme === 'celebrate-gold' && (
            <div className="absolute inset-0 bg-amber-500/5 pointer-events-none z-10 transition-all duration-1000 border-8 border-amber-600/20">
              <div className="absolute inset-0 bg-radial-at-b from-amber-500/15 via-transparent to-transparent" />
              {/* Twinkling particle stars simulated */}
              <div className="absolute bottom-12 left-1/4 text-amber-300 text-xs animate-bounce opacity-80">✨</div>
              <div className="absolute bottom-36 right-1/3 text-amber-300 text-xs animate-pulse opacity-60">✨</div>
              <div className="absolute bottom-24 right-12 text-amber-300 text-sm animate-bounce opacity-70">🌟</div>
              <div className="absolute bottom-48 left-12 text-amber-300 text-sm animate-pulse opacity-55">✨</div>
            </div>
          )}
          
        </div>

        {/* Floating Instruction HUD for controls */}
        <div className="w-[816px] mt-3 flex justify-between text-[11px] font-mono text-slate-400 select-none">
          <p>🎮 键盘控键: <span className="text-slate-200 border border-slate-700 bg-slate-900 px-1 py-0.5 rounded font-bold">W / A / S / D</span> 或 <span className="text-slate-200 border border-slate-700 bg-slate-900 px-1 py-0.5 rounded font-bold">↑ / ↓ / ← / →</span> 走动</p>
          <p>💡 靠近 NPC 时点击或按 <span className="text-amber-400 border border-slate-700 bg-slate-900 px-1 py-0.5 rounded font-bold">空格键</span> 对话 | 点击书架检索知识库</p>
        </div>

        {/* bottom-aligned classic RPG Dialogue Box overlay */}
        {activeChatNpc && (
          <div className="w-[816px] border-4 border-amber-600 bg-slate-950 p-4 mt-4 relative shadow-2xl z-40 animate-slide-in-up">
            <div className="absolute top-2 right-4 text-slate-500 hover:text-slate-300 text-xs font-mono cursor-pointer" onClick={closeConversation}>
              [关闭 ESC]
            </div>

            <div className="flex gap-4">
              {/* Portrait container */}
              <div className="w-16 h-16 border-2 border-amber-500 bg-slate-900 flex items-center justify-center text-4xl shrink-0 select-none shadow-md">
                {activeChatNpc.emoji}
              </div>

              {/* Dialogue Content */}
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs font-bold text-amber-400 mb-1">{activeChatNpc.name}</div>
                
                {/* Messages history view */}
                <div className="max-h-[160px] overflow-y-auto space-y-3 mb-4 pr-1 font-mono text-xs leading-6 text-slate-200">
                  {chatMessages.map((msg, index) => (
                    <div key={index} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`p-2 border max-w-[85%] ${msg.role === 'user' ? 'border-amber-700 bg-amber-950/20 text-slate-300' : 'border-slate-800 bg-slate-900/60'}`}>
                        {msg.role === 'user' ? '你: ' : ''}{msg.content || <span className="animate-pulse">正在输入...</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input form */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isNpcStreaming) {
                        handleSendChatMessage();
                      }
                    }}
                    placeholder={`和 ${activeChatNpc.roleName} 交流你关于任务的疑惑...`}
                    className="flex-1 pixel-input text-xs"
                    disabled={isNpcStreaming}
                  />
                  <PixelButton
                    variant="primary"
                    className="py-1 px-4 text-xs"
                    onClick={handleSendChatMessage}
                    disabled={isNpcStreaming || !chatInput.trim()}
                  >
                    {isNpcStreaming ? '思考中' : '发送'}
                  </PixelButton>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================== RAG Glassmorphic Bookshelf Sidebar panel ================== */}
      {selectedBookcase ? (
        <div className="w-full lg:w-[400px] border-4 border-emerald-600 bg-slate-900/90 backdrop-blur-md p-5 shadow-2xl relative select-none animate-slide-in-up self-stretch">
          <div className="absolute top-2 right-4 text-slate-500 hover:text-slate-300 text-xs font-mono cursor-pointer" onClick={() => setSelectedBookcase(null)}>
            [关闭 ×]
          </div>

          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🏛️</span>
            <h3 className="font-bold font-mono text-emerald-300 text-sm uppercase">{selectedBookcase.name}</h3>
          </div>

          <p className="text-xs text-slate-400 font-mono leading-5 mb-4 border-b border-emerald-950 pb-3">
            {selectedBookcase.desc}
          </p>

          {/* Quick searches tag list */}
          <div className="mb-4">
            <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">💡 快捷检索关键词</h4>
            <div className="flex flex-wrap gap-1.5">
              {selectedBookcase.quickQueries.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleRagSearch(tag)}
                  className="text-[10px] font-mono bg-emerald-950/40 border border-emerald-900/60 hover:border-emerald-500 text-emerald-400 px-2 py-1 select-none active:scale-95 transition-all"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Search bar input */}
          <div className="space-y-3 mb-5">
            <div className="flex gap-2">
              <input
                type="text"
                value={bookcaseQuery}
                onChange={(e) => setBookcaseQuery(e.target.value)}
                placeholder="输入语义检索问题..."
                className="flex-1 pixel-input text-xs border-emerald-900 focus:border-emerald-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRagSearch();
                }}
              />
              <PixelButton
                variant="primary"
                className="py-1 px-4 text-xs bg-emerald-600 text-slate-950 border-emerald-500"
                onClick={() => handleRagSearch()}
                disabled={isSearchingRag || !bookcaseQuery.trim()}
              >
                {isSearchingRag ? '搜索中' : '检索'}
              </PixelButton>
            </div>
          </div>

          {/* Search results chunks */}
          <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
            <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider border-b border-slate-800 pb-1.5 flex justify-between items-center">
              <span>📚 检索结果 ({ragResults.length})</span>
              {isSearchingRag && <span className="text-emerald-400 animate-pulse">CHROMA 检索中...</span>}
            </h4>

            {ragResults.length === 0 ? (
              <div className="border border-dashed border-slate-800 p-8 text-center text-slate-500 font-mono text-xs">
                {isSearchingRag ? 'ChromaDB 向量数据库运算中...' : '暂无检索结果，请尝试点击上方“快捷检索关键词”或输入语法问题查询。'}
              </div>
            ) : (
              ragResults.map((result, idx) => (
                <div key={idx} className="border border-emerald-900/50 bg-slate-950/60 p-3 shadow-inner relative group">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="font-mono text-[10px] font-bold text-emerald-400 truncate max-w-[200px]" title={result.doc_title}>
                      📄 {result.doc_title.split('/').pop()}
                    </span>
                    <PixelBadge variant="success" className="text-[9px] bg-emerald-950 border-emerald-800 text-emerald-400">
                      匹配度: {(result.similarity_score * 100).toFixed(1)}%
                    </PixelBadge>
                  </div>
                  
                  <p className="text-[11px] font-mono text-slate-300 leading-5 whitespace-pre-wrap select-text">
                    {result.content_excerpt}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Tutorial Card on the right of the board when no bookcase is selected */
        <PixelCard className="w-full lg:w-[400px] border-slate-700 bg-slate-900/60 self-stretch flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <span className="font-mono text-[10px] font-bold text-amber-500">OFFICECRAFT WORKPLACE</span>
              <h3 className="pixel-title text-base font-bold text-slate-200 mt-1">2D 数字孪生办公室</h3>
            </div>
            
            <p className="font-mono text-xs leading-6 text-slate-400">
              欢迎来到 OfficeCraft AI 的沉浸式空间孪生大厅！我们已将传统的控制台重构为可供操控的角色和 NPC 走动的 RPG 环境。
            </p>

            <div className="border border-slate-800 bg-slate-950 p-3 space-y-2">
              <h4 className="font-mono text-[10px] font-bold text-slate-300">🏢 地图区域规划 (Digital Twin):</h4>
              <ul className="font-mono text-[10px] text-slate-400 space-y-1.5 list-disc pl-4">
                <li><span className="text-amber-300 font-bold">大厅接待区 (Lobby)</span>: 提供玩家初始状态。</li>
                <li><span className="text-blue-300 font-bold">技术开发区 (Dev Bay)</span>: 包含技术主管工位及代码平台。</li>
                <li><span className="text-indigo-300 font-bold">会议讨论区 (Meeting Room)</span>: 产品主管及重大业务规划领任务点。</li>
                <li><span className="text-emerald-300 font-bold">物理资料库 (Archive Room)</span>: 放置 Pandas 等物理书架 RAG。</li>
              </ul>
            </div>

            <div className="border border-amber-900/30 bg-amber-950/10 p-3 space-y-1">
              <h4 className="font-mono text-[10px] font-bold text-amber-300">💡 空间光效联动 (Prompt-to-Light):</h4>
              <p className="font-mono text-[10px] leading-5 text-slate-400">
                当你领取主管任务后，办公室会自动进入工作状态的 <span className="text-cyan-400 font-bold">“幽蓝微光” (Quiet-Blue Theme)</span>。如果代码任务提交失败或出现异常，技术主管工位将触发闪烁的 <span className="text-red-400 font-bold">“红色预警” (Alert-Red Theme)</span>。任务圆满完成后将转入 <span className="text-amber-400 font-bold">“金色庆典” (Celebrate-Gold Theme)</span>。
              </p>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4 mt-4 flex flex-col gap-2">
            <PixelButton
              variant="secondary"
              fullWidth
              className="py-2 text-xs"
              onClick={() => openBookcasePanel(BOOKCASES.pandas_library)}
            >
              📖 查阅 Pandas 物理书架
            </PixelButton>
            <PixelButton
              variant="secondary"
              fullWidth
              className="py-2 text-xs"
              onClick={() => openBookcasePanel(BOOKCASES.software_design_rules)}
            >
              📚 查阅软件开发规范
            </PixelButton>
          </div>
        </PixelCard>
      )}

      {/* ================== Multi-Agent SSE Meeting & Conflict Arbitration Modal ================== */}
      {isMeetingOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4 font-mono select-none">
          <div className="w-full max-w-4xl bg-slate-900 border-4 border-indigo-500 shadow-2xl p-6 relative flex flex-col gap-6 animate-slide-in-up rounded-lg">
            
            {/* Header */}
            <div className="border-b-4 border-indigo-950 pb-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{unresolvedConflict ? '⚡' : '🤝'}</span>
                <div>
                  <span className="text-[10px] font-bold text-indigo-400 tracking-wider">
                    {unresolvedConflict ? 'TEAM CONFLICT RESOLUTION' : 'DAILY STANDUP SESSION'}
                  </span>
                  <h3 className="pixel-title text-base font-bold text-slate-100">
                    {unresolvedConflict ? '团队决策斡旋与冲突仲裁' : '多智能体每日立会/晨会'}
                  </h3>
                </div>
              </div>
              {!isMeetingStreaming && (
                <button
                  onClick={handleCloseMeeting}
                  className="text-slate-500 hover:text-slate-200 text-xs border border-slate-700 bg-slate-950 px-2 py-1 hover:border-slate-400 transition-colors"
                >
                  [关闭 ESC]
                </button>
              )}
            </div>

            {/* Main Double-Column Dialogue Stream */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[220px]">
              
              {/* Product Manager Amy Column */}
              <div className="border-2 border-amber-800/60 bg-amber-950/10 p-4 flex flex-col gap-3 relative rounded shadow-md">
                <div className="absolute top-2 right-4 text-[9px] text-amber-500 font-bold bg-amber-950 px-1.5 py-0.5 rounded border border-amber-900">
                  PRODUCT MANAGER
                </div>
                <div className="flex items-center gap-3 border-b border-amber-900/40 pb-2">
                  <div className="w-12 h-12 rounded bg-amber-900/30 border-2 border-amber-500 flex items-center justify-center text-3xl select-none shadow animate-pulse">
                    👩‍💼
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-amber-400">PM Amy (艾米)</h4>
                    <span className="text-[9px] text-slate-400">口头禅: 闭环, 赋能, 快速发版</span>
                  </div>
                </div>
                <p className="text-xs leading-6 text-amber-100/95 whitespace-pre-wrap min-h-[100px] font-mono p-1">
                  {meetingAmyText || (isMeetingStreaming && !meetingLingText ? <span className="text-amber-500/80 animate-pulse">发言准备中...</span> : <span className="text-slate-500 italic">静默聆听中...</span>)}
                </p>
              </div>

              {/* Tech Lead Gao Ling Column */}
              <div className="border-2 border-purple-800/60 bg-purple-950/10 p-4 flex flex-col gap-3 relative rounded shadow-md">
                <div className="absolute top-2 right-4 text-[9px] text-purple-500 font-bold bg-purple-950 px-1.5 py-0.5 rounded border border-purple-900">
                  TECH LEAD
                </div>
                <div className="flex items-center gap-3 border-b border-purple-900/40 pb-2">
                  <div className="w-12 h-12 rounded bg-purple-900/30 border-2 border-purple-500 flex items-center justify-center text-3xl select-none shadow">
                    👩‍💻
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-purple-400">高凌 (Gao Ling)</h4>
                    <span className="text-[9px] text-slate-400">口头禅: SOLID, 单元测试, 架构规范</span>
                  </div>
                </div>
                <p className="text-xs leading-6 text-purple-100/95 whitespace-pre-wrap min-h-[100px] font-mono p-1">
                  {meetingLingText || (isMeetingStreaming && meetingAmyText ? <span className="text-purple-500/80 animate-pulse">思考技术反馈中...</span> : <span className="text-slate-500 italic">静默聆听中...</span>)}
                </p>
              </div>

            </div>

            {/* Arbitration Choice Buttons or Meeting Summary / Feedback Banner */}
            {unresolvedConflict && !arbitrationResponse && (
              <div className="border-2 border-yellow-800/40 bg-slate-950 p-4 rounded flex flex-col gap-4 shadow-inner">
                <div className="border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-bold text-yellow-400">⚖️ 冲突斡旋：PM 与 技术主管陷入分歧</h4>
                  <p className="text-[10px] text-slate-400 mt-1 leading-4">
                    {unresolvedConflict.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  
                  {/* Option 1: Speed */}
                  <button
                    onClick={() => handleArbitrateChoice('speed')}
                    disabled={isMeetingStreaming}
                    className="flex flex-col gap-1.5 p-3 border-2 border-amber-900/60 bg-amber-950/20 hover:border-amber-500 active:scale-95 transition-all text-left group rounded"
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="text-xs font-bold text-amber-400 group-hover:text-amber-300">🚀 速度优先 (Speed)</span>
                      <PixelBadge variant="warning" className="text-[8px] bg-amber-950 text-amber-400 border-amber-900">
                        +40 XP
                      </PixelBadge>
                    </div>
                    <span className="text-[9px] text-slate-400 leading-4">PM 赞赏。牺牲技术债快速闭环发版，可能存在代码缺陷风险。</span>
                  </button>

                  {/* Option 2: Quality */}
                  <button
                    onClick={() => handleArbitrateChoice('quality')}
                    disabled={isMeetingStreaming}
                    className="flex flex-col gap-1.5 p-3 border-2 border-purple-900/60 bg-purple-950/20 hover:border-purple-500 active:scale-95 transition-all text-left group rounded"
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="text-xs font-bold text-purple-400 group-hover:text-purple-300">🛡️ 质量优先 (Quality)</span>
                      <PixelBadge variant="success" className="text-[8px] bg-purple-950 text-purple-400 border-purple-900">
                        +60 XP
                      </PixelBadge>
                    </div>
                    <span className="text-[9px] text-slate-400 leading-4">技术主管力挺。先补齐单元测试、精细化重构代码，延期发布。</span>
                  </button>

                  {/* Option 3: Balance */}
                  <button
                    onClick={() => handleArbitrateChoice('balance')}
                    disabled={isMeetingStreaming}
                    className="flex flex-col gap-1.5 p-3 border-2 border-indigo-900/60 bg-indigo-950/20 hover:border-indigo-500 active:scale-95 transition-all text-left group rounded"
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="text-xs font-bold text-indigo-400 group-hover:text-indigo-300">⚖️ 渐进妥协 (Balance)</span>
                      <PixelBadge variant="primary" className="text-[8px] bg-indigo-950 text-indigo-400 border-indigo-900">
                        +50 XP
                      </PixelBadge>
                    </div>
                    <span className="text-[9px] text-slate-400 leading-4">折中方案。核心主流程跑通测试发布，非核心子模块灰度重构。</span>
                  </button>

                </div>
              </div>
            )}

            {/* Resolution/Arbitration Success details card */}
            {arbitrationResponse && (
              <div className="border-2 border-emerald-800/40 bg-emerald-950/5 p-4 rounded flex flex-col gap-2 relative shadow-inner animate-fade-in">
                <div className="absolute top-2 right-4 flex items-center gap-1.5">
                  <span className="text-xs">🏆</span>
                  <span className="text-xs font-bold text-emerald-400">+{arbitrationResponse.xp_gained} XP</span>
                </div>
                <h4 className="text-xs font-bold text-emerald-400">🎉 冲突斡旋决断已达成！</h4>
                <p className="text-[10px] text-slate-300 leading-5">
                  {arbitrationResponse.feedback}
                </p>
                {meetingPlayerText && (
                  <div className="mt-2 p-2 border border-slate-800 bg-slate-950 text-[10px] text-slate-400 font-mono italic rounded">
                    你的最终决策: &ldquo;{meetingPlayerText}&rdquo;
                  </div>
                )}
              </div>
            )}

            {/* Standup Completed status */}
            {!unresolvedConflict && meetingFinished && (
              <div className="border-2 border-indigo-800/40 bg-indigo-950/10 p-4 rounded flex flex-col gap-1 shadow-inner animate-fade-in">
                <h4 className="text-xs font-bold text-indigo-300">📈 每日晨会分享总结结束！</h4>
                <p className="text-[10px] text-slate-400 leading-5">
                  PM Amy 同技术主管高凌已经就今日迭代和底层技术重构策略取得了基本的对齐一致。加油，快回工位处理任务吧！
                </p>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex justify-end border-t border-slate-800 pt-4 mt-2">
              {isMeetingStreaming ? (
                <div className="flex items-center gap-2 text-xs text-indigo-400 font-mono">
                  <span className="animate-spin text-sm">⏳</span>
                  <span>智能体实时辩论对话生成中...</span>
                </div>
              ) : (
                <PixelButton
                  variant="primary"
                  className="py-1.5 px-6 text-xs bg-indigo-600 border-indigo-500 hover:bg-indigo-500 text-slate-950"
                  onClick={handleCloseMeeting}
                >
                  {unresolvedConflict ? '退出斡旋仲裁' : '确认并关闭晨会'}
                </PixelButton>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
