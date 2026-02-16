const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const MAX_USERS = 8;

// rooms: roomId -> Map<odString, ws>
const rooms = new Map();

let idCounter = 0;

wss.on('connection', (ws) => {
  const odString = String(++idCounter);
  let currentRoom = null;

  ws.odString = odString;

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    // Вход в комнату
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

      // Сообщаем новому участнику список всех кто уже в комнате
      const existingUsers = [];
      room.forEach((peer, odString) => {
        existingUsers.push(odString);
      });

      // Добавляем нового
      room.set(odString, ws);

      // Отправляем новому его id и список существующих
      ws.send(JSON.stringify({
        type: 'joined',
        odString: odString,
        users: existingUsers
      }));

      // Сообщаем всем остальным что зашёл новый
      room.forEach((peer, peerodString) => {
        if (peerodString !== odString && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({
            type: 'user-joined',
            odString: odString
          }));
        }
      });

      return;
    }

    // Пересылка сигналов конкретному пиру
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

      // Сообщаем всем что участник ушёл
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
