import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 3600000,
  pingInterval: 25000
});

// State Management
let secretGateCode = Math.random().toString(36).substring(2, 8).toUpperCase();
let gameState = 'IDLE'; // IDLE, ACTIVE, WINDOW_OPEN, LOCKED
let currentLanguage = 'EN';
let startTime = 0;
let buzzes = [];
// --- REFACTORED: 'players' is now keyed by NAME (stable ID) ---
let players = new Map();
let windowTimer = null;
// --- REFACTORED: 'targetPlayerId' is now a NAME, not a socket.id ---
let targetPlayerId = null;
// --- NEW: Reverse lookup for socket.id -> name ---
let socketIdToName = new Map();


console.log(`\n[INIT] NovaBuzzer Pro Engine Started`);
console.log(`[INIT] Secret Gate Code: ${secretGateCode}`);
console.log(`[INIT] Port: ${config.server.port}\n`);

// Helper to create the client-facing player list
const getPlayerListForClient = () => {
  return Array.from(players.values()).map(p => ({
    ...p,
    id: p.name // Ensure the 'id' field for the client is the stable name
  }));
};

io.on('connection', (socket) => {

  // Immediately send the current gate code status to the connecting client
  socket.emit('gateCodeUpdate', secretGateCode);

  // 1. REGISTRATION LOGIC (REFACTORED for Persistent Identity)
  socket.on('register', ({ name, code, role }) => {
    if (role === 'host') {
      socket.join('host-room');
      socket.emit('registered', {
        success: true,
        role: 'host',
        gateCode: secretGateCode,
        language: currentLanguage
      });
      socket.emit('gameStateUpdate', { state: gameState, buzzes });
      io.to('host-room').emit('playerListUpdate', getPlayerListForClient());
      return;
    }

    // Allow joining if gate is open (empty code)
    if (secretGateCode !== '' && code !== secretGateCode) {
      socket.emit('registered', { success: false, error: 'Invalid Secret Gate Code' });
      return;
    }

    let player;
    if (players.has(name)) {
      player = players.get(name);

      // Prevent login if the name is already in use by an active connection
      if (player.connected && player.socketId && io.sockets.sockets.has(player.socketId)) {
        socket.emit('registered', { success: false, error: 'Name already in use. Please choose another.' });
        return;
      }

      // Player is re-connecting. Update their socketId and mark as connected.
      if (player.socketId) {
        socketIdToName.delete(player.socketId);
      }
      player.socketId = socket.id;
      player.connected = true;
      console.log(`♻️  Player ${name} Re-synced with new socket: ${socket.id}`);

    } else {
      // New player registration
      if (players.size >= 10) {
        socket.emit('registered', { success: false, error: 'Room Full (Max 10)' });
        return;
      }
      player = {
        name: name,
        socketId: socket.id,
        disabled: true,
        connected: true
      };
      console.log(`✅ Player ${name} registered with socket: ${socket.id}`);
    }

    players.set(name, player);
    socketIdToName.set(socket.id, name);
    socket.join('players-room');

    socket.emit('registered', {
      success: true,
      role: 'player',
      name: player.name,
      disabled: player.disabled,
      language: currentLanguage
    });

    io.to('host-room').emit('playerListUpdate', getPlayerListForClient());
  });


  // --- THE SYNC BRIDGE ---
  socket.on('updateGameState', (fullState) => {
    socket.broadcast.emit('gameStateLink', fullState);
  });


  // 2. GAME ACTION LOGIC (REFACTORED for Persistent Identity)
  socket.on('gameAction', (payload) => {
    console.log(`[ACTION] Received: ${payload.type}`, payload.data || {});
    const { type, data } = typeof payload === 'string' ? { type: payload } : payload;

    switch (type) {
      case 'SET_STATE':
        gameState = data.state;
        if (gameState === 'IDLE') buzzes = [];
        io.emit('gameStateUpdate', { state: gameState, buzzes });
        console.log(`[GAME] State changed to: ${gameState}`);
        break;
      case 'CHANGE_LANGUAGE':
        currentLanguage = data.language;
        io.emit('languageUpdate', { language: currentLanguage });
        break;
      case 'RESET':
        targetPlayerId = null;
        clearTimeout(windowTimer);
        gameState = 'IDLE';
        buzzes = [];
        startTime = 0;
        io.emit('gameStateUpdate', { state: 'IDLE', buzzes: [] });
        break;
      case 'START_ROUND':
        gameState = 'ACTIVE';
        if (targetPlayerId === null) {
          targetPlayerId = null;
        }
        buzzes = [];
        startTime = Date.now();
        io.emit('gameStateUpdate', {
          state: 'ACTIVE',
          startTime,
          buzzes: [],
          targetId: targetPlayerId // targetId is now a name
        });
        console.log(`[GAME] Round Started. Mode: ${targetPlayerId ? 'SPRINT' : 'NORMAL'}`);
        break;
      case 'ARM_SPECIFIC':
        gameState = 'ACTIVE';
        targetPlayerId = data.playerId; // This is now the player's name
        buzzes = [];
        io.emit('gameStateUpdate', { state: 'ACTIVE', targetId: targetPlayerId });
        console.log(`[SPRINT] Armed only player: ${targetPlayerId}`);
        break;
      case 'REGEN_CODE':
        secretGateCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        io.emit('gateCodeUpdate', secretGateCode); // Emit to all
        break;
      case 'SET_GATE_CODE':
        secretGateCode = (data.code || '').toUpperCase();
        console.log(`[GAME] Gate Code set to: '${secretGateCode}'`);
        io.emit('gateCodeUpdate', secretGateCode); // Emit to all
        break;
      case 'TOGGLE_PAUSE':
        if (players.has(data.id)) { // data.id is the name
          const p = players.get(data.id);
          p.disabled = !p.disabled;
          players.set(data.id, p);
          io.to('host-room').emit('playerListUpdate', getPlayerListForClient());
          if (p.socketId) {
            io.to(p.socketId).emit('statusUpdate', { disabled: p.disabled });
          }
        }
        break;
      case 'UPDATE_PLAYER':
        // data.id is the OLD name, data.newName is the new one
        if (players.has(data.id)) {
          const player = players.get(data.id);
          player.name = data.newName;
          players.delete(data.id);
          players.set(data.newName, player);

          if (player.socketId) {
            socketIdToName.set(player.socketId, data.newName);
          }
          io.to('host-room').emit('playerListUpdate', getPlayerListForClient());
          if (player.socketId) {
            io.to(player.socketId).emit('profileUpdate', { name: data.newName });
          }
        }
        break;
      case 'KICK_PLAYER':
        if (players.has(data.id)) { // data.id is the name
          const player = players.get(data.id);
          if (player.socketId) {
            io.to(player.socketId).emit('kicked');
            socketIdToName.delete(player.socketId);
          }
          players.delete(data.id);
          io.to('host-room').emit('playerListUpdate', getPlayerListForClient());
        }
        break;
      case 'KICK_ALL':
        io.to('players-room').emit('kicked');
        players.clear();
        socketIdToName.clear();
        io.to('host-room').emit('playerListUpdate', []);
        break;
    }
  });

  // 3. BUZZER LOGIC (REFACTORED for Persistent Identity)
  socket.on('buzz', () => {
    const name = socketIdToName.get(socket.id);
    if (!name || !players.has(name)) {
      console.log("❌ BUZZ REJECTED: No registered player for this socket.");
      return;
    }
    const player = players.get(name);

    console.log(`[BUZZ_ATTEMPT] From: ${player.name}. Current State: ${gameState}`);

    if (player.disabled || (gameState !== 'ACTIVE' && gameState !== 'WINDOW_OPEN' && gameState !== 'BATTLE')) {
      console.log("❌ BUZZ REJECTED: State mismatch or player disabled.");
      return;
    }

    if (targetPlayerId !== null && player.name !== targetPlayerId) {
      console.log(`[REJECTED] Blocked buzz from ${player.name} (Not the target)`);
      return;
    }

    if (buzzes.find(b => b.playerId === player.name)) return;

    const rank = buzzes.length + 1;
    buzzes.push({ playerId: player.name, playerName: player.name, rank });

    if (rank === 1) {
      console.log(`✅ SUCCESS: ${player.name} is the winner!`);
      gameState = 'LOCKED';
      io.emit('gameStateUpdate', { state: 'LOCKED', buzzes });
      io.to('host-room').emit('firstBuzzDetected', {
        winnerName: player.name,
        playerId: player.name // Send stable name
      });
    }

    socket.emit('buzzResult', { rank });
    io.to('host-room').emit('liveBuzzUpdate', buzzes);
  });

  // 4. DISCONNECT LOGIC (REFACTORED for Persistent Identity)
  socket.on('disconnect', () => {
    if (socketIdToName.has(socket.id)) {
      const name = socketIdToName.get(socket.id);
      if (players.has(name)) {
        const player = players.get(name);
        console.log(`🔌 Player disconnected: ${player.name}`);
        player.connected = false;
        // The socketId is now stale, but we leave it for potential debugging
        players.set(name, player);
        socketIdToName.delete(socket.id);
        io.to('host-room').emit('playerListUpdate', getPlayerListForClient());
      }
    }
  });
});

httpServer.listen(config.server.port, '0.0.0.0', () => {
  console.log(`[READY] NovaBuzzer listening on http://0.0.0.0:${config.server.port}`);
});
