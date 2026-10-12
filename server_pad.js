import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, 'ports.json');
const SERVER_CONFIG_FILE = path.join(__dirname, 'config.json');
const PORT = process.env.PORT || 3001;

// Load Server Config / Admin Password
let serverConfig = { hostPassword: "admin" };
if (fs.existsSync(SERVER_CONFIG_FILE)) {
  try {
    serverConfig = JSON.parse(fs.readFileSync(SERVER_CONFIG_FILE, 'utf8'));
  } catch (e) {}
}

// Native Node HTTP Server (No Express)
const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('NovaPad Pro Engine Online');
});

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- STATE MANAGEMENT ---
let gameState = 'IDLE';       // IDLE, ACTIVE, DISARMED, LOCKED
let isArmed = false;          // Controls whether new rounds can start accepting buzzes
let currentLanguage = 'EN';
let startTime = 0;
let lastArmTime = 0;         // Timestamp filter for pre-arm stream buffer flushing
let photoFinishDeadline = 0;  // Timestamp marking the end of the 2-second photo-finish window
let buzzes = [];              // Array storing all buzz records for the current round

const lastPortBuzzTime = new Map(); // Debounce map per port
const hardwarePorts = new Map();    // Active port mappings

const playerLookup = new Map([
  ['p1', { id: 'p1', name: 'Player 1', assignedPortId: 1, disabled: false, manualId: 1 }],
  ['p2', { id: 'p2', name: 'Player 2', assignedPortId: 2, disabled: false, manualId: 2 }],
  ['p3', { id: 'p3', name: 'Player 3', assignedPortId: 3, disabled: false, manualId: 3 }]
]);

let calibrationTargetPlayerId = null;

// --- PERSISTENCE ---
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach(p => {
          if (playerLookup.has(p.id)) {
            const player = playerLookup.get(p.id);
            player.name = p.name || player.name;
            player.assignedPortId = p.assignedPortId ?? player.assignedPortId;
            player.disabled = p.disabled ?? false;
          }
        });
      }
    } catch (e) {}
  }
}

function saveConfig() {
  try {
    const serialized = Array.from(playerLookup.values()).map(p => ({
      id: p.id,
      name: p.name,
      assignedPortId: p.assignedPortId,
      disabled: p.disabled
    }));
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(serialized, null, 2));
  } catch (e) {}
}

loadConfig();

function getPlayerList() {
  return Array.from(playerLookup.values()).map(p => {
    let isConnected = false;
    for (const [_, portObj] of hardwarePorts.entries()) {
      if (portObj.portId === p.assignedPortId && portObj.connected) {
        isConnected = true;
        break;
      }
    }
    return {
      id: p.id,
      name: p.name,
      disabled: p.disabled,
      connected: isConnected,
      manualId: p.manualId,
      assignedPortId: p.assignedPortId,
      ready: isConnected && !p.disabled
    };
  });
}

function getActivePortIds() {
  return Array.from(hardwarePorts.values())
    .filter(p => p.connected)
    .map(p => p.portId);
}

function broadcastStatus() {
  io.emit('playerListUpdate', getPlayerList());
  io.emit('activePortsUpdate', getActivePortIds());
}

// --- HAPTIC FEEDBACK (PYTHON RUMBLE UTILITY BRIDGING) ---
function triggerRumble(portId, durationMs) {
  for (const [_, portObj] of hardwarePorts.entries()) {
    if (portObj.portId === portId && portObj.eventPath) {
      console.log(`📳 [RUMBLE] Port ${portId} (${portObj.eventPath}) -> ${durationMs}ms`);
      exec(`sudo python3 rumble.py ${portObj.eventPath} ${durationMs}`, (err) => {
        if (err) console.error(`⚠️ [RUMBLE_ERR]:`, err.message);
      });
    }
  }
}

function rumbleAllPads(durationMs) {
  for (const portObj of hardwarePorts.values()) {
    if (portObj.connected) {
      triggerRumble(portObj.portId, durationMs);
    }
  }
}

