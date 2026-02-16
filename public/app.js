// ===== DOM =====
const joinScreen = document.getElementById('join-screen');
const callScreen = document.getElementById('call-screen');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const randomBtn = document.getElementById('random-btn');
const statusText = document.getElementById('status-text');
const callStatus = document.getElementById('call-status');
const localVideo = document.getElementById('local-video');
const hangUp = document.getElementById('hang-up');
const volumeSlider = document.getElementById('volume-slider');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const micSelect = document.getElementById('mic-select');
const speakerSelect = document.getElementById('speaker-select');
const camSelect = document.getElementById('cam-select');
const applyCamBtn = document.getElementById('apply-cam-btn');
const noiseToggle = document.getElementById('noise-toggle');
const echoToggle = document.getElementById('echo-toggle');
const micLevel = document.getElementById('mic-level');
const localOverlay = document.getElementById('local-overlay');
const localSpeaking = document.getElementById('local-speaking');
const indicatorMic = document.getElementById('indicator-mic');
const indicatorCam = document.getElementById('indicator-cam');
const sidebarRoom = document.getElementById('sidebar-room');
const topRoomName = document.getElementById('top-room-name');
const connectionQuality = document.getElementById('connection-quality');
const channelUsersList = document.getElementById('channel-users-list');
const videosContainer = document.getElementById('videos');

const toggleMicBtns = [document.getElementById('toggle-mic'), document.getElementById('toggle-mic-2')];
const toggleCamBtns = [document.getElementById('toggle-cam'), document.getElementById('toggle-cam-2')];
const switchCamBtn = document.getElementById('switch-cam-btn');
const toggleScreenBtn = document.getElementById('toggle-screen-btn');
const toggleFullscreen = document.getElementById('toggle-fullscreen');

// ===== STATE =====
let ws = null;
let localStream = null;
let screenStream = null;
let myId = null;
let micOn = true;
let camOn = true;
let screenOn = false;
let monitorCtx = null;
let analyser = null;
let animFrameId = null;
let cameraList = [];
let currentCamIndex = 0;
let reconnectTimer = null;
let currentRoom = null;

const peers = new Map();

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

// ===== UTILS =====
function genId() { return Math.random().toString(36).substr(2, 8); }
function setStatus(t) { callStatus.textContent = t; }

// ===== MEDIA =====
async function getMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: { noiseSuppression: noiseToggle.checked, echoCancellation: echoToggle.checked, autoGainControl: true }
    });
  } catch (e) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      camOn = false;
      updateCamUI();
      localOverlay.classList.remove('hidden');
    } catch (e2) {
      statusText.textContent = '❌ Нет доступа к камере/микрофону';
      return false;
    }
  }
  localVideo.srcObject = localStream;
  startAudioMonitor();
  await refreshDevices();
  await updateCameraList();
  return true;
}

// ===== AUDIO MONITOR =====
function startAudioMonitor() {
  try {
    if (monitorCtx) monitorCtx.close();
    monitorCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = monitorCtx.createMediaStreamSource(localStream);
    analyser = monitorCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    animLoop();
  } catch (e) {}
}

function animLoop() {
  if (!analyser) return;
  const d = new Uint8Array(analyser.frequencyBinCount);
  function tick() {
    analyser.getByteFrequencyData(d);
    let s = 0;
    for (let i = 0; i < d.length; i++) s += d[i];
    const avg = s / d.length;
    const pct = Math.min(100, (avg / 128) * 100);
    micLevel.style.width = pct + '%';
    localSpeaking.classList.toggle('hidden', !(pct > 10 && micOn));
    animFrameId = requestAnimationFrame(tick);
  }
  tick();
}

// ===== DEVICES =====
async function refreshDevices() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    micSelect.innerHTML = '';
    speakerSelect.innerHTML = '';
    camSelect.innerHTML = '';

    devs.forEach((d) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.text = d.label || d.kind + ' ' + d.deviceId.slice(0, 6);
      if (d.kind === 'audioinput') micSelect.appendChild(o);
      else if (d.kind === 'audiooutput') speakerSelect.appendChild(o);
      else if (d.kind === 'videoinput') camSelect.appendChild(o);
    });

    if (!speakerSelect.options.length) {
      const o = document.createElement('option');
      o.text = 'Стандартный';
      speakerSelect.appendChild(o);
    }

    // Подсветить текущую камеру
    const ct = localStream?.getVideoTracks()[0];
    if (ct) {
      for (let i = 0; i < camSelect.options.length; i++) {
        if (camSelect.options[i].text === ct.label) { camSelect.selectedIndex = i; break; }
      }
    }
  } catch (e) {}
}

