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

function heartbeat() { this.isAlive = true; }

wss.on('connection', (ws) => {
  const odStr = String(++idCounter);
  let currentRoom = null;
  let nickname = 'User ' + odStr;

  ws.odStr = odStr;
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'join') {
      currentRoom = msg.room;
      nickname = (msg.nickname || '').trim().slice(0, 20) || 'User ' + odStr;

      if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Map());
      const room = rooms.get(currentRoom);

      if (room.size >= MAX_USERS) {
        ws.send(JSON.stringify({ type: 'full' }));
        currentRoom = null;
        return;
      }

      const existingUsers = [];
      room.forEach((peer, peerId) => {
        existingUsers.push({ odStr: peerId, nickname: peer.nickname });
      });

      ws.nickname = nickname;
      room.set(odStr, ws);

      ws.send(JSON.stringify({
        type: 'joined',
        odStr: odStr,
        nickname: nickname,
        users: existingUsers
      }));

      room.forEach((peer, peerId) => {
        if (peerId !== odStr && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({
            type: 'user-joined',
            odStr: odStr,
            nickname: nickname
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
            from: odStr
          }));
        }
      }
      return;
    }

    if (msg.type === 'chat') {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom);
        const time = Date.now();
        room.forEach((peer, peerId) => {
          if (peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({
              type: 'chat',
              from: odStr,
              nickname: nickname,
              text: (msg.text || '').slice(0, 2000),
              gif: msg.gif || null,
              time: time,
              self: peerId === odStr
            }));
          }
        });
      }
      return;
    }

    if (msg.type === 'reaction') {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom);
        room.forEach((peer, peerId) => {
          if (peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({
              type: 'reaction',
              from: odStr,
              nickname: nickname,
              emoji: (msg.emoji || '').slice(0, 4)
            }));
          }
        });
      }
      return;
    }

    if (msg.type === 'typing') {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom);
        room.forEach((peer, peerId) => {
          if (peerId !== odStr && peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({
              type: 'typing',
              from: odStr,
              nickname: nickname
            }));
          }
        });
      }
      return;
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.delete(odStr);

      room.forEach((peer) => {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({
            type: 'user-left',
            odStr: odStr,
            nickname: nickname
          }));
        }
      });

      if (room.size === 0) rooms.delete(currentRoom);
    }
  });
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

wss.on('close', () => clearInterval(interval));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server on port ' + PORT));
