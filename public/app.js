// ============ DOM ELEMENTS ============
const joinScreen = document.getElementById('join-screen');
const callScreen = document.getElementById('call-screen');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const randomBtn = document.getElementById('random-btn');
const statusText = document.getElementById('status-text');
const callStatus = document.getElementById('call-status');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const hangUp = document.getElementById('hang-up');
const volumeSlider = document.getElementById('volume-slider');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const micSelect = document.getElementById('mic-select');
const speakerSelect = document.getElementById('speaker-select');
const camSelect = document.getElementById('cam-select');
const micVolume = document.getElementById('mic-volume');
const micVolumeLabel = document.getElementById('mic-volume-label');
const noiseToggle = document.getElementById('noise-toggle');
const echoToggle = document.getElementById('echo-toggle');
const agcToggle = document.getElementById('agc-toggle');
const micLevel = document.getElementById('mic-level');

const localOverlay = document.getElementById('local-overlay');
const remoteOverlay = document.getElementById('remote-overlay');
const localSpeaking = document.getElementById('local-speaking');
const remoteSpeaking = document.getElementById('remote-speaking');
const userRemote = document.getElementById('user-remote');
const connectionQuality = document.getElementById('connection-quality');
const indicatorMic = document.getElementById('indicator-mic');
const indicatorCam = document.getElementById('indicator-cam');
const sidebarRoom = document.getElementById('sidebar-room');
const topRoomName = document.getElementById('top-room-name');

const toggleMicBtns = [document.getElementById('toggle-mic'), document.getElementById('toggle-mic-2')];
const toggleCamBtns = [document.getElementById('toggle-cam'), document.getElementById('toggle-cam-2')];
const toggleScreenBtns = [document.getElementById('toggle-screen'), document.getElementById('toggle-screen-2')];
const toggleNoiseBtn = document.getElementById('toggle-noise');
const togglePip = document.getElementById('toggle-pip');
const toggleFullscreen = document.getElementById('toggle-fullscreen');

// ============ STATE ============
let ws, localStream, screenStream;
let myId = null;
let micOn = true, camOn = true, screenOn = false, noiseOn = true;
let monitorCtx, analyser, animFrameId;

// Хранилище пиров: odString -> { pc, remoteStream }
const peers = new Map();

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

function setStatus(text) {
  callStatus.textContent = text;
}

// ============ VIDEO GRID ============
const videosContainer = document.getElementById('videos');

function createRemoteVideo(odString) {
  // Удаляем старый если есть
  removeRemoteVideo(odString);

  const container = document.createElement('div');
  container.className = 'video-container remote-video-box';
  container.id = 'video-box-' + odString;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.id = 'video-' + odString;
  video.volume = volumeSlider.value / 100;

  const overlay = document.createElement('div');
  overlay.className = 'video-overlay';
  overlay.id = 'overlay-' + odString;
  overlay.innerHTML = '<div class="no-video-avatar"><i class="fas fa-user"></i></div>';

  const nameTag = document.createElement('div');
  nameTag.className = 'video-name';
  nameTag.innerHTML = '<span>Участник ' + odString + '</span>';

  const speakDot = document.createElement('div');
  speakDot.className = 'speaking-indicator hidden';
  speakDot.id = 'speaking-' + odString;
  speakDot.innerHTML = '<i class="fas fa-volume-high"></i>';

  container.appendChild(video);
  container.appendChild(overlay);
  container.appendChild(nameTag);
  container.appendChild(speakDot);

  // Вставляем перед локальным видео
  const localContainer = document.getElementById('local-container');
  videosContainer.insertBefore(container, localContainer);

  updateVideoLayout();
  return video;
}

function removeRemoteVideo(odString) {
  const box = document.getElementById('video-box-' + odString);
  if (box) box.remove();
  updateVideoLayout();
}

function updateVideoLayout() {
  const remoteBoxes = videosContainer.querySelectorAll('.remote-video-box');
  const total = remoteBoxes.length;
  const localContainer = document.getElementById('local-container');

  if (total === 0) {
    // Нет удалённых — показываем заглушку
    remoteOverlay.classList.remove('hidden');
    const rc = document.getElementById('remote-container');
    if (rc) rc.classList.remove('hidden');
    localContainer.className = 'video-container local-small';
  } else if (total === 1) {
    // 1 собеседник — он большой, мы маленькие
    const rc = document.getElementById('remote-container');
    if (rc) rc.classList.add('hidden');
    remoteBoxes[0].classList.add('remote-main');
    remoteBoxes[0].classList.remove('remote-grid');
    localContainer.className = 'video-container local-small';
  } else {
    // 2+ собеседников — сетка
    const rc = document.getElementById('remote-container');
    if (rc) rc.classList.add('hidden');
    remoteBoxes.forEach((box) => {
      box.classList.remove('remote-main');
      box.classList.add('remote-grid');
    });
    localContainer.className = 'video-container remote-grid';
  }

  // Обновляем счётчик в сайдбаре
  updateSidebarUsers();
}

