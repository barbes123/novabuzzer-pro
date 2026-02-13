
import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { GameState, Player, BuzzRecord, Language } from '../types';
import { translations } from '../translations';
import { SOUNDS } from '../constants';

interface Props {
  socket: Socket;
  gameState: GameState;
  gateCode: string;
  players: Player[];
  buzzes: BuzzRecord[];
  language: Language;
}

const ControlPanel: React.FC<Props> = ({ socket, gameState, gateCode, players, buzzes, language }) => {
  const [volume, setVolume] = useState(0.5); // 0.5 is 50% volume
  const [isMuted, setIsMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<'host' | 'test'>('host');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [lastAction, setLastAction] = useState<string>('Ready');
  const [showGateCode, setShowGateCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const t = translations[language];

  const handleAction = (type: string, data?: any) => {
    setLastAction(`Executing ${type}...`);
    socket.emit('gameAction', { type, data });
    setTimeout(() => setLastAction(gameState === 'ACTIVE' ? 'Armed' : 'Standby'), 1000);
  };

  const toggleLanguage = () => {
    const nextLang = language === 'EN' ? 'RU' : 'EN';
    socket.emit('gameAction', { type: 'CHANGE_LANGUAGE', data: { language: nextLang } });
  };

  const saveName = (id: string) => {
    handleAction('UPDATE_PLAYER', { id, newName: tempName });
    setEditingId(null);
  };

  const copyGateCode = async () => {
    if (!gateCode) return;
    try {
      await navigator.clipboard.writeText(gateCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = gateCode;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Clipboard copy failed', err);
      }
    }
  };

  const winnerId = buzzes.find(b => b.rank === 1)?.playerId;

  React.useEffect(() => {
    const winner = buzzes.find(b => b.rank === 1);
    // Only play if there's a winner AND we are not muted
    if (winner && !isMuted) {
      const audio = new Audio(SOUNDS.WINNER_FANFARE);
      audio.volume = volume;
      audio.play().catch(e => console.error("Audio playback failed:", e));
    }
  }, [buzzes, isMuted, volume]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200">
      <header className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-800 p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-xl italic shadow-[0_0_20px_rgba(37,99,235,0.4)]">N</div>
          <div>
            <h1 className="text-xl font-black tracking-tighter uppercase italic">NovaBuzzer <span className="text-blue-500">{t.MASTER_CONTROL}</span></h1>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 tracking-widest uppercase">
              <span className={`w-1.5 h-1.5 rounded-full ${socket.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              {socket.connected ? 'UPLINK STABLE' : 'UPLINK LOST'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleLanguage}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 11.37 9.19 15.378 3 18.125M12 21a11.96 11.96 0 01-5.118-1.148" /></svg>
            {language}
          </button>




          {/* Volume Controls */}
          <div className="flex items-center gap-3 bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              {isMuted || volume === 0 ? (
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              )}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />

            <span className="text-[10px] font-mono font-bold text-slate-500 w-8">
              {Math.round(volume * 100)}%
            </span>
          </div>








          <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700/50">
            <button onClick={() => setActiveTab('host')} className={`px-5 py-2 rounded-lg transition-all text-xs font-black uppercase tracking-widest ${activeTab === 'host' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{t.LOBBY}</button>
            <button onClick={() => setActiveTab('test')} className={`px-5 py-2 rounded-lg transition-all text-xs font-black uppercase tracking-widest ${activeTab === 'test' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{t.PHOTO_FINISH}</button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 md:p-10">
        {activeTab === 'host' ? (
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl flex flex-col justify-center relative overflow-hidden group">
                <h2 className="text-slate-500 text-[10px] font-black mb-4 uppercase tracking-[0.4em]">{t.GATE_KEY}</h2>
                <div className="flex items-center gap-4">
                  <div className="text-6xl font-mono font-black text-blue-400 tracking-[0.2em] bg-slate-800/50 px-6 py-2 rounded-2xl min-w-[300px] text-center">
                    {showGateCode ? gateCode : '••••••'}
                  </div>
                  <button
                    onClick={() => setShowGateCode(!showGateCode)}
                    className="p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-400 hover:text-white transition-all border border-slate-700 font-bold text-[10px] uppercase tracking-widest"
                  >
                    {showGateCode ? t.HIDE : t.SHOW}
                  </button>
                  <button onClick={() => handleAction('REGEN_CODE')} className="p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-400 hover:text-white transition-all border border-slate-700">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  </button>
                  <button onClick={copyGateCode} className="p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-400 hover:text-white transition-all border border-slate-700 flex items-center gap-2">
                    {copied ? (
                      <>
                        <svg className="w-5 h-5 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879A1 1 0 003.293 9.293l4 4a1 1 0 001.414 0l8-8z" clipRule="evenodd" /></svg>
                        <span className="text-[10px] font-black uppercase tracking-widest text-green-300">{t.COPIED || 'Copied'}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16h8M8 12h8m-6 8h6a2 2 0 002-2V8a2 2 0 00-2-2h-6l-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h2z" /></svg>
                        <span className="text-[10px] font-black uppercase tracking-widest">Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl flex flex-col justify-center">
                <h2 className="text-slate-500 text-[10px] font-black mb-4 uppercase tracking-[0.4em]">{t.SYSTEM_HEALTH}</h2>
                <div className="flex flex-col gap-2">
                  <div className={`text-3xl font-black italic tracking-tighter uppercase transition-colors ${gameState === 'ACTIVE' ? 'text-green-400' : gameState === 'WINDOW_OPEN' ? 'text-yellow-400 animate-pulse' : 'text-slate-600'}`}>
                    {gameState}
                  </div>
                  <p className="text-[10px] font-mono text-blue-500/50 uppercase font-bold tracking-widest">{lastAction}</p>
                </div>
              </div>
            </div>

            <div className={`p-10 rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8 transition-all duration-500 ${gameState === 'ACTIVE' ? 'bg-red-600 animate-pulse shadow-[0_0_50px_rgba(220,38,38,0.3)]' : 'bg-blue-600'}`}>
              <div className="text-center md:text-left">
                <h3 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-2">
                  {gameState === 'ACTIVE' ? t.ARMED : t.READY}
                </h3>
                <p className="text-white opacity-70 max-w-md text-xs font-bold uppercase tracking-widest">
                  {gameState === 'ACTIVE' ? t.ARM_DESC : t.READY_DESC}
                </p>
              </div>
              <div className="flex gap-4">
                <button
                  disabled={gameState !== 'IDLE'}
                  onClick={() => handleAction('START_ROUND')}
                  className="px-12 py-6 bg-white text-blue-600 rounded-2xl font-black text-2xl uppercase italic shadow-2xl active:scale-95 disabled:opacity-20 transition-all hover:bg-slate-100"
                >
                  {t.ARM_ALL}
                </button>
                <button
                  disabled={gameState === 'IDLE'}
                  onClick={() => handleAction('RESET')}
                  className="px-12 py-6 bg-slate-900/40 text-white rounded-2xl font-black text-2xl uppercase italic shadow-2xl active:scale-95 disabled:opacity-20 transition-all hover:bg-slate-900/60 border border-white/10"
                >
                  {t.DISARM}
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black uppercase italic tracking-tight">{t.ACTIVE_CONTESTANTS}</h2>
                <div className="flex gap-4 items-center">
                  <button
                    onClick={() => handleAction('KICK_ALL')}
                    className="px-4 py-2 bg-red-900/20 text-red-500 border border-red-900/30 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-900/40 transition-all"
                  >
                    {t.KICK_ALL}
                  </button>
                  <span className="bg-slate-800 px-4 py-1 rounded-full text-[10px] font-black text-slate-400 tracking-widest uppercase">{players.length} {t.SYNCED}</span>
                </div>
              </div>

              {players.length === 0 ? (
                <div className="py-20 text-center text-slate-700 font-mono text-[10px] uppercase tracking-[0.5em] animate-pulse">{t.WAITING_REG}</div>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {players.map((p, idx) => {
    const isWinner = winnerId === p.id;
    return (
      <div 
        key={p.id} 
        className={`
          p-5 rounded-2xl flex flex-col group transition-all shadow-lg border-2 
          ${isWinner 
            ? 'bg-yellow-500/10 border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.2)]' 
            : p.disabled 
              ? 'bg-slate-900 border-slate-800 opacity-60' 
              : 'bg-slate-800/50 border-slate-700 hover:border-blue-500'
          }
        `}
      >
        {/* Top row: Player number + name + action buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Player number badge */}
            <div className={`
              w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl italic
              ${isWinner ? 'bg-yellow-500 text-slate-950' : 'bg-blue-600/10 text-blue-400'}
            `}>
              {idx + 1}
            </div>

            {/* Player info */}
            <div className="flex flex-col">
              {editingId === p.id ? (
                <input
                  autoFocus
                  className="bg-slate-700 text-white p-2 rounded-lg text-sm outline-none w-24 border border-blue-500"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={() => saveName(p.id)}
                  onKeyDown={(e) => e.key === 'Enter' && saveName(p.id)}
                />
              ) : (
                <span className={`font-black uppercase tracking-tight truncate text-lg ${isWinner ? 'text-yellow-500' : 'text-slate-100'}`}>
                  {p.name}
                </span>
              )}
              
              <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                {p.manualId ? `SLOT ${p.manualId}` : `UNASSIGNED`}
              </span>
            </div>
          </div>

          {/* Action buttons - always visible */}
          <div className="flex gap-2">
            <button
              onClick={() => handleAction('TOGGLE_PAUSE', { id: p.id })}
              title={p.disabled ? 'Resume' : 'Pause'}
              className={`p-2 rounded-lg transition-colors ${
                p.disabled 
                  ? 'bg-green-900/20 text-green-500 hover:bg-green-900/40' 
                  : 'bg-orange-900/20 text-orange-500 hover:bg-orange-900/40'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
            
            <button
              onClick={() => { setEditingId(p.id); setTempName(p.name); }}
              className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
            >
              <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            
            <button
              onClick={() => handleAction('KICK_PLAYER', { id: p.id })}
              className="p-2 bg-red-900/20 rounded-lg hover:bg-red-900/40 transition-colors"
            >
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Bottom row: Status badges - always visible below buttons */}
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-700/50">
          {isWinner && (
            <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest bg-yellow-500/10 px-2 py-1 rounded">
              {t.CHAMPION}
            </span>
          )}
          {p.disabled && (
            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-2 py-1 rounded">
              {t.PAUSED}
            </span>
          )}
          {!isWinner && !p.disabled && (
            <span className="text-[10px] text-slate-600 uppercase tracking-widest">
              ACTIVE
            </span>
          )}
        </div>
      </div>
    );
  })}
</div>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <div className="bg-slate-900 rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden">
              <div className="p-10 border-b border-slate-800 flex justify-between items-end bg-slate-800/20">
                <div>
                  <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-1 text-white">{t.PHOTO_FINISH_LOG}</h2>
                  <p className="text-slate-500 font-mono text-[10px] uppercase tracking-widest">{t.OFFSET_CALC}</p>
                </div>
                <button onClick={() => handleAction('RESET')} className="px-6 py-2 bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-600/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">{t.CLEAR_ARENA}</button>
              </div>
              <div className="p-0">
                {buzzes.length === 0 ? (
                  <div className="py-40 flex flex-col items-center justify-center text-slate-800 font-mono text-sm uppercase tracking-widest">
                    <div className="w-12 h-12 border-2 border-slate-800 border-dashed rounded-full animate-spin mb-6"></div>
                    {t.ARENA_SILENT}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/50">
                    {buzzes.map((b, idx) => (
                      <div key={idx} className={`p-8 flex items-center justify-between transition-all group ${idx === 0 ? 'bg-yellow-500/5 border-l-8 border-yellow-500' : 'hover:bg-slate-800/30 border-l-8 border-transparent'}`}>
                        <div className="flex items-center gap-10">
                          <div className={`text-4xl font-black italic ${idx === 0 ? 'text-yellow-500' : 'text-slate-700'}`}>#{idx + 1}</div>
                          <div>
                            <div className="flex items-center gap-3">
                              <span className={`text-2xl font-black uppercase tracking-tight ${idx === 0 ? 'text-yellow-500' : 'text-slate-400'}`}>{b.playerName}</span>
                              {idx === 0 && <span className="bg-yellow-500 text-slate-950 px-3 py-0.5 rounded-full text-[10px] font-black uppercase italic">{t.WINNER}</span>}
                            </div>
                            <div className="text-[10px] font-mono text-slate-700 uppercase mt-1">Capture Point: {b.offset}ms</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-3xl font-mono font-black ${idx === 0 ? 'text-yellow-500' : 'text-blue-400'}`}>
                            +{b.offset}<span className="text-sm ml-1 opacity-50">ms</span>
                          </div>
                          {idx > 0 && (
                            <div className="text-[10px] font-mono text-red-500 mt-1 uppercase font-bold tracking-tighter">Gap: +{b.offset - buzzes[0].offset}ms</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ControlPanel;
