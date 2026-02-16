
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

console.log(`\n[INIT] NovaBuzzer Pro Engine Started`);
console.log(`[INIT] Secret Gate Code: ${secretGateCode}`);
console.log(`[INIT] Port: ${config.server.port}\n`);

io.on('connection', (socket) => {
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

    // New players are ALWAYS paused by default
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

  socket.on('gameAction', (payload) => {
    const { type, data } = typeof payload === 'string' ? { type: payload } : payload;

    switch (type) {
      case 'SET_STATE':
        gameState = data.state; // 'BATTLE' or 'IDLE'
        if (gameState === 'IDLE') buzzes = []; // Clear buzzes on disarm
        io.emit('gameStateUpdate', { state: gameState, buzzes });
        console.log(`[GAME] State changed to: ${gameState}`);
        break;
      case 'CHANGE_LANGUAGE':
        currentLanguage = data.language;
        io.emit('languageUpdate', { language: currentLanguage });
        break;

      case 'RESET':
        clearTimeout(windowTimer);
        gameState = 'IDLE';
        buzzes = [];
        startTime = 0;
        io.emit('gameStateUpdate', { state: 'IDLE', buzzes: [] });
        break;

      case 'START_ROUND':
        gameState = 'ACTIVE';
        buzzes = [];
        startTime = Date.now();
        io.emit('gameStateUpdate', { state: 'ACTIVE', startTime, buzzes: [] });
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

  // socket.on('buzz', () => {
  //   // const player = players.get(socket.id);
  //   // if (!player || player.disabled || (gameState !== 'ACTIVE' && gameState !== 'WINDOW_OPEN')) return;
  //   const player = players.get(socket.id);
  //   // ADD 'BATTLE' TO THIS LINE:
  //   if (!player || player.disabled || (gameState !== 'ACTIVE' && gameState !== 'WINDOW_OPEN' && gameState !== 'BATTLE')) return;

  //   const buzzTime = Date.now();
  //   const offset = buzzTime - startTime;

  //   if (buzzes.find(b => b.playerId === socket.id)) return;

  //   if (gameState === 'ACTIVE') {
  //     gameState = 'WINDOW_OPEN';
  //     windowTimer = setTimeout(() => {
  //       gameState = 'LOCKED';
  //       io.emit('gameStateUpdate', { state: 'LOCKED', buzzes });
  //     }, config.game.buzzerWindowMs);
  //   }

  //   const rank = buzzes.length + 1;
  //   const buzzRecord = { playerId: socket.id, playerName: player.name, timestamp: buzzTime, offset, rank };
  //   buzzes.push(buzzRecord);

  //   // --- THE BRIDGE SIGNAL ---
  //   if (rank === 1) {
  //     // This sends the message to BOTH the Buzzer Master Control 
  //     // AND your Music Game App (because they are both 'hosts')
  //     io.to('host-room').emit('firstBuzzDetected', {
  //       winnerName: player.name,
  //       playerId: socket.id
  //     });

  //     // Turn everyone's button gray immediately
  //     gameState = 'LOCKED';
  //     io.emit('gameStateUpdate', { state: 'LOCKED', buzzes });
  //   }
  //   // -------------------------



  //   socket.emit('buzzResult', { rank, offset });
  //   io.to('host-room').emit('liveBuzzUpdate', buzzes);
  // });

  socket.on('buzz', () => {
    const player = players.get(socket.id);

    // 🔍 DEBUG LOG: This will show up in your terminal
    console.log(`[BUZZ_ATTEMPT] From: ${player?.name}. Current Server State: ${gameState}`);

    // 🔴 THE FIX: You must add 'BATTLE' here. 
    // If gameState is 'BATTLE' and it's not in this list, the code STOPS here.
    if (!player || player.disabled || (gameState !== 'ACTIVE' && gameState !== 'WINDOW_OPEN' && gameState !== 'BATTLE')) {
      console.log("❌ BUZZ REJECTED: State mismatch or player disabled.");
      return;
    }

    // Prevent same player from buzzing twice
    if (buzzes.find(b => b.playerId === socket.id)) return;

    const rank = buzzes.length + 1;
    buzzes.push({ playerId: socket.id, playerName: player.name, rank });

    if (rank === 1) {
      console.log(`✅ SUCCESS: ${player.name} is the winner!`);

      // 1. TELL THE PHONES TO TURN GRAY (The Buzz App logic)
      gameState = 'LOCKED';
      io.emit('gameStateUpdate', { state: 'LOCKED', buzzes });

      // 2. TELL THE GAME APP TO STOP MUSIC (The Music App bridge)
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