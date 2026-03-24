
import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { GameState, BuzzRecord, Language } from '../types';
import { translations } from '../translations';


interface Props {
  socket: Socket;
  gameState: GameState;
  targetId?: string;               // ← add this line
  buzzes: BuzzRecord[];
  initialName: string;
  initialDisabled: boolean;
  language: Language;
  isConnected: boolean;
}

const PlayerPanel: React.FC<Props> = ({ socket, gameState,   targetId,  buzzes, initialName, initialDisabled, language, isConnected }) => {
  const [result, setResult] = useState<{ rank: number; offset: number } | null>(null);
  const [isBuzzed, setIsBuzzed] = useState(false);
  const [isDisabled, setIsDisabled] = useState(initialDisabled);
  const [name, setName] = useState(initialName);
  // const isArmed = (gameState as any) === 'ACTIVE' || (gameState as any) === 'BATTLE' || (gameState as any)?.state === 'ACTIVE' || (gameState as any)?.state === 'BATTLE';
  // --- FULLSCREEN LOGIC START ---
  const [isFullScreen, setIsFullScreen] = useState(false);

  // This updates the icon if the user exits fullscreen using the ESC key
  useEffect(() => {
    const handler = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };
  // --- FULLSCREEN LOGIC END ---

  const t = translations[language];

  useEffect(() => {
    socket.on('buzzResult', (res) => {
      setResult(res);
      if (res.rank === 1 && 'vibrate' in navigator) {
        navigator.vibrate([300, 100, 300, 100, 500]);
      } else if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    });

    socket.on('profileUpdate', (data) => setName(data.name));
    socket.on('statusUpdate', (data) => setIsDisabled(data.disabled));
    socket.on('kicked', () => window.location.reload());

    return () => {
      socket.off('buzzResult');
      socket.off('profileUpdate');
      socket.off('statusUpdate');
      socket.off('kicked');
    };
  }, [socket]);

  // Sync name/disabled state from server if it changes (e.g. host edits name or unpauses)
  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  // useEffect(() => {
  //   setIsDisabled(initialDisabled);
  // }, [initialDisabled]);

  useEffect(() => {
    if (gameState === 'IDLE') {
      setIsBuzzed(false);
      setResult(null);
    }
  }, [gameState]);

  useEffect(() => {
    console.log("🧩 PlayerPanel gameState prop:", gameState);
    console.log("🧩 Extracted targetId:", (gameState as any)?.targetId);
    console.log("🧩 My name:", name);
  }, [gameState, name]);

  const handleBuzz = () => {
    // Strictly prevent buzzing if paused, already buzzed, or system not armed
    // if (isDisabled || isBuzzed || (gameState !== 'ACTIVE' && gameState !== 'WINDOW_OPEN')) return;
    if (!isArmed) return;
    setIsBuzzed(true);
    socket.emit('buzz');
  };

  const isWinner = result?.rank === 1;

  // 1. ADD THIS LINE: It cleans the data so the next line works
  const currentStatus = (gameState as any)?.state || gameState;

  // 2. REPLACE YOUR OLD isArmed WITH THIS:
  const isTarget = !targetId || targetId === name;
  const isArmed = !isDisabled && !isBuzzed && (
    gameState === 'ACTIVE' ||
    gameState === 'BATTLE' ||
    gameState === 'WINDOW_OPEN'
  ) && isTarget;
  // const actualGameState = isDisabled ? 'PAUSED' : (gameState as any)?.state || gameState;
  // const isArmed = !isDisabled && !isBuzzed && (
  //   actualGameState === 'ACTIVE' ||
  //   actualGameState === 'BATTLE' ||
  //   actualGameState === 'WINDOW_OPEN'
  // );
  // const isArmed = (currentStatus === 'ACTIVE' || currentStatus === 'BATTLE' || currentStatus === 'WINDOW_OPEN') && !isBuzzed && !isDisabled;
  const getButtonText = () => {
    if (isDisabled) return t.P_OFF;
    if (isWinner) return t.P_BUZZ; // or keep as "BUZZ"
    if (isArmed) return t.P_PRESS_ME; // "PRESS ME" when Red
    return t.P_BUZZ; // "BUZZ" (grayed out) when awaiting start
  };

  return (
    <div className={`h-screen flex flex-col p-8 items-center justify-between transition-all duration-700 overflow-hidden relative ${isWinner ? 'bg-yellow-600' : isDisabled ? 'bg-slate-900 opacity-80' : 'bg-slate-950'
      }`}>
      {/* Full Screen Toggle Button */}
      <button
        onClick={toggleFullScreen}
        className="absolute top-4 right-4 z-50 p-3 bg-slate-800/40 hover:bg-slate-700/60 rounded-xl text-slate-400 hover:text-white border border-slate-700/50 backdrop-blur-md transition-all active:scale-95 shadow-lg"
      >
        {isFullScreen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 9L4 4m0 0l5-1m-5 1l1 5M15 9l5-5m0 0l-5-1m5 1l-1 5M9 15l-5 5m0 0l5 1m-5-1l1-5M15 15l5 5m0 0l-5 1m5-1l-1-5" /></svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
        )}
      </button>

      {/* Top Status HUD */}
      <div className="w-full space-y-4">
        <div className={`w-full p-4 rounded-3xl border-2 text-center font-black uppercase tracking-tighter shadow-2xl transition-all duration-500 ${isWinner ? 'bg-white border-white text-yellow-700' :
          isDisabled ? 'bg-red-900/20 border-red-500 text-red-500' :
            isArmed ? 'bg-red-600 border-red-400 text-white animate-pulse' :
              'bg-slate-800 border-slate-700 text-slate-500'
          }`}>
          {isWinner ? `★ ${t.P_FIRST} ★` : isDisabled ? t.P_PAUSED : isArmed ? t.P_READY : t.P_STANDBY}
        </div>
        <div className="text-center">
          <h2 className={`text-[9px] font-black tracking-[0.4em] mb-1 ${isWinner ? 'text-yellow-200' : 'text-slate-600'}`}>{t.P_PROTOCOL}</h2>
          <p className={`text-4xl font-black italic tracking-tighter ${isWinner ? 'text-white' : 'text-slate-100'}`}>
            {name || t.PLAYER_LABEL}
          </p>
        </div>
      </div>

      {/* Central Hardware Buzzer */}
      <div className="flex-1 flex items-center justify-center w-full relative">
        {isArmed && (
          <div className="absolute w-80 h-80 rounded-full border-4 border-red-500/40 animate-ping"></div>
        )}

        <button
          onClick={handleBuzz}
          // disabled={isDisabled || isBuzzed || (gameState !== 'ACTIVE' && gameState !== 'WINDOW_OPEN')}
          disabled={!isArmed}
          className={`no-select relative w-72 h-72 rounded-full border-[12px] flex flex-col items-center justify-center transition-all duration-300 shadow-2xl active:scale-90 ${isWinner ? 'bg-white border-yellow-400 text-yellow-600' :
            isDisabled ? 'bg-slate-800 border-slate-700 opacity-30 grayscale' :
              isBuzzed ? 'bg-slate-800 border-slate-700 opacity-50' :
                isArmed ? 'bg-red-600 border-red-400 text-white shadow-[0_0_80px_rgba(220,38,38,0.5)]' :
                  'bg-slate-900 border-slate-800 text-slate-700 shadow-inner'
            }`}
        >
          <span className="text-6xl font-black italic tracking-tighter uppercase">
            {isDisabled ? t.P_OFF : t.P_BUZZ}
          </span>
          <div className={`mt-4 w-16 h-2 rounded-full ${isWinner ? 'bg-yellow-600' : (isBuzzed || isDisabled) ? 'hidden' : 'bg-white/30 animate-pulse'}`}></div>
        </button>
      </div>

      {/* Result Metrics / Arena Status */}
      <div className="w-full">
        <div className={`p-8 rounded-[2.5rem] border-2 shadow-2xl text-center transition-all duration-500 ${isWinner ? 'bg-yellow-700/30 border-yellow-400/30' : 'bg-slate-900 border-slate-800'
          }`}>
          <p className={`text-[9px] font-black uppercase mb-4 tracking-[0.5em] ${isWinner ? 'text-yellow-300' : 'text-slate-600'}`}>
            {t.P_STATUS}
          </p>
          <p className={`text-3xl font-black tracking-tighter ${isWinner ? 'text-white' : result ? 'text-blue-400' : isDisabled ? 'text-red-500' : isArmed ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}>
            {(() => {
              if (isWinner) return t.P_WAITING;
              if (result) return `${t.P_RESULT_RANK} #${result.rank} (+${result.offset}ms)`;
              if (isDisabled) return t.P_PAUSED;
              if (isArmed) return t.P_PRESS_ME; // Shows "PRESS ME" (ЖМИ!) in the box when Red
              return t.P_AWAITING; // Shows "AWAITING START" (ЖДЕМ СТАРТА) in the box when Gray
            })()}
          </p>
        </div>
        <p className={`text-center text-[8px] font-mono uppercase tracking-widest mt-8 ${isWinner ? 'text-yellow-200' : 'text-slate-800'}`}>
          Precision Core v2.2
        </p>
      </div>
    </div>
  );
};

export default PlayerPanel;
