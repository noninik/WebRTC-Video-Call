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

// Settings
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

// Indicators
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

// All mic/cam toggle buttons (sidebar + bottom bar)
const toggleMicBtns = [document.getElementById('toggle-mic'), document.getElementById('toggle-mic-2')];
const toggleCamBtns = [document.getElementById('toggle-cam'), document.getElementById('toggle-cam-2')];
const toggleScreenBtns = [document.getElementById('toggle-screen'), document.getElementById('toggle-screen-2')];
const toggleNoiseBtn = document.getElementById('toggle-noise');
const togglePip = document.getElementById('toggle-pip');
const toggleFullscreen = document.getElementById('toggle-fullscreen');

// ============ STATE ============
let ws, pc, localStream, screenStream;
let micOn = true, camOn = true, screenOn = false, noiseOn = true;
let audioContext, gainNode, analyser, micSource;
let animFrameId;

const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ]
};

// ============ UTILITIES ============
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function setStatus(text) {
  callStatus.textContent = text;
}

// ============ AUDIO PROCESSING ============
function setupAudioProcessing(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  micSource = audioContext.createMediaStreamSource(stream);

  // Gain node for mic volume
  gainNode = audioContext.createGain();
  gainNode.gain.value = micVolume.value / 100;

  // Analyser for mic level visualization
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  micSource.connect(gainNode);
  gainNode.connect(analyser);

  // Create processed stream
  const dest = audioContext.createMediaStreamDestination();
  gainNode.connect(dest);

  // Replace audio track in local stream
  const processedTrack = dest.stream.getAudioTracks()[0];
  const oldTrack = stream.getAudioTracks()[0];

  // Keep reference to original track for muting
  processedTrack._originalTrack = oldTrack;

  stream.removeTrack(oldTrack);
  stream.addTrack(processedTrack);

  // Start level monitoring
  monitorMicLevel();
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

    // Speaking indicator
    if (pct > 10) {
      localSpeaking.classList.remove('hidden');
    } else {
      localSpeaking.classList.add('hidden');
    }

    animFrameId = requestAnimationFrame(update);
  }
  update();
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

    // If no output devices listed
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
    setupAudioProcessing(localStream);
    await enumerateDevices();
    return true;
  } catch (err) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      localVideo.srcObject = localStream;
      camOn = false;
      updateCamUI();
      localOverlay.classList.remove('hidden');
      setupAudioProcessing(localStream);
      await enumerateDevices();
      return true;
    } catch (err2) {
      statusText.textContent = '❌ Нет доступа к камере/микрофону';
      return false;
    }
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
      case 'waiting':
        setStatus('⏳ Ждём второго участника...');
        connectionQuality.textContent = 'Ожидание...';
        break;

      case 'full':
        statusText.textContent = '❌ Комната заполнена';
        ws.close();
        return;

      case 'ready':
        setStatus('🔗 Соединяемся...');
        if (msg.initiator) createPeer(true);
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
            console.log('ICE error:', err);
          }
        }
        break;

      case 'peer-left':
        setStatus('😔 Собеседник отключился');
        connectionQuality.textContent = 'Отключён';
        remoteVideo.srcObject = null;
        remoteOverlay.classList.remove('hidden');
        remoteSpeaking.classList.add('hidden');
        userRemote.classList.add('hidden');
        if (pc) { pc.close(); pc = null; }
        break;
    }
  };

  ws.onclose = () => console.log('WS closed');
  ws.onerror = () => {
    statusText.textContent = '❌ Ошибка подключения';
  };
}