// --- DIRECT BINARY STREAM BINDING WITH EVDEV EVENT NODES ---
async function scanAndBindHardware() {
  try {
    const HARDWARE_DEVICES = [
      { slot: 1, jsPath: '/dev/input/js0', eventPath: '/dev/input/event19' },
      { slot: 2, jsPath: '/dev/input/js1', eventPath: '/dev/input/event20' },
      { slot: 3, jsPath: '/dev/input/js2', eventPath: '/dev/input/event21' }
    ];

    HARDWARE_DEVICES.forEach(({ slot, jsPath, eventPath }) => {
      if (fs.existsSync(jsPath) && !hardwarePorts.has(jsPath)) {
        try {
          const stream = fs.createReadStream(jsPath, { highWaterMark: 8 });

          hardwarePorts.set(jsPath, {
            portId: slot,
            path: jsPath,
            eventPath,
            handle: stream,
            connected: true
          });

          console.log(`🎮 [HARDWARE BOUND] Stream: ${jsPath} | Event: ${eventPath} -> Port ${slot}`);

          stream.on('data', (chunk) => {
            // Linux Joystick Event Struct is 8 Bytes
            for (let i = 0; i < chunk.length; i += 8) {
              if (i + 8 > chunk.length) break;

              const value = chunk.readInt16LE(i + 4); // 1 = Press, 0 = Release
              const type = chunk.readUInt8(i + 6);     // 1 = Button Event (JS_EVENT_BUTTON)

              if (type === 1 && value === 1) {
                const now = Date.now();
                if (now > lastArmTime) {
                  handlePhysicalBuzz(slot);
                }
              }
            }
          });

          stream.on('error', () => closePort(jsPath));
        } catch (e) {}
      }
    });

    broadcastStatus();
  } catch (err) {}
}

function closePort(pathStr) {
  const portObj = hardwarePorts.get(pathStr);
  if (portObj) {
    if (portObj.handle?.destroy) try { portObj.handle.destroy(); } catch (e) {}
    hardwarePorts.delete(pathStr);
  }
  broadcastStatus();
}

setInterval(scanAndBindHardware, 2000);

// --- PHYSICAL BUZZ HANDLER WITH 2-SECOND PHOTO-FINISH & RUMBLE ---
function handlePhysicalBuzz(triggeredPortId) {
  const now = Date.now();

  // 1. Check if we are inside an active round OR within the 2-second photo-finish window
  const isFirstBuzz = isArmed && gameState === 'ACTIVE';
  const inPhotoFinishWindow = !isArmed && photoFinishDeadline > 0 && now <= photoFinishDeadline;

  if (!isFirstBuzz && !inPhotoFinishWindow) {
    return;
  }

  // 2. Debounce hardware chatter (150ms per port)
  const lastBuzz = lastPortBuzzTime.get(triggeredPortId) || 0;
  if (now - lastBuzz < 150) return;
  lastPortBuzzTime.set(triggeredPortId, now);

  // 3. Handle Press-to-Bind Calibration mode
  if (calibrationTargetPlayerId) {
    const p = playerLookup.get(calibrationTargetPlayerId);
    if (p) {
      let isOccupied = false;
      for (const [otherId, otherP] of playerLookup.entries()) {
        if (otherId !== calibrationTargetPlayerId && otherP.assignedPortId === triggeredPortId) {
          isOccupied = true;
          break;
        }
      }

      if (!isOccupied) {
        p.assignedPortId = triggeredPortId;
        console.log(`🎯 [CALIBRATED] ${p.name} bound to Port ${triggeredPortId}`);
        saveConfig();
        io.emit('calibrationComplete', { playerId: p.id, portId: triggeredPortId });
      } else {
        console.log(`⚠️ [CALIBRATION_REJECTED] Port ${triggeredPortId} is already occupied.`);
      }

      calibrationTargetPlayerId = null;
      broadcastStatus();
      return;
    }
  }

  // 4. Identify player assigned to this port
  let player = null;
  for (const p of playerLookup.values()) {
    if (p.assignedPortId === triggeredPortId) {
      player = p;
      break;
    }
  }

  if (!player || player.disabled) return;

  // 5. Prevent duplicate buzzes from the same player in the same round
  if (buzzes.some(b => b.playerId === player.id)) {
    return;
  }

  const offsetFromStart = startTime > 0 ? (now - startTime) : 0;

  // 6. First Buzz vs Photo-Finish Follow-Up Processing
  if (isFirstBuzz) {
    // 🔒 Disarm initial buzz listener, open 2-second photo-finish window
    isArmed = false;
    gameState = 'DISARMED';
    photoFinishDeadline = now + 2000; // ⏱️ Open 2000ms photo-finish capture window

    const winnerRecord = {
      playerId: player.id,
      playerName: player.name,
      rank: 1,
      offset: offsetFromStart,
      deltaFromWinner: 0
    };

    buzzes = [winnerRecord];

    // 🏆 TRIGGER 1-SECOND (1000ms) RUMBLE ON WINNER'S PAD
    triggerRumble(triggeredPortId, 2000);

    console.log(`🔒 [WINNER CAPTURED] ${player.name} (+${offsetFromStart}ms). 1000ms rumble sent.`);

    io.emit('gameStateUpdate', { state: 'DISARMED', buzzes });
    io.to('host-room').emit('firstBuzzDetected', winnerRecord);
    io.emit('liveBuzzUpdate', buzzes);

    // Set automatic timer to lock the photo-finish window after 2 seconds
    setTimeout(() => {
      if (gameState === 'DISARMED' && photoFinishDeadline > 0) {
        gameState = 'LOCKED';
        photoFinishDeadline = 0;
        console.log(`📸 [PHOTO FINISH CLOSED] Total contenders registered: ${buzzes.length}`);
        io.emit('gameStateUpdate', { state: 'DISARMED', buzzes });
        io.emit('liveBuzzUpdate', buzzes);
      }
    }, 2000);

  } else if (inPhotoFinishWindow) {
    // 📸 Register secondary runner-up within the 2-second window
    const winnerOffset = buzzes[0]?.offset || 0;
    const delta = offsetFromStart - winnerOffset;

    const runnerUpRecord = {
      playerId: player.id,
      playerName: player.name,
      rank: buzzes.length + 1,
      offset: offsetFromStart,
      deltaFromWinner: delta
    };

    buzzes.push(runnerUpRecord);

    console.log(`📸 [PHOTO FINISH CAPTURE] Rank #${runnerUpRecord.rank}: ${player.name} (+${delta}ms behind winner)`);

    io.emit('gameStateUpdate', { state: 'DISARMED', buzzes });
    io.emit('liveBuzzUpdate', buzzes);
  }
}

