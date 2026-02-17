// ──────────────────────────────────────
//  ICE SERVERS
// ──────────────────────────────────────
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ]
};

// ──────────────────────────────────────
//  STATE
// ──────────────────────────────────────
const S = {
  ws: null,
  pc: null,
  localStream: null,
  remoteStream: null,
  roomId: null,
  myId: null,
  peerId: null,
  nickname: '',
  isCreator: false,
  micOn: true,
  camOn: true,
  screenSharing: false,
  screenStream: null,
  savedCamTrack: null,
  timerInterval: null,
  timerStart: null,
  iceQueue: [],
  remoteDescSet: false,
  dragging: false,
  reconnectAttempts: 0,
  maxReconnect: 5,
};

// ──────────────────────────────────────
//  DOM
// ──────────────────────────────────────
const $ = id => document.getElementById(id);

const EL = {
  lobbyScreen:      $('lobbyScreen'),
  callScreen:       $('callScreen'),
  nicknameInput:    $('nicknameInput'),
  roomInput:        $('roomInput'),
  btnDice:          $('btnDice'),
  btnCreate:        $('btnCreate'),
  btnJoin:          $('btnJoin'),
  lobbyStatus:      $('lobbyStatus'),
  localVideo:       $('localVideo'),
  remoteVideo:      $('remoteVideo'),
  localPlaceholder: $('localPlaceholder'),
  remotePlaceholder:$('remotePlaceholder'),
  localBox:         $('localBox'),
  remoteBox:        $('remoteBox'),
  videos:           $('videos'),
  btnMic:           $('btnMic'),
  btnCam:           $('btnCam'),
  btnFlip:          $('btnFlip'),
  btnScreen:        $('btnScreen'),
  btnReaction:      $('btnReaction'),
  btnHangup:        $('btnHangup'),
  statusDot:        $('statusDot'),
  statusLabel:      $('statusLabel'),
  timer:            $('timer'),
  roomDisplay:      $('roomDisplay'),
  btnCopy:          $('btnCopy'),
  toastStack:       $('toastStack'),
  particles:        $('particles'),
  reactionPicker:   $('reactionPicker'),
  reactionFloat:    $('reactionFloat'),
  remoteNickname:   $('remoteNickname'),
};

// ──────────────────────────────────────
//  BOOT
// ──────────────────────────────────────
(function boot() {
  spawnParticles();
  EL.roomInput.value = randomCode();
  EL.nicknameInput.value = '';
  bindUI();
})();

// ──────────────────────────────────────
//  PARTICLES
// ──────────────────────────────────────
function spawnParticles() {
  for (let i = 0; i < 35; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const sz = Math.random() * 4 + 1.5;
    const hue = Math.random() > .5 ? '250' : '270';
    Object.assign(p.style, {
      width: sz + 'px', height: sz + 'px',
      left: Math.random() * 100 + '%',
      background: `hsl(${hue},80%,65%)`,
      animationDuration: (Math.random() * 18 + 12) + 's',
      animationDelay: (Math.random() * 12) + 's',
    });
    EL.particles.appendChild(p);
  }
}

// ──────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function setStatus(msg, type) {
  EL.lobbyStatus.textContent = msg;
  EL.lobbyStatus.className = 'lobby-status ' + (type || '');
}

function btnLoading(btn, on) {
  btn.disabled = on;
  const label = btn.querySelector('.btn-label');
  if (!label) return;
  if (on) { btn._origLabel = label.textContent; label.textContent = '…'; }
  else if (btn._origLabel) label.textContent = btn._origLabel;
}

function shake(el) {
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = 'shake .4s ease';
  el.addEventListener('animationend', () => el.style.animation = '', { once: true });
}

// ──────────────────────────────────────
//  TOAST
// ──────────────────────────────────────
function toast(msg, type = 'info', ms = 3200) {
  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    info: 'fa-circle-info',
    warning: 'fa-triangle-exclamation'
  };
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  EL.toastStack.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    t.addEventListener('animationend', () => t.remove());
  }, ms);
}