function updateSidebarUsers() {
  const count = peers.size;
  if (count > 0) {
    userRemote.classList.remove('hidden');
    userRemote.querySelector('span').textContent = count === 1 ? 'Друг' : `${count} участников`;
    connectionQuality.textContent = 'Подключено';
    connectionQuality.style.color = '#23a559';
  } else {
    userRemote.classList.add('hidden');
    connectionQuality.textContent = 'Ожидание...';
    connectionQuality.style.color = '';
  }
}

// ============ AUDIO MONITORING ============
function setupAudioMonitor(stream) {
  try {
    monitorCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = monitorCtx.createMediaStreamSource(stream);
    analyser = monitorCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    monitorMicLevel();
  } catch (e) {
    console.log('Audio monitor error:', e);
  }
}

function monitorMicLevel() {
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);

  function update() {
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    const pct = Math.min(100, (avg / 128) * 100);
    micLevel.style.width = pct + '%';

    if (pct > 10 && micOn) {
      localSpeaking.classList.remove('hidden');
    } else {
      localSpeaking.classList.add('hidden');
    }
    animFrameId = requestAnimationFrame(update);
  }
  update();
}

function monitorRemoteAudio(stream, odString) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const ra = ctx.createAnalyser();
    ra.fftSize = 256;
    source.connect(ra);

    const data = new Uint8Array(ra.frequencyBinCount);
    function check() {
      ra.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      const el = document.getElementById('speaking-' + odString);
      if (el) {
        if (avg > 8) el.classList.remove('hidden');
        else el.classList.add('hidden');
      }
      requestAnimationFrame(check);
    }
    check();
  } catch (e) {
    console.log('Remote audio monitor error:', e);
  }
}

// ============ DEVICE ENUMERATION ============
async function enumerateDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    micSelect.innerHTML = '';
    speakerSelect.innerHTML = '';
    camSelect.innerHTML = '';

    devices.forEach((device) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `${device.kind} (${device.deviceId.slice(0, 8)})`;
      if (device.kind === 'audioinput') micSelect.appendChild(option);
      else if (device.kind === 'audiooutput') speakerSelect.appendChild(option);
      else if (device.kind === 'videoinput') camSelect.appendChild(option);
    });

    if (speakerSelect.options.length === 0) {
      const opt = document.createElement('option');
      opt.text = 'Стандартный';
      speakerSelect.appendChild(opt);
    }
  } catch (e) {
    console.log('Enumerate error:', e);
  }
}

// ============ GET MEDIA ============
async function getMedia() {
  const constraints = {
    video: true,
    audio: {
      noiseSuppression: noiseToggle.checked,
      echoCancellation: echoToggle.checked,
      autoGainControl: agcToggle.checked,
    }
  };

  try {
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
    setupAudioMonitor(localStream);
    await enumerateDevices();
    return true;
  } catch (err) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      localVideo.srcObject = localStream;
      camOn = false;
      updateCamUI();
      localOverlay.classList.remove('hidden');
      setupAudioMonitor(localStream);
      await enumerateDevices();
      return true;
    } catch (err2) {
      statusText.textContent = '❌ Нет доступа к камере/микрофону';
      return false;
    }
  }
}

// ============ PEER CONNECTION ============
function createPeerConnection(remoteId, isInitiator) {
  const pc = new RTCPeerConnection(config);

  peers.set(remoteId, { pc, remoteStream: null });

  // Добавляем свои треки
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Получаем удалённые треки
  pc.ontrack = (event) => {
    const peerData = peers.get(remoteId);
    if (peerData && !peerData.remoteStream) {
      peerData.remoteStream = event.streams[0];
      const videoEl = createRemoteVideo(remoteId);
      videoEl.srcObject = event.streams[0];

      const overlay = document.getElementById('overlay-' + remoteId);
      if (overlay) overlay.classList.add('hidden');

      monitorRemoteAudio(event.streams[0], remoteId);
      setStatus('✅ Подключено! Участников: ' + peers.size);
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'candidate',
        candidate: event.candidate,
        target: remoteId
      }));
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (!pc) return;
    const state = pc.iceConnectionState;
    if (state === 'failed' || state === 'closed') {
      console.log(`Peer ${remoteId} ICE: ${state}`);
    }
  };

  if (isInitiator) {
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        ws.send(JSON.stringify({
          type: 'offer',
          sdp: pc.localDescription,
          target: remoteId
        }));
      });
  }

  return pc;
}

