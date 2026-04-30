// VTT Platform — WSS smoke probe (Step 6 of the 8-step flow).
// Bible §2.14 (Process View) row "Synchronous Dice Roll" / event `dice:roll`.
//
// Usage:
//   node infra/smoke/socket-smoke.mjs <accessToken> <roomId> [wssUrl]
//
// Defaults wssUrl to https://vtt-server.onrender.com (socket.io upgrades to WS).

import { io } from 'socket.io-client';

const [, , accessToken, roomId, wssUrl = 'https://vtt-server.onrender.com'] =
  process.argv;

if (!accessToken || !roomId) {
  console.error(
    'Usage: node socket-smoke.mjs <accessToken> <roomId> [wssUrl]',
  );
  process.exit(1);
}

const socket = io(wssUrl, {
  transports: ['websocket'],
  auth: { token: accessToken },
});

socket.on('connect', () => {
  console.log(`[ok] connected as ${socket.id} → joining room ${roomId}`);
  socket.emit('room:join', { roomId });
});

socket.on('room:joined', () => {
  console.log('[ok] room joined → emitting dice:roll 2d20kh1+5');
  socket.emit('dice:roll', {
    roomId,
    expression: '2d20kh1+5',
    mode: 'normal',
  });
});

socket.on('dice:rolled', (payload) => {
  console.log('[ok] dice:rolled →', JSON.stringify(payload));
  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('[fail] connect_error:', err.message);
  process.exit(2);
});

setTimeout(() => {
  console.error('[fail] timeout 10s — no dice:rolled received');
  process.exit(3);
}, 10_000);
