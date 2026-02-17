// ──────────────────────────────────────
//  FIREBASE CONFIG  — вставь свой конфиг
// ──────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyA3GihMONMwFr7cFLfiqnoLfmqpMgRF3NY",
    authDomain: "webrtc-video-call-c location.projectId",
    projectId: "webrtc-video-call-c0804",
    storageBucket: "webrtc-video-call-c0804.firebasestorage.app",
    messagingSenderId: "757129908098",
    appId: "1:757129908098:web:a3a42ff25e3d3e67c71ed8"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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
    pc: null,
    localStream: null,
    remoteStream: null,
    roomId: null,
    isCreator: false,
    micOn: true,
    camOn: true,
    screenSharing: false,
    screenStream: null,
    savedCamTrack: null,
    timerInterval: null,
    timerStart: null,
    unsubs: [],           // firestore unsubscribe functions
    iceQueue: [],         // buffered ICE candidates
    remoteDescSet: false, // flag: remote description applied
    dragging: false,
};

// ──────────────────────────────────────
//  DOM
// ──────────────────────────────────────
const $ = id => document.getElementById(id);

const EL = {
    lobbyScreen:     $('lobbyScreen'),
    callScreen:      $('callScreen'),
    roomInput:       $('roomInput'),
    btnDice:         $('btnDice'),
    btnCreate:       $('btnCreate'),
    btnJoin:         $('btnJoin'),
    lobbyStatus:     $('lobbyStatus'),
    localVideo:      $('localVideo'),
    remoteVideo:     $('remoteVideo'),
    localPlaceholder:$('localPlaceholder'),
    remotePlaceholder:$('remotePlaceholder'),
    localBox:        $('localBox'),
    remoteBox:       $('remoteBox'),
    videos:          $('videos'),
    btnMic:          $('btnMic'),
    btnCam:          $('btnCam'),
    btnFlip:         $('btnFlip'),
    btnScreen:       $('btnScreen'),
    btnHangup:       $('btnHangup'),
    statusDot:       $('statusDot'),
    statusLabel:     $('statusLabel'),
    timer:           $('timer'),
    roomDisplay:     $('roomDisplay'),
    btnCopy:         $('btnCopy'),
    toastStack:      $('toastStack'),
    particles:       $('particles'),
};

// ──────────────────────────────────────
//  BOOT
// ──────────────────────────────────────
(function boot() {
    spawnParticles();
    EL.roomInput.value = randomCode();
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
    const icons = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info', warning:'fa-triangle-exclamation' };
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
    EL.btnCreate.onclick = () => createRoom();
    EL.btnJoin.onclick   = () => joinRoom();
    EL.roomInput.addEventListener('keydown', e => { if (e.key === 'Enter') createRoom(); });

    EL.btnMic.onclick    = toggleMic;
    EL.btnCam.onclick    = toggleCam;
    EL.btnFlip.onclick   = flipCamera;
    EL.btnScreen.onclick = toggleScreen;
    EL.btnHangup.onclick = hangUp;
    EL.btnCopy.onclick   = copyRoom;

    initDrag();
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
            // avoid duplicates
            if (!S.remoteStream.getTracks().find(x => x.id === t.id)) {
                S.remoteStream.addTrack(t);
            }
        });
        EL.remotePlaceholder.classList.add('hidden');
    };

    pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        console.log('ICE:', st);
        updateStatusUI(st);
        if (st === 'connected' || st === 'completed') { startTimer(); toast('Connected!', 'success'); }
        if (st === 'disconnected') toast('Peer disconnected…', 'warning');
        if (st === 'failed') { toast('Connection failed', 'error'); iceRestart(); }
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

function updateStatusUI(st) {
    const dot = EL.statusDot;
    const lbl = EL.statusLabel;
    switch (st) {
        case 'checking':     lbl.textContent = 'Connecting…'; dot.className = 'status-dot'; break;
        case 'connected':
        case 'completed':    lbl.textContent = 'Connected'; dot.className = 'status-dot on'; break;
        case 'disconnected': lbl.textContent = 'Reconnecting…'; dot.className = 'status-dot'; break;
        case 'failed':       lbl.textContent = 'Failed'; dot.className = 'status-dot'; break;
        default:             lbl.textContent = 'Connecting…'; dot.className = 'status-dot';
    }
}