// ──────────────────────────────────────
//  BIND UI
// ──────────────────────────────────────
function bindUI() {
  EL.btnDice.onclick = () => { EL.roomInput.value = randomCode(); };
  EL.btnCreate.onclick = () => startCall(true);
  EL.btnJoin.onclick = () => startCall(false);
  EL.roomInput.addEventListener('keydown', e => { if (e.key === 'Enter') startCall(true); });
  EL.nicknameInput.addEventListener('keydown', e => { if (e.key === 'Enter') EL.roomInput.focus(); });

  EL.btnMic.onclick = toggleMic;
  EL.btnCam.onclick = toggleCam;
  EL.btnFlip.onclick = flipCamera;
  EL.btnScreen.onclick = toggleScreen;
  EL.btnHangup.onclick = hangUp;
  EL.btnCopy.onclick = copyRoom;

  // Reaction picker
  EL.btnReaction.onclick = () => {
    EL.reactionPicker.classList.toggle('hidden');
  };
  document.querySelectorAll('.reaction-emoji').forEach(btn => {
    btn.onclick = () => {
      sendReaction(btn.dataset.emoji);
      EL.reactionPicker.classList.add('hidden');
    };
  });
  // close picker on outside click
  document.addEventListener('click', (e) => {
    if (!EL.reactionPicker.contains(e.target) && e.target !== EL.btnReaction && !EL.btnReaction.contains(e.target)) {
      EL.reactionPicker.classList.add('hidden');
    }
  });

  initDrag();
}