async function updateCameraList() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    cameraList = devs.filter((d) => d.kind === 'videoinput');
    const ct = localStream?.getVideoTracks()[0];
    if (ct) {
      const idx = cameraList.findIndex((c) => c.label === ct.label);
      if (idx >= 0) currentCamIndex = idx;
    }
  } catch (e) {}
}

async function switchCamera(deviceId) {
  if (!localStream || screenOn) return;
  try {
    const ns = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
    const nt = ns.getVideoTracks()[0];
    const ot = localStream.getVideoTracks()[0];

    peers.forEach((p) => {
      const sender = p.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(nt);
    });

    if (ot) { localStream.removeTrack(ot); ot.stop(); }
    localStream.addTrack(nt);
    localVideo.srcObject = localStream;
  } catch (e) { console.log('Cam switch err:', e); }
}

async function nextCamera() {
  if (cameraList.length < 2) return;
  currentCamIndex = (currentCamIndex + 1) % cameraList.length;
  await switchCamera(cameraList[currentCamIndex].deviceId);
}

// ===== VIDEO GRID =====
function addRemoteVideo(odStr) {
  rmRemoteVideo(odStr);

  const box = document.createElement('div');
  box.className = 'video-container remote-video-box';
  box.id = 'vbox-' + odStr;

  const vid = document.createElement('video');
  vid.autoplay = true;
  vid.playsInline = true;
  vid.id = 'vid-' + odStr;
  vid.volume = volumeSlider.value / 100;

  const ov = document.createElement('div');
  ov.className = 'video-overlay';
  ov.id = 'ov-' + odStr;
  ov.innerHTML = '<div class="no-video-avatar"><i class="fas fa-user"></i></div>';

  const nm = document.createElement('div');
  nm.className = 'video-name';
  nm.innerHTML = '<span>Участник</span>';

  const sp = document.createElement('div');
  sp.className = 'speaking-indicator hidden';
  sp.id = 'sp-' + odStr;
  sp.innerHTML = '<i class="fas fa-volume-high"></i>';

  box.appendChild(vid);
  box.appendChild(ov);
  box.appendChild(nm);
  box.appendChild(sp);

  const lc = document.getElementById('local-container');
  videosContainer.insertBefore(box, lc);
  layoutVideos();
  return vid;
}

function rmRemoteVideo(odStr) {
  const b = document.getElementById('vbox-' + odStr);
  if (b) b.remove();
  layoutVideos();
}

function layoutVideos() {
  const boxes = videosContainer.querySelectorAll('.remote-video-box');
  const lc = document.getElementById('local-container');
  const n = boxes.length;

  if (n === 0) {
    lc.className = 'video-container local-small';
  } else if (n === 1) {
    boxes[0].className = 'video-container remote-video-box remote-single';
    lc.className = 'video-container local-small';
  } else {
    boxes.forEach((b) => { b.className = 'video-container remote-video-box remote-grid'; });
    lc.className = 'video-container remote-grid';
  }
  updateSidebar();
}

function updateSidebar() {
  // Убираем старых удалённых юзеров из сайдбара
  channelUsersList.querySelectorAll('.remote-user-entry').forEach((e) => e.remove());

  peers.forEach((p, odStr) => {
    const div = document.createElement('div');
    div.className = 'channel-user remote-user-entry';
    div.id = 'su-' + odStr;
    div.innerHTML = '<div class="user-avatar remote-avatar"><i class="fas fa-user"></i></div><span>Участник</span>';
    channelUsersList.appendChild(div);
  });

  const count = peers.size;
  connectionQuality.textContent = count > 0 ? 'Подключено' : 'Ожидание...';
  connectionQuality.style.color = count > 0 ? '#23a559' : '';
}

function monitorRemoteAudio(stream, odStr) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    const d = new Uint8Array(an.frequencyBinCount);
    (function chk() {
      an.getByteFrequencyData(d);
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i];
      const el = document.getElementById('sp-' + odStr);
      if (el) el.classList.toggle('hidden', (s / d.length) <= 8);
      requestAnimationFrame(chk);
    })();
  } catch (e) {}
}

