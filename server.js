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
  }
});

// State Management
let secretGateCode = Math.random().toString(36).substring(2, 8).toUpperCase();
let gameState = 'IDLE'; // IDLE, ACTIVE, WINDOW_OPEN, LOCKED
let currentLanguage = 'EN';
let startTime = 0;
let buzzes = [];
let players = new Map();
let windowTimer = null;
let targetPlayerId = null;

console.log(`\n[INIT] NovaBuzzer Pro Engine Started`);
console.log(`[INIT] Secret Gate Code: ${secretGateCode}`);
console.log(`[INIT] Port: ${config.server.port}\n`);

io.on('connection', (socket) => {
  
  // 1. REGISTRATION LOGIC
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
      io.to('host-room').emit('playerListUpdate', Array.from(players.values()));
      return;
    }

    if (code !== secretGateCode) {
      socket.emit('registered', { success: false, error: 'Invalid Secret Gate Code' });
      return;
    }

    const newPlayer = { name, id: socket.id, disabled: true };
    players.set(socket.id, newPlayer);
    socket.join('players-room');

    socket.emit('registered', {
      success: true,
      role: 'player',
      name: name,
      disabled: true,
      language: currentLanguage
    });

    io.to('host-room').emit('playerListUpdate', Array.from(players.values()));
  });

  // --- THE SYNC BRIDGE (ADDED HERE) ---
  // This catches the full game data from the laptop and sends it to the phone
  socket.on('updateGameState', (fullState) => {
    socket.broadcast.emit('gameStateLink', fullState);
  });
  // ------------------------------------

  // 2. GAME ACTION LOGIC
  socket.on('gameAction', (payload) => {
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

        // Check: Is someone already locked in from ARM_SPECIFIC?
        // If targetPlayerId is ALREADY something (not null), we leave it alone.
        // If it IS null, we keep it null (allowing everyone to buzz).
        if (targetPlayerId === null) {
          targetPlayerId = null; 
        }

        buzzes = [];
        startTime = Date.now();

        // We include the targetId in the emit so phones know if they are allowed to buzz
        io.emit('gameStateUpdate', { 
          state: 'ACTIVE', 
          startTime, 
          buzzes: [],
          targetId: targetPlayerId 
        });

        console.log(`[GAME] Round Started. Mode: ${targetPlayerId ? 'SPRINT' : 'NORMAL'}`);
        break;
      case 'ARM_SPECIFIC':
        gameState = 'ACTIVE'; 
        targetPlayerId = data.playerId; // Lock to this specific socket.id
        buzzes = [];
        io.emit('gameStateUpdate', { state: 'ACTIVE', targetId: targetPlayerId });
        console.log(`[SPRINT] Armed only player: ${targetPlayerId}`);
        break;
      case 'REGEN_CODE':
        secretGateCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        io.to('host-room').emit('gateCodeUpdate', secretGateCode);
        break;
      case 'TOGGLE_PAUSE':
        if (players.has(data.id)) {
          const p = players.get(data.id);
          p.disabled = !p.disabled;
          players.set(data.id, p);
          io.to('host-room').emit('playerListUpdate', Array.from(players.values()));
          io.to(data.id).emit('statusUpdate', { disabled: p.disabled });
        }
        break;
      case 'UPDATE_PLAYER':
        if (players.has(data.id)) {
          const player = players.get(data.id);
          player.name = data.newName;
          players.set(data.id, player);
          io.to('host-room').emit('playerListUpdate', Array.from(players.values()));
          io.to(data.id).emit('profileUpdate', { name: data.newName });
        }
        break;
      case 'KICK_PLAYER':
        if (players.has(data.id)) {
          players.delete(data.id);
          io.to(data.id).emit('kicked');
          io.to('host-room').emit('playerListUpdate', Array.from(players.values()));
        }
        break;
      case 'KICK_ALL':
        io.to('players-room').emit('kicked');
        players.clear();
        io.to('host-room').emit('playerListUpdate', []);
        break;
    }
  });

  // 3. BUZZER LOGIC
  socket.on('buzz', () => {
    const player = players.get(socket.id);
    console.log(`[BUZZ_ATTEMPT] From: ${player?.name}. Current State: ${gameState}`);

    if (!player || player.disabled || (gameState !== 'ACTIVE' && gameState !== 'WINDOW_OPEN' && gameState !== 'BATTLE')) {
      console.log("❌ BUZZ REJECTED: State mismatch or player disabled.");
      return;
    }
    
    if (targetPlayerId !== null && socket.id !== targetPlayerId) {
      console.log(`[REJECTED] Blocked buzz from ${player.name} (Not the target)`);
      return; 
    }

    if (buzzes.find(b => b.playerId === socket.id)) return;

    const rank = buzzes.length + 1;
    buzzes.push({ playerId: socket.id, playerName: player.name, rank });

    if (rank === 1) {
      console.log(`✅ SUCCESS: ${player.name} is the winner!`);
      gameState = 'LOCKED';
      io.emit('gameStateUpdate', { state: 'LOCKED', buzzes });
      io.to('host-room').emit('firstBuzzDetected', {
        winnerName: player.name,
        playerId: socket.id
      });
    }

    socket.emit('buzzResult', { rank });
    io.to('host-room').emit('liveBuzzUpdate', buzzes);
  });

  socket.on('disconnect', () => {
    if (players.has(socket.id)) {
      players.delete(socket.id);
      io.to('host-room').emit('playerListUpdate', Array.from(players.values()));
    }
  });
});

httpServer.listen(config.server.port, '0.0.0.0', () => {
  console.log(`[READY] NovaBuzzer listening on http://0.0.0.0:${config.server.port}`);
});