// ============ WEBRTC ============
async function createPeer(isInitiator) {
  pc = new RTCPeerConnection(config);

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      remoteOverlay.classList.add('hidden');
      userRemote.classList.remove('hidden');
      setStatus('✅ Подключено!');
      connectionQuality.textContent = 'Подключено';
      connectionQuality.style.color = '#23a559';

      // Monitor remote audio for speaking indicator
      monitorRemoteAudio(event.streams[0]);
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
    }
  };

  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    if (state === 'connected' || state === 'completed') {
      setStatus('✅ Подключено!');
      connectionQuality.textContent = 'Подключено';
      connectionQuality.style.color = '#23a559';
    } else if (state === 'disconnected') {
      setStatus('⚠️ Соединение прервано...');
      connectionQuality.textContent = 'Прервано';
      connectionQuality.style.color = '#fee75c';
    } else if (state === 'failed') {
      setStatus('❌ Не удалось соединиться');
      connectionQuality.textContent = 'Ошибка';
      connectionQuality.style.color = '#ed4245';
    }
  };

  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'offer', sdp: offer }));
  }
}

function monitorRemoteAudio(stream) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const remoteAnalyser = ctx.createAnalyser();
    remoteAnalyser.fftSize = 256;
    source.connect(remoteAnalyser);

    const data = new Uint8Array(remoteAnalyser.frequencyBinCount);
    function check() {
      remoteAnalyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      if (avg > 8) {
        remoteSpeaking.classList.remove('hidden');
      } else {
        remoteSpeaking.classList.add('hidden');
      }
      requestAnimationFrame(check);
    }
    check();
  } catch (e) {
    console.log('Remote audio monitor error:', e);
  }
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
    if (!pc) return;

    if (!screenOn) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
        localVideo.srcObject = screenStream;
        screenOn = true;

        screenTrack.onended = () => {
          stopScreenShare();
        };

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
  if (videoTrack && pc) {
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(videoTrack);
  }
  localVideo.srcObject = localStream;
  screenOn = false;
  toggleScreenBtns.forEach((b) => { if (b) b.classList.remove('active'); });
}

// Noise suppression
toggleNoiseBtn.addEventListener('click', () => {
  noiseOn = !noiseOn;
  toggleNoiseBtn.classList.toggle('active', noiseOn);
  noiseToggle.checked = noiseOn;
});

// Volume slider
volumeSlider.addEventListener('input', () => {
  if (remoteVideo) {
    remoteVideo.volume = volumeSlider.value / 100;
  }
});

// PiP
togglePip.addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await remoteVideo.requestPictureInPicture();
    }
  } catch (e) {
    console.log('PiP not supported');
  }
});

// Fullscreen
toggleFullscreen.addEventListener('click', () => {
  const container = document.getElementById('remote-container');
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    container.requestFullscreen().catch(() => {});
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

// Mic volume
micVolume.addEventListener('input', () => {
  const val = micVolume.value;
  micVolumeLabel.textContent = val + '%';
  if (gainNode) gainNode.gain.value = val / 100;
});

// Device change
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
    localStream.removeTrack(oldTrack);
    oldTrack.stop();
    localStream.addTrack(newTrack);

    if (pc) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (sender) sender.replaceTrack(newTrack);
    }
  } catch (e) {
    console.log('Mic switch error:', e);
  }
});

camSelect.addEventListener('change', async () => {
  if (!localStream) return;
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: camSelect.value } }
    });
    const newTrack = newStream.getVideoTracks()[0];
    const oldTrack = localStream.getVideoTracks()[0];
    if (oldTrack) {
      localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    localStream.addTrack(newTrack);
    localVideo.srcObject = localStream;

    if (pc) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(newTrack);
    }
  } catch (e) {
    console.log('Cam switch error:', e);
  }
});

speakerSelect.addEventListener('change', () => {
  if (remoteVideo.setSinkId) {
    remoteVideo.setSinkId(speakerSelect.value).catch(() => {});
  }
});

// Hang up
hangUp.addEventListener('click', () => {
  if (pc) { pc.close(); pc = null; }
  if (ws) ws.close();
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (audioContext) audioContext.close();

  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  callScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
  statusText.textContent = '';
  micOn = true;
  camOn = true;
  screenOn = false;
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