// --- SOCKET CONTRACT WITH HOST AUTH ---
io.on('connection', (socket) => {

  socket.on('register', (data) => {
    const role = data?.role || 'host';
    const password = data?.password || '';

    if (role === 'host') {
      const expectedPassword = serverConfig.hostPassword || 'admin';
      if (password !== expectedPassword && serverConfig.hostPassword) {
        socket.emit('registered', { success: false, error: 'INCORRECT_HOST_PASSWORD' });
        return;
      }

      socket.join('host-room');
      socket.emit('registered', { success: true, role: 'host', language: currentLanguage });
      socket.emit('gameStateUpdate', { state: gameState, buzzes });
      broadcastStatus();
    }
  });

  socket.on('gameAction', ({ type, data }) => {
    switch (type) {
      case 'START_ROUND':
        isArmed = true;               // Re-arm hardware for initial buzz
        gameState = 'ACTIVE';         // Set active state
        buzzes = [];                  // Wipe photo-finish log
        startTime = Date.now();
        lastArmTime = Date.now();     // Flush pre-arm stream buffers
        photoFinishDeadline = 0;     // Reset photo-finish deadline

        // ⚡ SHORT RUMBLE TICK (100ms) TO ALL CONNECTED PADS ON ARM
        rumbleAllPads(1000);

        console.log('⚡ [SYSTEM ARMED] Ready for round start. 100ms ARM tick sent to all pads.');
        io.emit('gameStateUpdate', { state: 'ACTIVE', startTime, buzzes: [] });
        io.emit('liveBuzzUpdate', []);
        break;

      case 'RESET':
        isArmed = false;              // Disarm system
        gameState = 'IDLE';
        buzzes = [];
        startTime = 0;
        photoFinishDeadline = 0;
        console.log('🛑 [SYSTEM RESET] Inputs disarmed and photo-finish window closed.');
        io.emit('gameStateUpdate', { state: 'IDLE', buzzes: [] });
        io.emit('liveBuzzUpdate', []);
        break;

      case 'TOGGLE_PAUSE':
        if (data?.id && playerLookup.has(data.id)) {
          const p = playerLookup.get(data.id);
          p.disabled = !p.disabled;
          saveConfig();
          broadcastStatus();
        }
        break;

      case 'UPDATE_PLAYER':
        if (data?.id && playerLookup.has(data.id)) {
          const p = playerLookup.get(data.id);
          p.name = data.newName || p.name;
          saveConfig();
          broadcastStatus();
        }
        break;

      case 'START_CALIBRATION':
        if (data?.playerId && playerLookup.has(data.playerId)) {
          calibrationTargetPlayerId = data.playerId;
          io.emit('calibrationStarted', { playerId: data.playerId });
        }
        break;

      case 'REASSIGN_PORT':
        if (data?.playerId && playerLookup.has(data.playerId)) {
          const targetPort = parseInt(data.portId, 10);
          const requestingPlayerId = data.playerId;

          if (targetPort === 0) {
            playerLookup.get(requestingPlayerId).assignedPortId = 0;
            saveConfig();
            broadcastStatus();
            break;
          }

          let isOccupied = false;
          for (const [otherId, p] of playerLookup.entries()) {
            if (otherId !== requestingPlayerId && p.assignedPortId === targetPort) {
              isOccupied = true;
              break;
            }
          }

          if (!isOccupied) {
            playerLookup.get(requestingPlayerId).assignedPortId = targetPort;
            saveConfig();
          }

          broadcastStatus();
        }
        break;
    }
  });
});

