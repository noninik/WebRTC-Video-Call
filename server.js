const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const MAX_USERS = 8;
const rooms = new Map();
let idCounter = 0;

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws) => {
  const odString = String(++idCounter);
  let currentRoom = null;

  ws.odString = odString;
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === 'join') {
      currentRoom = msg.room;

      if (!rooms.has(currentRoom)) {
        rooms.set(currentRoom, new Map());
      }

      const room = rooms.get(currentRoom);

      if (room.size >= MAX_USERS) {
        ws.send(JSON.stringify({ type: 'full' }));
        currentRoom = null;
        return;
      }

      const existingUsers = [];
      room.forEach((peer, odStr) => {
        existingUsers.push(odStr);
      });

      room.set(odString, ws);

      ws.send(JSON.stringify({
        type: 'joined',
        odString: odString,
        users: existingUsers
      }));

      room.forEach((peer, peerOd) => {
        if (peerOd !== odString && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({
            type: 'user-joined',
            odString: odString
          }));
        }
      });

      return;
    }

    if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'candidate') {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom);
        const target = room.get(msg.target);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({
            type: msg.type,
            sdp: msg.sdp,
            candidate: msg.candidate,
            from: odString
          }));
        }
      }
      return;
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.delete(odString);

      room.forEach((peer) => {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({
            type: 'user-left',
            odString: odString
          }));
        }
      });

      if (room.size === 0) {
        rooms.delete(currentRoom);
      }
    }
  });
});

// Пинг каждые 25 секунд чтобы соединение не умирало
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

wss.on('close', () => {
  clearInterval(interval);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
