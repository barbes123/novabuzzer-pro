
import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import ControlPanel from './components/ControlPanel';
import PlayerPanel from './components/PlayerPanel';
import { Role, GameState, Player, BuzzRecord, Language } from './types';
import { translations } from './translations';

const getSocketUrl = () => {
  const hostname = window.location.hostname || 'localhost';
  return `http://${hostname}:3001`;
};

const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [language, setLanguage] = useState<Language>('EN');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [gameState, setGameState] = useState<GameState>('IDLE');
  const [gateCode, setGateCode] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [buzzes, setBuzzes] = useState<BuzzRecord[]>([]);
  
  const [playerData, setPlayerData] = useState<{ name: string; disabled: boolean }>({
    name: 'Contestant',
    disabled: true
  });

  const t = translations[language];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get('role') === 'host' ? 'host' : 'player';
    setRole(urlRole);
    
    document.title = urlRole === 'host' ? 'NovaBuzzer | MASTER CONTROL' : 'NovaBuzzer | PLAYER HUB';

    const SERVER_URL = getSocketUrl();
    const newSocket = io(SERVER_URL, {
      reconnectionAttempts: 10,
      timeout: 5000,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      setRegistrationError('');
    });

    newSocket.on('connect_error', () => {
      setIsConnected(false);
      setIsConnecting(false);
    });

    newSocket.on('registered', (data) => {
      setIsConnecting(false);
      if (data.success) {
        setIsRegistered(true);
        if (data.language) setLanguage(data.language);
        if (data.gateCode) setGateCode(data.gateCode);
        if (data.role === 'player') {
          setPlayerData({ name: data.name, disabled: data.disabled });
        }
      } else {
        setRegistrationError(data.error);
      }
    });

    newSocket.on('gameStateUpdate', (data) => {
      setGameState(data.state);
      if (data.buzzes) setBuzzes(data.buzzes);
      if (data.state === 'IDLE') setBuzzes([]);
    });

    newSocket.on('languageUpdate', (data) => {
      setLanguage(data.language);
    });

    newSocket.on('playerListUpdate', (list) => {
      setPlayers(list);
      // Sync local player data if this device is in the list
      const me = list.find((p: Player) => p.id === newSocket.id);
      if (me) {
        setPlayerData({ name: me.name, disabled: me.disabled });
      }
    });
    
    newSocket.on('gateCodeUpdate', (code) => setGateCode(code));
    newSocket.on('liveBuzzUpdate', (list) => setBuzzes(list));
    newSocket.on('kicked', () => window.location.reload());

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleRegister = (name: string, code: string) => {
    if (!socket?.connected) {
      setRegistrationError(`Engine unreachable. Is server.js running?`);
      return;
    }
    setIsConnecting(true);
    setRegistrationError('');
    socket.emit('register', { name, code, role });
  };

  if (!role) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 font-mono text-sm animate-pulse">BOOTING_SYSTEM...</div>;

  if (!isRegistered) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
        <div className="max-w-md w-full bg-slate-900 p-10 rounded-[2.5rem] shadow-2xl border border-slate-800 relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl"></div>
          
          <div className="flex justify-between items-center mb-10 relative z-10">
            <div>
              <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">NovaBuzzer<span className="text-blue-500">.pro</span></h1>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em]">{role === 'host' ? t.MASTER_CONTROL : 'Contestant'}</p>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-bold ${isConnected ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
               <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
               {isConnected ? t.CONN_READY : t.NO_ENGINE}
            </div>
          </div>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            handleRegister(formData.get('name') as string, (formData.get('code') as string || '').toUpperCase());
          }} className="space-y-6 relative z-10">
            <div>
              <label className="block text-[10px] font-black mb-2 text-slate-500 uppercase tracking-widest text-left">{t.IDENTITY}</label>
              <input name="name" required className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-4 text-white font-bold focus:border-blue-500 outline-none transition-all shadow-inner" placeholder="E.g. Captain" />
            </div>
            
            {role === 'player' && (
              <div>
                <label className="block text-[10px] font-black mb-2 text-slate-500 uppercase tracking-widest text-left">{t.GATE_KEY_LABEL}</label>
                <input name="code" required maxLength={6} className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-4 text-white font-mono uppercase text-center text-2xl tracking-[0.4em] font-black focus:border-blue-500 outline-none transition-all shadow-inner" placeholder="000000" />
              </div>
            )}

            {registrationError && (
              <div className="text-red-400 text-[10px] font-bold bg-red-900/20 p-4 rounded-xl border border-red-900/30 text-center uppercase tracking-tight">
                {registrationError}
              </div>
            )}

            <button 
              type="submit" 
              disabled={isConnecting}
              className={`w-full bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest text-sm flex items-center justify-center gap-3 ${isConnecting ? 'opacity-50 cursor-wait' : ''}`}
            >
              {isConnecting ? '...' : t.INIT_CONN}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {role === 'host' ? (
        <ControlPanel socket={socket!} gameState={gameState} gateCode={gateCode} players={players} buzzes={buzzes} language={language} />
      ) : (
        <PlayerPanel 
          socket={socket!} 
          gameState={gameState} 
          buzzes={buzzes} 
          initialName={playerData.name} 
          initialDisabled={playerData.disabled} 
          language={language}
        />
      )}
    </div>
  );
};

export default App;