// --- FULL INTERACTIVE TERMINAL SIMULATOR ---
if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  console.log('\n==================================================');
  console.log('🎮 NOVAPAD PRO — FULL TERMINAL SIMULATOR');
  console.log('--------------------------------------------------');
  console.log('  [1] [2] [3]   -> Buzz Port 1, 2, or 3');
  console.log('  [SPACE] / [A] -> ARM system (100ms rumble tick to all)');
  console.log('  [R]           -> RESET system to IDLE');
  console.log('  [F1] [F2] [F3]-> Toggle Disable/Pause for P1, P2, P3');
  console.log('  [C]           -> Clear Console Log');
  console.log('  [CTRL+C]      -> Exit Server');
  console.log('==================================================\n');

  process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
      process.exit();
    }

    // --- BUZZ TRIGGERS ---
    if (str === '1') handlePhysicalBuzz(1);
    if (str === '2') handlePhysicalBuzz(2);
    if (str === '3') handlePhysicalBuzz(3);

    // --- ARM & RESET ROUNDS ---
    if (str === 'a' || key.name === 'space') {
      isArmed = true;
      gameState = 'ACTIVE';
      buzzes = [];
      startTime = Date.now();
      lastArmTime = Date.now();
      photoFinishDeadline = 0;

      // ⚡ SHORT TICK TO ALL PADS ON TERMINAL ARM
      rumbleAllPads(1000);

      console.log('⚡ [SIMULATOR] Round Armed (ACTIVE). Ready for buzzes!');
      io.emit('gameStateUpdate', { state: 'ACTIVE', startTime, buzzes: [] });
      io.emit('liveBuzzUpdate', []);
    }

    if (str === 'r') {
      isArmed = false;
      gameState = 'IDLE';
      buzzes = [];
      startTime = 0;
      photoFinishDeadline = 0;

      console.log('🛑 [SIMULATOR] System Reset to IDLE.');
      io.emit('gameStateUpdate', { state: 'IDLE', buzzes: [] });
      io.emit('liveBuzzUpdate', []);
    }

    // --- TOGGLE PLAYER DISABLE/PAUSE ---
    const togglePlayerPause = (playerId) => {
      if (playerLookup.has(playerId)) {
        const p = playerLookup.get(playerId);
        p.disabled = !p.disabled;
        saveConfig();
        console.log(`⏸️ [SIMULATOR] ${p.name} is now ${p.disabled ? 'DISABLED 🔴' : 'ENABLED 🟢'}`);
        broadcastStatus();
      }
    };

    if (key.name === 'f1') togglePlayerPause('p1');
    if (key.name === 'f2') togglePlayerPause('p2');
    if (key.name === 'f3') togglePlayerPause('p3');

    // --- CLEAR CONSOLE ---
    if (str === 'c') {
      console.clear();
      console.log('✨ Console cleared. Press 1, 2, 3 to buzz, SPACE to ARM, R to reset.');
    }
  });
}

// --- START SERVER ---
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 NovaPad Engine online at http://0.0.0.0:${PORT}`);
  scanAndBindHardware();
});