async function iceRestart() {
    if (!S.pc || !S.isCreator) return;
    try {
        const offer = await S.pc.createOffer({ iceRestart: true });
        await S.pc.setLocalDescription(offer);
        const ref = db.collection('rooms').doc(S.roomId);
        await ref.update({ offer: { type: offer.type, sdp: offer.sdp } });
    } catch (e) { console.error('ICE restart err:', e); }
}

async function flushIceQueue() {
    while (S.iceQueue.length) {
        const c = S.iceQueue.shift();
        try { await S.pc.addIceCandidate(c); } catch (e) { console.warn('addIceCandidate err:', e); }
    }
}

async function addOrQueueCandidate(data) {
    const candidate = new RTCIceCandidate(data);
    if (S.remoteDescSet) {
        await S.pc.addIceCandidate(candidate).catch(e => console.warn(e));
    } else {
        S.iceQueue.push(candidate);
    }
}

// ──────────────────────────────────────
//  CREATE ROOM (caller)
// ──────────────────────────────────────
async function createRoom() {
    const id = EL.roomInput.value.trim().toUpperCase();
    if (!id) { setStatus('Enter a room code', 'err'); shake(EL.roomInput.parentElement); return; }

    btnLoading(EL.btnCreate, true);
    btnLoading(EL.btnJoin, true);

    try {
        const roomRef = db.collection('rooms').doc(id);
        const snap = await roomRef.get();
        if (snap.exists) {
            setStatus('Room already exists — join it or pick another code', 'err');
            btnLoading(EL.btnCreate, false); btnLoading(EL.btnJoin, false);
            return;
        }

        await getMedia();
        S.roomId = id;
        S.isCreator = true;

        const pc = makePeer();

        // ICE → Firestore
        const callerCandRef = roomRef.collection('callerCandidates');
        pc.onicecandidate = e => { if (e.candidate) callerCandRef.add(e.candidate.toJSON()); };

        // create offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await roomRef.set({
            offer: { type: offer.type, sdp: offer.sdp },
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        // switch UI
        EL.roomDisplay.textContent = id;
        switchScreen('callScreen');
        toast(`Room "${id}" created — waiting for peer`, 'info');

        // listen for answer
        const unRoom = roomRef.onSnapshot(async snap => {
            const d = snap.data();
            if (!d) return;
            if (d.answer && pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(d.answer));
                S.remoteDescSet = true;
                flushIceQueue();
            }
        });
        S.unsubs.push(unRoom);

        // listen for callee candidates
        const unCallee = roomRef.collection('calleeCandidates').onSnapshot(snap => {
            snap.docChanges().forEach(ch => {
                if (ch.type === 'added') addOrQueueCandidate(ch.doc.data());
            });
        });
        S.unsubs.push(unCallee);

    } catch (e) {
        console.error('createRoom:', e);
        setStatus('Failed to create room', 'err');
        toast('Error creating room', 'error');
        cleanup();
    } finally {
        btnLoading(EL.btnCreate, false);
        btnLoading(EL.btnJoin, false);
    }
}

// ──────────────────────────────────────
//  JOIN ROOM (callee)
// ──────────────────────────────────────
async function joinRoom() {
    const id = EL.roomInput.value.trim().toUpperCase();
    if (!id) { setStatus('Enter a room code', 'err'); shake(EL.roomInput.parentElement); return; }

    btnLoading(EL.btnCreate, true);
    btnLoading(EL.btnJoin, true);

    try {
        const roomRef = db.collection('rooms').doc(id);
        const snap = await roomRef.get();
        if (!snap.exists) {
            setStatus('Room not found', 'err');
            toast('Room does not exist', 'error');
            btnLoading(EL.btnCreate, false); btnLoading(EL.btnJoin, false);
            return;
        }

        await getMedia();
        S.roomId = id;
        S.isCreator = false;

        const pc = makePeer();

        const calleeCandRef = roomRef.collection('calleeCandidates');
        pc.onicecandidate = e => { if (e.candidate) calleeCandRef.add(e.candidate.toJSON()); };

        // set remote (offer)
        const data = snap.data();
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        S.remoteDescSet = true;
        flushIceQueue();

        // create answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await roomRef.update({ answer: { type: answer.type, sdp: answer.sdp } });

        EL.roomDisplay.textContent = id;
        switchScreen('callScreen');
        toast(`Joined room "${id}"`, 'success');

        // listen caller candidates
        const unCaller = roomRef.collection('callerCandidates').onSnapshot(snap => {
            snap.docChanges().forEach(ch => {
                if (ch.type === 'added') addOrQueueCandidate(ch.doc.data());
            });
        });
        S.unsubs.push(unCaller);

        // detect room deletion (caller hung up)
        const unRoom = roomRef.onSnapshot(snap => {
            if (!snap.exists) {
                toast('Peer ended the call', 'info');
                cleanup();
                switchScreen('lobbyScreen');
            }
        });
        S.unsubs.push(unRoom);

    } catch (e) {
        console.error('joinRoom:', e);
        setStatus('Failed to join room', 'err');
        toast('Error joining room', 'error');
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
    } catch (e) { console.error(e); toast('Cannot flip camera', 'error'); }
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
        if (e.name !== 'NotAllowedError') { console.error(e); toast('Screen share failed', 'error'); }
    }
}