// ===== PEER =====
function makePeer(rid, init) {
  const pc = new RTCPeerConnection(ICE);
  peers.set(rid, { pc: pc, stream: null });

  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  pc.ontrack = (ev) => {
    const pd = peers.get(rid);
    if (pd && !pd.stream) {
      pd.stream = ev.streams[0];
      const v = addRemoteVideo(rid);
      v.srcObject = ev.streams[0];
      const ov = document.getElementById('ov-' + rid);
      if (ov) ov.classList.add('hidden');
      monitorRemoteAudio(ev.streams[0], rid);
      setStatus('✅ Подключено! (' + peers.size + ')');
    }
  };

  pc.onicecandidate = (ev) => {
    if (ev.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'candidate', candidate: ev.candidate, target: rid }));
    }
  };

  pc.oniceconnectionstatechange = () => {
    const st = pc.iceConnectionState;
    if (st === 'disconnected' || st === 'failed') {
      console.log('Peer', rid, 'ice:', st);
      // Попробуем переподключиться через ICE restart
      if (st === 'failed' && init) {
        pc.createOffer({ iceRestart: true })
          .then((o) => pc.setLocalDescription(o))
          .then(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription, target: rid }));
            }
          })
          .catch(() => {});
      }
    }
  };

  if (init) {
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() => {
        ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription, target: rid }));
      });
  }

  return pc;
}

function dropPeer(odStr) {
  const p = peers.get(odStr);
  if (p) { try { p.pc.close(); } catch (e) {} peers.delete(odStr); }
  rmRemoteVideo(odStr);
  updateSidebar();
  setStatus(peers.size > 0 ? '✅ Подключено! (' + peers.size + ')' : '⏳ Ждём участников...');
}

// ===== WEBSOCKET =====
function connectWS(room) {
  currentRoom = room;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', room: room }));
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  };

  ws.onmessage = async (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    switch (msg.type) {
      case 'joined':
        myId = msg.odString;
        setStatus(msg.users.length ? '🔗 Соединяемся...' : '⏳ Ждём участников...');
        msg.users.forEach((uid) => makePeer(uid, true));
        break;

      case 'user-joined':
        setStatus('🔗 Подключается...');
        break;

      case 'offer': {
        const pc = makePeer(msg.from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        ws.send(JSON.stringify({ type: 'answer', sdp: ans, target: msg.from }));
        break;
      }
      case 'answer': {
        const pd = peers.get(msg.from);
        if (pd) await pd.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        break;
      }
      case 'candidate': {
        const pd = peers.get(msg.from);
        if (pd) { try { await pd.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch (e) {} }
        break;
      }
      case 'user-left':
        dropPeer(msg.odString);
        break;

      case 'full':
        statusText.textContent = '❌ Комната заполнена';
        ws.close();
        break;
    }
  };

  ws.onclose = () => {
    console.log('WS closed');
    // Авто-реконнект через 3 сек если мы ещё в звонке
    if (callScreen && !callScreen.classList.contains('hidden') && currentRoom) {
      setStatus('⚠️ Переподключение...');
      reconnectTimer = setTimeout(() => {
        if (currentRoom) connectWS(currentRoom);
      }, 3000);
    }
  };

  ws.onerror = () => {};
}

// ===== JOIN =====
async function joinRoom(room) {
  if (!room.trim()) { statusText.textContent = 'Введите ID комнаты'; return; }
  statusText.textContent = 'Запрашиваем камеру...';
  if (!(await getMedia())) return;

  joinScreen.classList.add('hidden');
  callScreen.classList.remove('hidden');
  sidebarRoom.textContent = room;
  topRoomName.textContent = room;
  connectWS(room.trim());
}

// ===== UI =====
function updateMicUI() {
  toggleMicBtns.forEach((b) => {
    if (!b) return;
    b.classList.toggle('muted', !micOn);
    b.querySelector('i').className = micOn ? 'fas fa-microphone' : 'fas fa-microphone-slash';
  });
  indicatorMic.className = micOn ? 'fas fa-microphone' : 'fas fa-microphone-slash';
  indicatorMic.style.color = micOn ? '' : '#ed4245';
}

function updateCamUI() {
  toggleCamBtns.forEach((b) => {
    if (!b) return;
    b.classList.toggle('muted', !camOn);
    b.querySelector('i').className = camOn ? 'fas fa-video' : 'fas fa-video-slash';
  });
  indicatorCam.className = camOn ? 'fas fa-video' : 'fas fa-video-slash';
  indicatorCam.style.color = camOn ? '' : '#ed4245';
  localOverlay.classList.toggle('hidden', camOn);
}

// ===== EVENTS =====
joinBtn.addEventListener('click', () => joinRoom(roomInput.value));
roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(roomInput.value); });
randomBtn.addEventListener('click', () => { roomInput.value = genId(); joinRoom(roomInput.value); });

