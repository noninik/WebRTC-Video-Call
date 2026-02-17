const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
let idCounter = 0;

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws) => {
  const odStr = String(++idCounter);
  let currentRoom = null;
  let nickname = 'User ' + odStr;

  ws.odStr = odStr;
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'join': {
        currentRoom = (msg.room || '').trim().toUpperCase();
        nickname = (msg.nickname || '').trim().slice(0, 20) || 'User ' + odStr;

        if (!currentRoom) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room code required' }));
          return;
        }

        if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Map());
        const room = rooms.get(currentRoom);

        if (room.size >= 2) {
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
          odStr,
          nickname,
          users: existingUsers,
          isCreator: existingUsers.length === 0
        }));

        room.forEach((peer, peerId) => {
          if (peerId !== odStr && peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({
              type: 'user-joined',
              odStr,
              nickname
            }));
          }
        });
        break;
      }

      case 'offer':
      case 'answer':
      case 'candidate': {
        if (currentRoom && rooms.has(currentRoom)) {
          const room = rooms.get(currentRoom);
          const target = msg.target ? room.get(msg.target) : null;

          if (target && target.readyState === WebSocket.OPEN) {
            target.send(JSON.stringify({
              type: msg.type,
              sdp: msg.sdp,
              candidate: msg.candidate,
              from: odStr
            }));
          } else {
            // broadcast to all others in room
            room.forEach((peer, peerId) => {
              if (peerId !== odStr && peer.readyState === WebSocket.OPEN) {
                peer.send(JSON.stringify({
                  type: msg.type,
                  sdp: msg.sdp,
                  candidate: msg.candidate,
                  from: odStr
                }));
              }
            });
          }
        }
        break;
      }

      case 'chat': {
        if (currentRoom && rooms.has(currentRoom)) {
          const room = rooms.get(currentRoom);
          const time = Date.now();
          room.forEach((peer, peerId) => {
            if (peer.readyState === WebSocket.OPEN) {
              peer.send(JSON.stringify({
                type: 'chat',
                from: odStr,
                nickname,
                text: (msg.text || '').slice(0, 2000),
                time,
                self: peerId === odStr
              }));
            }
          });
        }
        break;
      }

      case 'reaction': {
        if (currentRoom && rooms.has(currentRoom)) {
          const room = rooms.get(currentRoom);
          room.forEach((peer) => {
            if (peer.readyState === WebSocket.OPEN) {
              peer.send(JSON.stringify({
                type: 'reaction',
                from: odStr,
                nickname,
                emoji: (msg.emoji || '').slice(0, 4)
              }));
            }
          });
        }
        break;
      }

      default:
        break;
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
            odStr,
            nickname
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
server.listen(PORT, () => console.log('Server running on port ' + PORT));