async function stopScreen() {
    if (S.screenStream) { S.screenStream.getTracks().forEach(t => t.stop()); S.screenStream = null; }
    // restore camera
    try {
        const ns = await navigator.mediaDevices.getUserMedia({ video: true });
        const nt = ns.getVideoTracks()[0];
        const sender = S.pc?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(nt);
        const old = S.localStream?.getVideoTracks()[0];
        if (old) { S.localStream.removeTrack(old); old.stop(); }
        if (S.localStream) S.localStream.addTrack(nt);
    } catch (e) { console.warn('restore cam:', e); }
    EL.localVideo.srcObject = S.localStream;
    S.screenSharing = false;
    S.savedCamTrack = null;
    EL.btnScreen.classList.remove('sharing');
    EL.remoteBox.classList.remove('screenshare');
    toast('Screen share stopped', 'info');
}

// ──────────────────────────────────────
//  HANG UP / CLEANUP
// ──────────────────────────────────────
async function hangUp() {
    toast('Call ended', 'info');
    if (S.roomId) {
        try {
            const ref = db.collection('rooms').doc(S.roomId);
            const [cc, kc] = await Promise.all([
                ref.collection('callerCandidates').get(),
                ref.collection('calleeCandidates').get(),
            ]);
            const batch = db.batch();
            cc.forEach(d => batch.delete(d.ref));
            kc.forEach(d => batch.delete(d.ref));
            batch.delete(ref);
            await batch.commit();
        } catch (e) { console.warn('cleanup firestore:', e); }
    }
    cleanup();
    switchScreen('lobbyScreen');
}

function cleanup() {
    // unsubscribe listeners
    S.unsubs.forEach(u => { try { u(); } catch (_) {} });
    S.unsubs = [];

    // close peer
    if (S.pc) {
        S.pc.ontrack = null;
        S.pc.onicecandidate = null;
        S.pc.oniceconnectionstatechange = null;
        S.pc.onconnectionstatechange = null;
        S.pc.close();
        S.pc = null;
    }

    stopMedia();

    if (S.remoteStream) {
        S.remoteStream.getTracks().forEach(t => t.stop());
        S.remoteStream = null;
    }
    EL.remoteVideo.srcObject = null;
    EL.remotePlaceholder.classList.remove('hidden');

    // reset state
    S.micOn = true; S.camOn = true;
    S.screenSharing = false; S.screenStream = null; S.savedCamTrack = null;
    S.remoteDescSet = false; S.iceQueue = [];
    S.roomId = null; S.isCreator = false;

    // reset UI
    EL.btnMic.classList.remove('off');
    EL.btnMic.querySelector('i').className = 'fas fa-microphone';
    EL.btnCam.classList.remove('off');
    EL.btnCam.querySelector('i').className = 'fas fa-video';
    EL.btnScreen.classList.remove('sharing');
    EL.remoteBox.classList.remove('screenshare');

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
            i.value = S.roomId; document.body.appendChild(i);
            i.select(); document.execCommand('copy');
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
        sx = cx - r.left; sy = cy - r.top;
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
        el.style.left = nx + 'px'; el.style.top = ny + 'px';
        el.style.right = 'auto'; el.style.bottom = 'auto';
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