toggleMicBtns.forEach((b) => { if (b) b.addEventListener('click', () => {
  if (!localStream) return;
  micOn = !micOn;
  localStream.getAudioTracks().forEach((t) => t.enabled = micOn);
  updateMicUI();
}); });

toggleCamBtns.forEach((b) => { if (b) b.addEventListener('click', () => {
  if (!localStream) return;
  camOn = !camOn;
  localStream.getVideoTracks().forEach((t) => t.enabled = camOn);
  updateCamUI();
}); });

switchCamBtn.addEventListener('click', async () => {
  await updateCameraList();
  await nextCamera();
});

applyCamBtn.addEventListener('click', async () => {
  if (camSelect.value) {
    await switchCamera(camSelect.value);
    await updateCameraList();
  }
});

toggleScreenBtn.addEventListener('click', async () => {
  if (peers.size === 0) return;
  if (!screenOn) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const st = screenStream.getVideoTracks()[0];
      peers.forEach((p) => {
        const s = p.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (s) s.replaceTrack(st);
      });
      localVideo.srcObject = screenStream;
      screenOn = true;
      st.onended = () => stopScreen();
      toggleScreenBtn.classList.add('active');
    } catch (e) {}
  } else {
    stopScreen();
  }
});

function stopScreen() {
  if (screenStream) { screenStream.getTracks().forEach((t) => t.stop()); screenStream = null; }
  const vt = localStream.getVideoTracks()[0];
  if (vt) {
    peers.forEach((p) => {
      const s = p.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (s) s.replaceTrack(vt);
    });
  }
  localVideo.srcObject = localStream;
  screenOn = false;
  toggleScreenBtn.classList.remove('active');
}

volumeSlider.addEventListener('input', () => {
  const v = volumeSlider.value / 100;
  document.querySelectorAll('.remote-video-box video').forEach((el) => el.volume = v);
});

toggleFullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else videosContainer.requestFullscreen().catch(() => {});
});

settingsBtn.addEventListener('click', () => { settingsModal.classList.remove('hidden'); refreshDevices(); });
settingsClose.addEventListener('click', () => settingsModal.classList.add('hidden'));
document.querySelector('.modal-backdrop')?.addEventListener('click', () => settingsModal.classList.add('hidden'));

micSelect.addEventListener('change', async () => {
  if (!localStream) return;
  try {
    const ns = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: micSelect.value }, noiseSuppression: noiseToggle.checked, echoCancellation: echoToggle.checked, autoGainControl: true }
    });
    const nt = ns.getAudioTracks()[0];
    const ot = localStream.getAudioTracks()[0];
    peers.forEach((p) => {
      const s = p.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (s) s.replaceTrack(nt);
    });
    localStream.removeTrack(ot); ot.stop();
    localStream.addTrack(nt);
    startAudioMonitor();
  } catch (e) {}
});

speakerSelect.addEventListener('change', () => {
  const id = speakerSelect.value;
  document.querySelectorAll('.remote-video-box video').forEach((v) => {
    if (v.setSinkId) v.setSinkId(id).catch(() => {});
  });
});

hangUp.addEventListener('click', () => {
  currentRoom = null;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  peers.forEach((p, id) => { try { p.pc.close(); } catch (e) {} rmRemoteVideo(id); });
  peers.clear();

  if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  if (screenStream) { screenStream.getTracks().forEach((t) => t.stop()); screenStream = null; }
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (monitorCtx) { try { monitorCtx.close(); } catch (e) {} monitorCtx = null; }
  analyser = null;

  localVideo.srcObject = null;
  callScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
  statusText.textContent = '';
  micOn = true; camOn = true; screenOn = false; myId = null;
  cameraList = []; currentCamIndex = 0;
  updateMicUI(); updateCamUI();
  channelUsersList.querySelectorAll('.remote-user-entry').forEach((e) => e.remove());
});

// Drag local video
const lc = document.getElementById('local-container');
let drag = false, dx, dy;
lc.addEventListener('mousedown', (e) => {
  drag = true; dx = e.clientX - lc.offsetLeft; dy = e.clientY - lc.offsetTop;
  lc.style.cursor = 'grabbing'; lc.style.transition = 'none';
});
document.addEventListener('mousemove', (e) => {
  if (!drag) return;
  lc.style.left = (e.clientX - dx) + 'px';
  lc.style.top = (e.clientY - dy) + 'px';
  lc.style.right = 'auto'; lc.style.bottom = 'auto';
});
document.addEventListener('mouseup', () => { drag = false; lc.style.cursor = 'grab'; });
