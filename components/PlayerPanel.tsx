
import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { GameState, BuzzRecord, Language } from '../types';
import { translations } from '../translations';

interface Props {
  socket: Socket;
  gameState: GameState;
  buzzes: BuzzRecord[];
  initialName: string;
  initialDisabled: boolean;
  language: Language;
}

const PlayerPanel: React.FC<Props> = ({ socket, gameState, buzzes, initialName, initialDisabled, language }) => {
  const [result, setResult] = useState<{ rank: number; offset: number } | null>(null);
  const [isBuzzed, setIsBuzzed] = useState(false);
  const [isDisabled, setIsDisabled] = useState(initialDisabled);
  const [name, setName] = useState(initialName);

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

  useEffect(() => {
    setIsDisabled(initialDisabled);
  }, [initialDisabled]);

  useEffect(() => {
    if (gameState === 'IDLE') {
      setIsBuzzed(false);
      setResult(null);
    }
  }, [gameState]);

  const handleBuzz = () => {
    // Strictly prevent buzzing if paused, already buzzed, or system not armed
    if (isDisabled || isBuzzed || (gameState !== 'ACTIVE' && gameState !== 'WINDOW_OPEN')) return;
    setIsBuzzed(true);
    socket.emit('buzz');
  };

  const isWinner = result?.rank === 1;
  const isArmed = (gameState === 'ACTIVE' || gameState === 'WINDOW_OPEN') && !isBuzzed && !isDisabled;

  return (
    <div className={`h-screen flex flex-col p-8 items-center justify-between transition-all duration-700 overflow-hidden ${
      isWinner ? 'bg-yellow-600' : isDisabled ? 'bg-slate-900 opacity-80' : 'bg-slate-950'
    }`}>
      {/* Top HUD */}
      <div className="w-full space-y-4">
        <div className={`w-full p-4 rounded-3xl border-2 text-center font-black uppercase tracking-tighter shadow-2xl transition-all duration-500 ${
          isWinner ? 'bg-white border-white text-yellow-700' : 
          isDisabled ? 'bg-red-900/20 border-red-500 text-red-500' :
          isArmed ? 'bg-red-600 border-red-400 text-white animate-pulse' : 
          'bg-slate-800 border-slate-700 text-slate-500'
        }`}>
          {isWinner ? `★ ${t.P_FIRST} ★` : isDisabled ? t.P_PAUSED : isArmed ? t.P_READY : t.P_STANDBY}
        </div>
        <div className="text-center">
           <h2 className={`text-[9px] font-black uppercase tracking-[0.4em] mb-1 ${isWinner ? 'text-yellow-200' : 'text-slate-600'}`}>{t.P_PROTOCOL}</h2>
           <p className={`text-4xl font-black italic uppercase tracking-tighter ${isWinner ? 'text-white' : 'text-slate-100'}`}>{name}</p>
        </div>
      </div>

      {/* Central Hardware Buzzer */}
      <div className="flex-1 flex items-center justify-center w-full relative">
        {isArmed && (
           <div className="absolute w-80 h-80 rounded-full border-4 border-red-500/40 animate-ping"></div>
        )}
        
        <button
          onClick={handleBuzz}
          disabled={isDisabled || isBuzzed || (gameState !== 'ACTIVE' && gameState !== 'WINDOW_OPEN')}
          className={`no-select relative w-72 h-72 rounded-full border-[12px] flex flex-col items-center justify-center transition-all duration-300 shadow-2xl active:scale-90 ${
            isWinner ? 'bg-white border-yellow-400 text-yellow-600' :
            isDisabled ? 'bg-slate-800 border-slate-700 opacity-30 grayscale' :
            isBuzzed ? 'bg-slate-800 border-slate-700 opacity-50' :
            isArmed ? 'bg-red-600 border-red-400 text-white shadow-[0_0_80px_rgba(220,38,38,0.5)]' :
            'bg-slate-900 border-slate-800 text-slate-700 shadow-inner'
          }`}
        >
          <span className="text-6xl font-black italic tracking-tighter uppercase">{isDisabled ? t.P_OFF : t.P_BUZZ}</span>
          <div className={`mt-4 w-16 h-2 rounded-full ${isWinner ? 'bg-yellow-600' : (isBuzzed || isDisabled) ? 'hidden' : 'bg-white/30 animate-pulse'}`}></div>
        </button>
      </div>

      {/* Result Metrics */}
      <div className="w-full">
        <div className={`p-8 rounded-[2.5rem] border-2 shadow-2xl text-center transition-all duration-500 ${
          isWinner ? 'bg-yellow-700/30 border-yellow-400/30' : 'bg-slate-900 border-slate-800'
        }`}>
           <p className={`text-[9px] font-black uppercase mb-4 tracking-[0.5em] ${isWinner ? 'text-yellow-300' : 'text-slate-600'}`}>{t.P_STATUS}</p>
           <p className={`text-3xl font-black tracking-tighter ${isWinner ? 'text-white' : result ? 'text-blue-400' : isDisabled ? 'text-red-500' : 'text-slate-500'}`}>
              {isWinner ? t.P_WAITING : result ? `${t.P_RESULT_RANK} #${result.rank} (+${result.offset}ms)` : isDisabled ? t.P_PAUSED : t.P_AWAITING}
           </p>
        </div>
        <p className={`text-center text-[8px] font-mono uppercase tracking-widest mt-8 ${isWinner ? 'text-yellow-200' : 'text-slate-800'}`}>Precision Core v2.2</p>
      </div>
    </div>
  );
};

export default PlayerPanel;
