const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// Комнаты: roomId -> Set<ws>
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;

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
        rooms.set(currentRoom, new Set());
      }
      const room = rooms.get(currentRoom);

      if (room.size >= 2) {
        ws.send(JSON.stringify({ type: 'full' }));
        currentRoom = null;
        return;
      }

      room.add(ws);

      // Если уже есть кто-то в комнате — сообщаем новому что можно начинать
      if (room.size === 2) {
        ws.send(JSON.stringify({ type: 'ready', initiator: true }));
      } else {
        ws.send(JSON.stringify({ type: 'waiting' }));
      }
      return;
    }

    // Пересылаем offer/answer/candidate другому участнику комнаты
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.forEach((peer) => {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify(msg));
        }
      });
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.delete(ws);

      // Сообщаем оставшемуся что пир ушёл
      room.forEach((peer) => {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: 'peer-left' }));
        }
      });

      if (room.size === 0) {
        rooms.delete(currentRoom);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