function removePeer(odString) {
  const peerData = peers.get(odString);
  if (peerData) {
    peerData.pc.close();
    peers.delete(odString);
  }
  removeRemoteVideo(odString);
  updateSidebarUsers();

  if (peers.size === 0) {
    setStatus('⏳ Ждём участников...');
  } else {
    setStatus('✅ Подключено! Участников: ' + peers.size);
  }
}

// ============ WEBSOCKET ============
function connectWS(room) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', room }));
  };

  ws.onmessage = async (e) => {
    const msg = JSON.parse(e.data);

    switch (msg.type) {
      // Мы зашли в комнату, получили свой id и список кто уже есть
      case 'joined':
        myId = msg.odString;
        setStatus(msg.users.length === 0
          ? '⏳ Ждём участников...'
          : '🔗 Соединяемся...'
        );
        connectionQuality.textContent = msg.users.length === 0 ? 'Ожидание...' : 'Соединение...';

        // Создаём соединение с каждым существующим участником (мы инициаторы)
        msg.users.forEach((userId) => {
          createPeerConnection(userId, true);
        });
        break;

      // Новый участник зашёл — он сам пришлёт нам offer, мы просто ждём
      case 'user-joined':
        setStatus('🔗 Новый участник подключается...');
        break;

      // Получили offer от кого-то
      case 'offer':
        {
          const pc = createPeerConnection(msg.from, false);
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({
            type: 'answer',
            sdp: answer,
            target: msg.from
          }));
        }
        break;

      // Получили answer
      case 'answer':
        {
          const peerData = peers.get(msg.from);
          if (peerData) {
            await peerData.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          }
        }
        break;

      // ICE candidate
      case 'candidate':
        {
          const peerData = peers.get(msg.from);
          if (peerData) {
            try {
              await peerData.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch (err) {
              console.log('ICE error:', err);
            }
          }
        }
        break;

      // Кто-то ушёл
      case 'user-left':
        removePeer(msg.odString);
        break;

      // Комната полная
      case 'full':
        statusText.textContent = '❌ Комната заполнена (макс. ' + 8 + ')';
        ws.close();
        break;
    }
  };

  ws.onclose = () => console.log('WS closed');
  ws.onerror = () => {
    statusText.textContent = '❌ Ошибка подключения';
  };
}

// ============ JOIN ROOM ============
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

  sidebarRoom.textContent = room;
  topRoomName.textContent = room;

  connectWS(room.trim());
}

// ============ UI UPDATES ============
function updateMicUI() {
  toggleMicBtns.forEach((btn) => {
    if (!btn) return;
    btn.classList.toggle('muted', !micOn);
    btn.querySelector('i').className = micOn ? 'fas fa-microphone' : 'fas fa-microphone-slash';
  });
  indicatorMic.className = micOn ? 'fas fa-microphone' : 'fas fa-microphone-slash';
  indicatorMic.style.color = micOn ? '' : '#ed4245';
}

function updateCamUI() {
  toggleCamBtns.forEach((btn) => {
    if (!btn) return;
    btn.classList.toggle('muted', !camOn);
    btn.querySelector('i').className = camOn ? 'fas fa-video' : 'fas fa-video-slash';
  });
  indicatorCam.className = camOn ? 'fas fa-video' : 'fas fa-video-slash';
  indicatorCam.style.color = camOn ? '' : '#ed4245';
  localOverlay.classList.toggle('hidden', camOn);
}

// ============ EVENT LISTENERS ============

// Join
joinBtn.addEventListener('click', () => joinRoom(roomInput.value));
roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(roomInput.value); });
randomBtn.addEventListener('click', () => { roomInput.value = generateId(); joinRoom(roomInput.value); });

// Mic toggle
toggleMicBtns.forEach((btn) => {
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!localStream) return;
    micOn = !micOn;
    localStream.getAudioTracks().forEach((t) => (t.enabled = micOn));
    updateMicUI();
  });
});

// Cam toggle
toggleCamBtns.forEach((btn) => {
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!localStream) return;
    camOn = !camOn;
    localStream.getVideoTracks().forEach((t) => (t.enabled = camOn));
    updateCamUI();
  });
});

// Screen share
toggleScreenBtns.forEach((btn) => {
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (peers.size === 0) return;

    if (!screenOn) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Заменяем видео-трек у всех пиров
        peers.forEach((peerData) => {
          const sender = peerData.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });

        localVideo.srcObject = screenStream;
        screenOn = true;

        screenTrack.onended = () => stopScreenShare();
        toggleScreenBtns.forEach((b) => { if (b) b.classList.add('active'); });
      } catch (e) {
        console.log('Screen share cancelled');
      }
    } else {
      stopScreenShare();
    }
  });
});

