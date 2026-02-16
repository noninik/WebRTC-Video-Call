const joinScreen = document.getElementById('join-screen');
const callScreen = document.getElementById('call-screen');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const randomBtn = document.getElementById('random-btn');
const statusText = document.getElementById('status-text');
const callStatus = document.getElementById('call-status');
const roomDisplay = document.getElementById('room-display');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const toggleMic = document.getElementById('toggle-mic');
const toggleCam = document.getElementById('toggle-cam');
const hangUp = document.getElementById('hang-up');

let ws;
let pc;
let localStream;
let micOn = true;
let camOn = true;

// STUN/TURN серверы — бесплатные
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ]
};

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// WebSocket подключение
function connectWS(room) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', room }));
    statusText.textContent = 'Подключение к комнате...';
  };

  ws.onmessage = async (e) => {
    const msg = JSON.parse(e.data);

    switch (msg.type) {
      case 'waiting':
        callStatus.textContent = '⏳ Ждём второго участника...';
        break;

      case 'full':
        statusText.textContent = '❌ Комната заполнена (макс. 2)';
        ws.close();
        return;

      case 'ready':
        callStatus.textContent = '🔗 Соединяемся...';
        if (msg.initiator) {
          createPeer(true);
        }
        break;

      case 'offer':
        if (!pc) createPeer(false);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', sdp: answer }));
        break;

      case 'answer':
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        break;

      case 'candidate':
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (err) {
            console.log('ICE candidate error:', err);
          }
        }
        break;

      case 'peer-left':
        callStatus.textContent = '😔 Собеседник отключился';
        remoteVideo.srcObject = null;
        if (pc) {
          pc.close();
          pc = null;
        }
        break;
    }
  };

  ws.onclose = () => {
    console.log('WS closed');
  };

  ws.onerror = (err) => {
    console.error('WS error:', err);
    statusText.textContent = '❌ Ошибка подключения';
  };
}

// Создаём RTCPeerConnection
async function createPeer(isInitiator) {
  pc = new RTCPeerConnection(config);

  // Добавляем локальные треки
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Получаем удалённый стрим
  pc.ontrack = (event) => {
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      callStatus.textContent = '✅ Подключено!';
    }
  };

  // ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'connected') {
      callStatus.textContent = '✅ Подключено!';
    } else if (pc.iceConnectionState === 'disconnected') {
      callStatus.textContent = '⚠️ Соединение прервано...';
    } else if (pc.iceConnectionState === 'failed') {
      callStatus.textContent = '❌ Не удалось соединиться';
    }
  };

  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'offer', sdp: offer }));
  }
}

// Получаем камеру/микрофон
async function getMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    localVideo.srcObject = localStream;
    return true;
  } catch (err) {
    // Пробуем только аудио
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true
      });
      localVideo.srcObject = localStream;
      camOn = false;
      toggleCam.textContent = '🚫';
      toggleCam.classList.add('muted-btn');
      return true;
    } catch (err2) {
      statusText.textContent = '❌ Нет доступа к камере/микрофону';
      return false;
    }
  }
}

// Вход в комнату
async function joinRoom(room) {
  if (!room.trim()) {
    statusText.textContent = 'Введите ID комнаты';
    return;
  }

  statusText.textContent = 'Запрашиваем камеру...';
  const ok = await getMedia();
  if (!ok) return;

  joinScreen.classList.add('hidden');
  callScreen.classList.remove('hidden');
  roomDisplay.textContent = `Комната: ${room}`;

  connectWS(room.trim());
}

// Кнопки
joinBtn.addEventListener('click', () => joinRoom(roomInput.value));

roomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom(roomInput.value);
});

randomBtn.addEventListener('click', () => {
  const id = generateId();
  roomInput.value = id;
  joinRoom(id);
});

toggleMic.addEventListener('click', () => {
  if (!localStream) return;
  micOn = !micOn;
  localStream.getAudioTracks().forEach((t) => (t.enabled = micOn));
  toggleMic.textContent = micOn ? '🎤' : '🔇';
  toggleMic.classList.toggle('muted-btn', !micOn);
});

toggleCam.addEventListener('click', () => {
  if (!localStream) return;
  camOn = !camOn;
  localStream.getVideoTracks().forEach((t) => (t.enabled = camOn));
  toggleCam.textContent = camOn ? '📷' : '🚫';
  toggleCam.classList.toggle('muted-btn', !camOn);
});

hangUp.addEventListener('click', () => {
  if (pc) {
    pc.close();
    pc = null;
  }
  if (ws) {
    ws.close();
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
  }
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;

  callScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
  statusText.textContent = '';
  micOn = true;
  camOn = true;
  toggleMic.textContent = '🎤';
  toggleCam.textContent = '📷';
  toggleMic.classList.remove('muted-btn');
  toggleCam.classList.remove('muted-btn');
});