// ──────────────────────────────────────
//  WEBSOCKET
// ──────────────────────────────────────
function connectWS() {
  return new Promise((resolve, reject) => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`);

    ws.onopen = () => {
      S.ws = ws;
      S.reconnectAttempts = 0;
      resolve(ws);
    };

    ws.onerror = (e) => {
      console.error('WS error:', e);
      reject(e);
    };

    ws.onclose = () => {
      console.log('WS closed');
      if (S.roomId && S.reconnectAttempts < S.maxReconnect) {
        S.reconnectAttempts++;
        toast('Connection lost, reconnecting…', 'warning');
        setTimeout(() => {
          connectWS().then(() => {
            wsSend({ type: 'join', room: S.roomId, nickname: S.nickname });
          }).catch(() => {});
        }, 1000 * S.reconnectAttempts);
      }
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      handleSignal(msg);
    };
  });
}

function wsSend(obj) {
  if (S.ws && S.ws.readyState === WebSocket.OPEN) {
    S.ws.send(JSON.stringify(obj));
  }
}

// ──────────────────────────────────────
//  SIGNALING HANDLER
// ──────────────────────────────────────
async function handleSignal(msg) {
  switch (msg.type) {
    case 'joined': {
      S.myId = msg.odStr;
      S.isCreator = msg.isCreator;
      console.log('Joined as', S.myId, 'creator:', S.isCreator);

      // If there are existing users, we need to create offers to them
      if (msg.users && msg.users.length > 0) {
        for (const user of msg.users) {
          S.peerId = user.odStr;
          EL.remoteNickname.textContent = user.nickname || 'Peer';
          await createPeerAndOffer(user.odStr);
        }
      }
      break;
    }

    case 'user-joined': {
      S.peerId = msg.odStr;
      EL.remoteNickname.textContent = msg.nickname || 'Peer';
      toast(`${msg.nickname || 'Peer'} joined`, 'success');
      // The new user will send us an offer, we wait
      break;
    }

    case 'offer': {
      S.peerId = msg.from;
      await handleOffer(msg);
      break;
    }

    case 'answer': {
      await handleAnswer(msg);
      break;
    }

    case 'candidate': {
      await addOrQueueCandidate(msg.candidate);
      break;
    }

    case 'user-left': {
      toast(`${msg.nickname || 'Peer'} left`, 'warning');
      closePeer();
      EL.remotePlaceholder.classList.remove('hidden');
      EL.remoteNickname.textContent = 'Remote';
      stopTimer();
      EL.timer.textContent = '00:00';
      updateStatusUI('disconnected');
      break;
    }

    case 'full': {
      toast('Room is full', 'error');
      setStatus('Room is full', 'err');
      cleanup();
      switchScreen('lobbyScreen');
      break;
    }

    case 'error': {
      toast(msg.message || 'Server error', 'error');
      break;
    }

    case 'reaction': {
      showReactionBubble(msg.emoji);
      toast(`${msg.nickname}: ${msg.emoji}`, 'info', 1800);
      break;
    }

    default:
      break;
  }
}

// ──────────────────────────────────────
//  MEDIA
// ──────────────────────────────────────
async function getMedia() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    S.localStream = stream;
    EL.localVideo.srcObject = stream;
    EL.localPlaceholder.classList.add('hidden');
    return stream;
  } catch (e) {
    console.warn('getUserMedia full failed, trying audio-only…', e);
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      S.localStream = audio;
      S.camOn = false;
      EL.btnCam.classList.add('off');
      EL.btnCam.querySelector('i').className = 'fas fa-video-slash';
      toast('Camera unavailable — audio only', 'warning');
      return audio;
    } catch (e2) {
      toast('Cannot access camera or mic', 'error');
      throw e2;
    }
  }
}

function stopMedia() {
  [S.localStream, S.screenStream].forEach(s => {
    if (s) s.getTracks().forEach(t => t.stop());
  });
  S.localStream = null;
  S.screenStream = null;
  EL.localVideo.srcObject = null;
  EL.localPlaceholder.classList.remove('hidden');
}

// ──────────────────────────────────────
//  PEER CONNECTION
// ──────────────────────────────────────
function makePeer() {
  if (S.pc) {
    S.pc.close();
    S.pc = null;
  }

  const pc = new RTCPeerConnection(RTC_CONFIG);
  S.remoteDescSet = false;
  S.iceQueue = [];

  // add local tracks
  if (S.localStream) {
    S.localStream.getTracks().forEach(t => pc.addTrack(t, S.localStream));
  }

  // remote stream
  S.remoteStream = new MediaStream();
  EL.remoteVideo.srcObject = S.remoteStream;

  pc.ontrack = ev => {
    ev.streams[0].getTracks().forEach(t => {
      if (!S.remoteStream.getTracks().find(x => x.id === t.id)) {
        S.remoteStream.addTrack(t);
      }
    });
    EL.remotePlaceholder.classList.add('hidden');
  };

  pc.onicecandidate = e => {
    if (e.candidate) {
      wsSend({
        type: 'candidate',
        candidate: e.candidate.toJSON(),
        target: S.peerId
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    const st = pc.iceConnectionState;
    console.log('ICE:', st);
    updateStatusUI(st);
    if (st === 'connected' || st === 'completed') {
      startTimer();
      toast('Connected!', 'success');
      EL.localBox.classList.add('connected');
      setTimeout(() => EL.localBox.classList.remove('connected'), 1500);
    }
    if (st === 'disconnected') toast('Peer disconnected…', 'warning');
    if (st === 'failed') {
      toast('Connection failed', 'error');
      iceRestart();
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      EL.remotePlaceholder.classList.remove('hidden');
      stopTimer();
    }
  };

  S.pc = pc;
  return pc;
}

async function createPeerAndOffer(targetId) {
  const pc = makePeer();

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    wsSend({
      type: 'offer',
      sdp: offer.sdp,
      target: targetId
    });
  } catch (e) {
    console.error('createOffer error:', e);
    toast('Failed to create offer', 'error');
  }
}

async function handleOffer(msg) {
  const pc = makePeer();

  try {
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
    S.remoteDescSet = true;
    await flushIceQueue();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    wsSend({
      type: 'answer',
      sdp: answer.sdp,
      target: msg.from
    });
  } catch (e) {
    console.error('handleOffer error:', e);
    toast('Failed to handle offer', 'error');
  }
}

async function handleAnswer(msg) {
  if (!S.pc) return;
  try {
    if (S.pc.signalingState === 'have-local-offer') {
      await S.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
      S.remoteDescSet = true;
      await flushIceQueue();
    }
  } catch (e) {
    console.error('handleAnswer error:', e);
  }
}

function updateStatusUI(st) {
  const dot = EL.statusDot;
  const lbl = EL.statusLabel;
  switch (st) {
    case 'checking':
      lbl.textContent = 'Connecting…';
      dot.className = 'status-dot';
      break;
    case 'connected':
    case 'completed':
      lbl.textContent = 'Connected';
      dot.className = 'status-dot on';
      break;
    case 'disconnected':
      lbl.textContent = 'Reconnecting…';
      dot.className = 'status-dot';
      break;
    case 'failed':
      lbl.textContent = 'Failed';
      dot.className = 'status-dot';
      break;
    default:
      lbl.textContent = 'Connecting…';
      dot.className = 'status-dot';
  }
}

async function iceRestart() {
  if (!S.pc || !S.peerId) return;
  try {
    const offer = await S.pc.createOffer({ iceRestart: true });
    await S.pc.setLocalDescription(offer);
    wsSend({
      type: 'offer',
      sdp: offer.sdp,
      target: S.peerId
    });
  } catch (e) {
    console.error('ICE restart err:', e);
  }
}

async function flushIceQueue() {
  while (S.iceQueue.length) {
    const c = S.iceQueue.shift();
    try {
      await S.pc.addIceCandidate(c);
    } catch (e) {
      console.warn('addIceCandidate err:', e);
    }
  }
}

async function addOrQueueCandidate(data) {
  if (!data) return;
  const candidate = new RTCIceCandidate(data);
  if (S.remoteDescSet && S.pc) {
    await S.pc.addIceCandidate(candidate).catch(e => console.warn(e));
  } else {
    S.iceQueue.push(candidate);
  }
}

// ──────────────────────────────────────
//  START CALL
// ──────────────────────────────────────
async function startCall(creating) {
  const id = EL.roomInput.value.trim().toUpperCase();
  if (!id) {
    setStatus('Enter a room code', 'err');
    shake(EL.roomInput.parentElement);
    return;
  }

  S.nickname = EL.nicknameInput.value.trim().slice(0, 20) || 'User';

  btnLoading(EL.btnCreate, true);
  btnLoading(EL.btnJoin, true);

  try {
    await getMedia();

    await connectWS();

    S.roomId = id;

    wsSend({
      type: 'join',
      room: id,
      nickname: S.nickname
    });

    EL.roomDisplay.textContent = id;
    switchScreen('callScreen');
    toast(creating ? `Room "${id}" created — waiting for peer` : `Joining room "${id}"…`, 'info');
  } catch (e) {
    console.error('startCall:', e);
    setStatus('Failed to start call', 'err');
    toast('Error starting call', 'error');
    cleanup();
  } finally {
    btnLoading(EL.btnCreate, false);
    btnLoading(EL.btnJoin, false);
  }
}

// ──────────────────────────────────────
//  CONTROLS
// ──────────────────────────────────────
function toggleMic() {
  if (!S.localStream) return;
  const tracks = S.localStream.getAudioTracks();
  if (!tracks.length) { toast('No microphone', 'warning'); return; }
  S.micOn = !S.micOn;
  tracks.forEach(t => t.enabled = S.micOn);
  EL.btnMic.classList.toggle('off', !S.micOn);
  EL.btnMic.querySelector('i').className = S.micOn ? 'fas fa-microphone' : 'fas fa-microphone-slash';
  toast(S.micOn ? 'Mic on' : 'Mic muted', 'info', 1400);
}

function toggleCam() {
  if (!S.localStream) return;
  const tracks = S.localStream.getVideoTracks();
  if (!tracks.length) { toast('No camera', 'warning'); return; }
  S.camOn = !S.camOn;
  tracks.forEach(t => t.enabled = S.camOn);
  EL.btnCam.classList.toggle('off', !S.camOn);
  EL.btnCam.querySelector('i').className = S.camOn ? 'fas fa-video' : 'fas fa-video-slash';
  EL.localPlaceholder.classList.toggle('hidden', S.camOn);
  toast(S.camOn ? 'Camera on' : 'Camera off', 'info', 1400);
}

async function flipCamera() {
  if (!S.localStream || S.screenSharing) return;
  const vt = S.localStream.getVideoTracks()[0];
  if (!vt) { toast('No camera to flip', 'warning'); return; }
  const cur = vt.getSettings().facingMode;
  const next = cur === 'user' ? 'environment' : 'user';
  try {
    const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next } });
    const nt = ns.getVideoTracks()[0];
    const sender = S.pc?.getSenders().find(s => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(nt);
    vt.stop();
    S.localStream.removeTrack(vt);
    S.localStream.addTrack(nt);
    EL.localVideo.srcObject = S.localStream;
    toast('Camera flipped', 'success', 1400);
  } catch (e) {
    console.error(e);
    toast('Cannot flip camera', 'error');
  }
}

async function toggleScreen() {
  if (!S.pc) return;
  if (S.screenSharing) return stopScreen();
  try {
    const ss = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' } });
    S.screenStream = ss;
    const st = ss.getVideoTracks()[0];
    S.savedCamTrack = S.localStream?.getVideoTracks()[0] || null;
    const sender = S.pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(st);
    EL.localVideo.srcObject = ss;
    st.onended = () => stopScreen();
    S.screenSharing = true;
    EL.btnScreen.classList.add('sharing');
    EL.remoteBox.classList.add('screenshare');
    toast('Screen sharing', 'success');
  } catch (e) {
    if (e.name !== 'NotAllowedError') {
      console.error(e);
      toast('Screen share failed', 'error');
    }
  }
}

async function stopScreen() {
  if (S.screenStream) {
    S.screenStream.getTracks().forEach(t => t.stop());
    S.screenStream = null;
  }
  try {
    const ns = await navigator.mediaDevices.getUserMedia({ video: true });
    const nt = ns.getVideoTracks()[0];
    const sender = S.pc?.getSenders().find(s => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(nt);
    const old = S.localStream?.getVideoTracks()[0];
    if (old) { S.localStream.removeTrack(old); old.stop(); }
    if (S.localStream) S.localStream.addTrack(nt);
  } catch (e) {
    console.warn('restore cam:', e);
  }
  EL.localVideo.srcObject = S.localStream;
  S.screenSharing = false;
  S.savedCamTrack = null;
  EL.btnScreen.classList.remove('sharing');
  EL.remoteBox.classList.remove('screenshare');
  toast('Screen share stopped', 'info');
}

// ──────────────────────────────────────
//  REACTIONS
// ──────────────────────────────────────
function sendReaction(emoji) {
  wsSend({ type: 'reaction', emoji });
}

function showReactionBubble(emoji) {
  const el = document.createElement('div');
  el.className = 'reaction-bubble';
  el.textContent = emoji;
  el.style.left = (30 + Math.random() * 40) + '%';
  EL.reactionFloat.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ──────────────────────────────────────
//  HANG UP / CLEANUP
// ──────────────────────────────────────
function hangUp() {
  toast('Call ended', 'info');
  cleanup();
  switchScreen('lobbyScreen');
}

function closePeer() {
  if (S.pc) {
    S.pc.ontrack = null;
    S.pc.onicecandidate = null;
    S.pc.oniceconnectionstatechange = null;
    S.pc.onconnectionstatechange = null;
    S.pc.close();
    S.pc = null;
  }
  S.peerId = null;
  S.remoteDescSet = false;
  S.iceQueue = [];
  if (S.remoteStream) {
    S.remoteStream.getTracks().forEach(t => t.stop());
    S.remoteStream = null;
  }
  EL.remoteVideo.srcObject = null;
}

function cleanup() {
  // close websocket
  if (S.ws) {
    S.ws.onclose = null; // prevent reconnect
    S.ws.close();
    S.ws = null;
  }

  closePeer();
  stopMedia();

  // reset state
  S.micOn = true;
  S.camOn = true;
  S.screenSharing = false;
  S.screenStream = null;
  S.savedCamTrack = null;
  S.roomId = null;
  S.myId = null;
  S.peerId = null;
  S.isCreator = false;
  S.reconnectAttempts = 0;

  EL.remotePlaceholder.classList.remove('hidden');

  // reset UI
  EL.btnMic.classList.remove('off');
  EL.btnMic.querySelector('i').className = 'fas fa-microphone';
  EL.btnCam.classList.remove('off');
  EL.btnCam.querySelector('i').className = 'fas fa-video';
  EL.btnScreen.classList.remove('sharing');
  EL.remoteBox.classList.remove('screenshare');
  EL.reactionPicker.classList.add('hidden');
  EL.remoteNickname.textContent = 'Remote';

  stopTimer();
  EL.timer.textContent = '00:00';
  EL.statusLabel.textContent = 'Connecting…';
  EL.statusDot.className = 'status-dot';

  // reset pip position
  EL.localBox.style.cssText = '';
}

// ──────────────────────────────────────
//  TIMER
// ──────────────────────────────────────
function startTimer() {
  if (S.timerInterval) return;
  S.timerStart = Date.now();
  S.timerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - S.timerStart) / 1000);
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    EL.timer.textContent = `${m}:${sec}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(S.timerInterval);
  S.timerInterval = null;
  S.timerStart = null;
}

// ──────────────────────────────────────
//  COPY
// ──────────────────────────────────────
function copyRoom() {
  if (!S.roomId) return;
  navigator.clipboard.writeText(S.roomId)
    .then(() => toast('Room code copied!', 'success', 1600))
    .catch(() => {
      const i = document.createElement('input');
      i.value = S.roomId;
      document.body.appendChild(i);
      i.select();
      document.execCommand('copy');
      document.body.removeChild(i);
      toast('Room code copied!', 'success', 1600);
    });
}

// ──────────────────────────────────────
//  DRAG PIP
// ──────────────────────────────────────
function initDrag() {
  const el = EL.localBox;
  let sx, sy;

  function onStart(e) {
    S.dragging = true;
    el.style.transition = 'none';
    const r = el.getBoundingClientRect();
    const cx = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
    const cy = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;
    sx = cx - r.left;
    sy = cy - r.top;
    el.style.cursor = 'grabbing';
  }

  function onMove(e) {
    if (!S.dragging) return;
    e.preventDefault();
    const cx = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
    const cy = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;
    let nx = cx - sx, ny = cy - sy;
    const box = EL.videos.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    nx = Math.max(box.left + 4, Math.min(nx, box.right - er.width - 4));
    ny = Math.max(box.top + 4, Math.min(ny, box.bottom - er.height - 4));
    el.style.position = 'fixed';
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  function onEnd() {
    if (!S.dragging) return;
    S.dragging = false;
    el.style.cursor = 'grab';
    el.style.transition = '';
  }

  el.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  el.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
}