function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    peers.forEach((peerData) => {
      const sender = peerData.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(videoTrack);
    });
  }
  localVideo.srcObject = localStream;
  screenOn = false;
  toggleScreenBtns.forEach((b) => { if (b) b.classList.remove('active'); });
}

// Noise suppression button
toggleNoiseBtn.addEventListener('click', () => {
  noiseOn = !noiseOn;
  toggleNoiseBtn.classList.toggle('active', noiseOn);
  noiseToggle.checked = noiseOn;
});

// Volume slider
volumeSlider.addEventListener('input', () => {
  const vol = volumeSlider.value / 100;
  // Применяем ко всем удалённым видео
  document.querySelectorAll('.remote-video-box video').forEach((v) => {
    v.volume = vol;
  });
  if (remoteVideo) remoteVideo.volume = vol;
});

// PiP
togglePip.addEventListener('click', async () => {
  try {
    // Находим первое удалённое видео
    const rv = document.querySelector('.remote-video-box video') || remoteVideo;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (rv) {
      await rv.requestPictureInPicture();
    }
  } catch (e) {
    console.log('PiP not supported');
  }
});

// Fullscreen
toggleFullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    videosContainer.requestFullscreen().catch(() => {});
  }
});

// Settings modal
settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
  enumerateDevices();
});

settingsClose.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

document.querySelector('.modal-backdrop')?.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

micVolume.addEventListener('input', () => {
  micVolumeLabel.textContent = micVolume.value + '%';
});

// Device change — mic
micSelect.addEventListener('change', async () => {
  if (!localStream) return;
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: micSelect.value },
        noiseSuppression: noiseToggle.checked,
        echoCancellation: echoToggle.checked,
        autoGainControl: agcToggle.checked,
      }
    });
    const newTrack = newStream.getAudioTracks()[0];
    const oldTrack = localStream.getAudioTracks()[0];

    // Заменяем у всех пиров
    peers.forEach((peerData) => {
      const sender = peerData.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (sender) sender.replaceTrack(newTrack);
    });

    localStream.removeTrack(oldTrack);
    oldTrack.stop();
    localStream.addTrack(newTrack);

    if (monitorCtx) monitorCtx.close();
    setupAudioMonitor(localStream);
  } catch (e) {
    console.log('Mic switch error:', e);
  }
});

// Device change — cam
camSelect.addEventListener('change', async () => {
  if (!localStream) return;
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: camSelect.value } }
    });
    const newTrack = newStream.getVideoTracks()[0];
    const oldTrack = localStream.getVideoTracks()[0];

    peers.forEach((peerData) => {
      const sender = peerData.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(newTrack);
    });

    if (oldTrack) {
      localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    localStream.addTrack(newTrack);
    localVideo.srcObject = localStream;
  } catch (e) {
    console.log('Cam switch error:', e);
  }
});

// Device change — speaker
speakerSelect.addEventListener('change', () => {
  if (remoteVideo && remoteVideo.setSinkId) {
    remoteVideo.setSinkId(speakerSelect.value).catch(() => {});
  }
  document.querySelectorAll('.remote-video-box video').forEach((v) => {
    if (v.setSinkId) v.setSinkId(speakerSelect.value).catch(() => {});
  });
});

// Hang up
hangUp.addEventListener('click', () => {
  // Закрываем все соединения
  peers.forEach((peerData, odString) => {
    peerData.pc.close();
    removeRemoteVideo(odString);
  });
  peers.clear();

  if (ws) ws.close();
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (monitorCtx) { monitorCtx.close(); monitorCtx = null; }
  analyser = null;

  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  callScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
  statusText.textContent = '';
  micOn = true;
  camOn = true;
  screenOn = false;
  myId = null;
  updateMicUI();
  updateCamUI();
  userRemote.classList.add('hidden');
});

// Draggable local video
const localContainer = document.getElementById('local-container');
let dragging = false, dragX, dragY;

localContainer.addEventListener('mousedown', (e) => {
  dragging = true;
  dragX = e.clientX - localContainer.offsetLeft;
  dragY = e.clientY - localContainer.offsetTop;
  localContainer.style.cursor = 'grabbing';
  localContainer.style.transition = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  localContainer.style.left = (e.clientX - dragX) + 'px';
  localContainer.style.top = (e.clientY - dragY) + 'px';
  localContainer.style.right = 'auto';
  localContainer.style.bottom = 'auto';
});

document.addEventListener('mouseup', () => {
  dragging = false;
  localContainer.style.cursor = 'grab';
});
