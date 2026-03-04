
import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import ControlPanel from './components/ControlPanel';
import PlayerPanel from './components/PlayerPanel';
import { Role, GameState, Player, BuzzRecord, Language } from './types';
import { translations } from './translations';
import { HOST_PASSWORD } from './constants';

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
  const [showPassword, setShowPassword] = useState(false);

  const [playerData, setPlayerData] = useState<{ name: string; disabled: boolean }>({
    name: '',
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
      console.log("📥 [PLAYER_APP] State received:", data.state, "Target:", data.targetId);

      // 1. Update the global game state
      setGameState(data.state);

      // 2. Handle the "Target Lock" for Round 4 (Sprint)
      if (data.state === 'ACTIVE') {
        // If targetId is provided, I'm only enabled if it matches MY socket ID
        // If targetId is null/undefined, everyone is enabled (Normal Rounds)
        const isMyTurn = !data.targetId || data.targetId === newSocket.id;
        
        setPlayerData(prev => ({
          ...prev,
          disabled: !isMyTurn // Disable the button if it's not my turn
        }));
      } else {
        // If state is IDLE or LOCKED, everyone is disabled
        setPlayerData(prev => ({ ...prev, disabled: true }));
      }

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

    // --- Checking password ---
    if (role === 'host') {
      if (name !== HOST_PASSWORD) {
        setRegistrationError('Incorrect Host Password');
        return;
      }
    }

    setIsConnecting(true);
    setRegistrationError('');

    // FIX: If role is host, send the name "Host". Otherwise send the typed name.
    socket.emit('register', {
      name: role === 'host' ? 'Host' : name,
      code,
      role
    });
  };


  // const handleRegister = (name: string, code: string) => {
  //   if (!socket?.connected) {
  //     setRegistrationError(`Engine unreachable. Is server.js running?`);
  //     return;
  //   }

  //   if (role === 'host') {
  //     // This will print the password to your browser console (F12) to help us debug
  //     console.log("Input:", name);
  //     console.log("Expected:", HOST_PASSWORD);

  //     if (name.trim() !== HOST_PASSWORD) { // .trim() removes accidental spaces
  //       setRegistrationError('Incorrect Host Password');
  //       return;
  //     }
  //   }

  //   setIsConnecting(true);
  //   setRegistrationError('');

  //   socket.emit('register', { 
  //     name: role === 'host' ? 'Host' : name, 
  //     code, 
  //     role 
  //   });
  // };


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

          {/* <form onSubmit={(e) => {
            e.preventDefault();
            handleRegister(playerData.name, gateCode);
            const formData = new FormData(e.currentTarget);
            handleRegister(formData.get('name') as string, (formData.get('code') as string || '').toUpperCase());
          }} className="space-y-6 relative z-10"> */}
          <form onSubmit={(e) => {
              e.preventDefault();
              // Use the state values directly. 
              // If it's a player, we use the name from state and the code from the input below
              const formData = new FormData(e.currentTarget);
              const code = role === 'player' ? (formData.get('code') as string || '').toUpperCase() : gateCode;

              handleRegister(playerData.name, code);
            }}
            className="space-y-6 relative z-10"
          >




            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                {role === 'host' ? 'Admin Password' : t.YOUR_NAME_LABEL}
              </label>

              <div className="relative group">
                <input
                  /* If role is host and showPassword is true, show "text", otherwise "password" */
                  type={role === 'host' ? (showPassword ? "text" : "password") : "text"}
                  value={playerData.name}
                  onChange={(e) => setPlayerData({ ...playerData, name: e.target.value })}
                  onFocus={() => {
                    setPlayerData({ ...playerData, name: '' });
                  }}
                  onBlur={() => {
                    if (playerData.name.trim() === '') {
                      setPlayerData({ ...playerData, name: role === 'host' ? '' : 'Contestant' });
                    }
                  }}
                  className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl p-4 pr-12 text-white font-medium focus:border-blue-500 outline-none transition-all shadow-inner"
                  placeholder={role === 'host' ? "••••••••" : "e.g. John Doe"}
                  required
                />

                {/* Only show the eye button if the role is 'host' */}
                {role === 'host' && (
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-400 transition-colors"
                  >
                    {showPassword ? (
                      /* Eye Off Icon */
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                    ) : (
                      /* Eye On Icon */
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                )}
              </div>
            </div>
            {/* <div>
              <label className="block text-[10px] font-black mb-2 text-slate-500 uppercase tracking-widest text-left">{t.IDENTITY}</label>
              <input name="name" required className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-4 text-white font-bold focus:border-blue-500 outline-none transition-all shadow-inner" placeholder="E.g. Captain" />
            </div> */}

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
