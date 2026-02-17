// ============================================
// FIREBASE CONFIG
// ============================================
const firebaseConfig = {
    // ВСТАВЬТЕ СВОЙ FIREBASE CONFIG СЮДА
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================
// WEBRTC CONFIG
// ============================================
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

// ============================================
// APP STATE
// ============================================
const state = {
    localStream: null,
    remoteStream: null,
    peerConnection: null,
    roomId: null,
    isCreator: false,
    isMicOn: true,
    isCameraOn: true,
    isScreenSharing: false,
    screenStream: null,
    originalVideoTrack: null,
    callTimerInterval: null,
    callStartTime: null,
    unsubscribers: [],    // Firestore listener unsubscribers
    iceCandidatesQueue: [], // Queue ICE candidates until remote description is set
    remoteDescriptionSet: false,
    isDragging: false,
    dragOffset: { x: 0, y: 0 }
};

// ============================================
// DOM ELEMENTS
// ============================================
const DOM = {
    lobbyScreen: document.getElementById('lobby-screen'),
    callScreen: document.getElementById('call-screen'),
    roomIdInput: document.getElementById('room-id-input'),
    btnGenerate: document.getElementById('btn-generate'),
    btnCreate: document.getElementById('btn-create'),
    btnJoin: document.getElementById('btn-join'),
    lobbyStatus: document.getElementById('lobby-status'),
    localVideo: document.getElementById('local-video'),
    remoteVideo: document.getElementById('remote-video'),
    localPlaceholder: document.getElementById('local-placeholder'),
    remotePlaceholder: document.getElementById('remote-placeholder'),
    remoteVideoWrapper: document.getElementById('remote-video-wrapper'),
    localVideoWrapper: document.getElementById('local-video-wrapper'),
    btnToggleMic: document.getElementById('btn-toggle-mic'),
    btnToggleCamera: document.getElementById('btn-toggle-camera'),
    btnSwitchCamera: document.getElementById('btn-switch-camera'),
    btnScreenShare: document.getElementById('btn-screen-share'),
    btnHangup: document.getElementById('btn-hangup'),
    callStatusText: document.getElementById('call-status-text'),
    callTimer: document.getElementById('call-timer'),
    roomIdDisplay: document.getElementById('room-id-display'),
    btnCopyRoom: document.getElementById('btn-copy-room'),
    toastContainer: document.getElementById('toast-container'),
    particles: document.getElementById('particles'),
    videosContainer: document.getElementById('videos-container')
};

// ============================================
// INITIALIZATION
// ============================================
function init() {
    createParticles();
    bindEvents();
    // Generate a random room ID on load
    DOM.roomIdInput.value = generateId();
}

function createParticles() {
    const count = 30;
    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const size = Math.random() * 4 + 2;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDuration = (Math.random() * 15 + 10) + 's';
        particle.style.animationDelay = (Math.random() * 10) + 's';
        particle.style.opacity = 0;
        DOM.particles.appendChild(particle);
    }
}

function generateId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// ============================================
// EVENT BINDINGS
// ============================================
function bindEvents() {
    DOM.btnGenerate.addEventListener('click', () => {
        DOM.roomIdInput.value = generateId();
        addRipple(DOM.btnGenerate);
    });

    DOM.btnCreate.addEventListener('click', () => createRoom());
    DOM.btnJoin.addEventListener('click', () => joinRoom());
    DOM.btnToggleMic.addEventListener('click', () => toggleMic());
    DOM.btnToggleCamera.addEventListener('click', () => toggleCamera());
    DOM.btnSwitchCamera.addEventListener('click', () => switchCamera());
    DOM.btnScreenShare.addEventListener('click', () => toggleScreenShare());
    DOM.btnHangup.addEventListener('click', () => hangUp());
    DOM.btnCopyRoom.addEventListener('click', () => copyRoomId());

    // Enter key on input
    DOM.roomIdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            createRoom();
        }
    });

    // Draggable local video (PiP)
    initDraggable();
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info', duration = 3500) {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${icons[type]} toast-icon"></i>
        <span>${message}</span>
    `;

    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

function setLobbyStatus(message, type = '') {
    DOM.lobbyStatus.textContent = message;
    DOM.lobbyStatus.className = 'status-message ' + type;
}

// ============================================
// SCREEN MANAGEMENT
// ============================================
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ============================================
// MEDIA
// ============================================
async function getLocalStream() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            }
        });
        state.localStream = stream;
        DOM.localVideo.srcObject = stream;
        DOM.localPlaceholder.classList.add('hidden');
        return stream;
    } catch (err) {
        console.error('getUserMedia error:', err);

        // Try audio only
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.localStream = audioStream;
            state.isCameraOn = false;
            DOM.btnToggleCamera.classList.add('active');
            DOM.btnToggleCamera.querySelector('i').className = 'fas fa-video-slash';
            showToast('Camera unavailable, audio only', 'warning');
            return audioStream;
        } catch (audioErr) {
            showToast('Cannot access camera or microphone', 'error');
            throw audioErr;
        }
    }
}

function stopLocalStream() {
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => track.stop());
        state.localStream = null;
    }
    if (state.screenStream) {
        state.screenStream.getTracks().forEach(track => track.stop());
        state.screenStream = null;
    }
    DOM.localVideo.srcObject = null;
    DOM.localPlaceholder.classList.remove('hidden');
}

// ============================================
// PEER CONNECTION
// ============================================
function createPeerConnection() {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Reset state
    state.remoteDescriptionSet = false;
    state.iceCandidatesQueue = [];

    // Add local tracks
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => {
            pc.addTrack(track, state.localStream);
        });
    }

    // Remote stream
    state.remoteStream = new MediaStream();
    DOM.remoteVideo.srcObject = state.remoteStream;

    pc.ontrack = (event) => {
        console.log('Got remote track:', event.track.kind);
        event.streams[0].getTracks().forEach(track => {
            state.remoteStream.addTrack(track);
        });
        DOM.remotePlaceholder.classList.add('hidden');
    };

    pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        updateCallStatus(pc.iceConnectionState);

        if (pc.iceConnectionState === 'connected') {
            startCallTimer();
            showToast('Connected!', 'success');
        }

        if (pc.iceConnectionState === 'disconnected') {
            showToast('Peer disconnected', 'warning');
        }

        if (pc.iceConnectionState === 'failed') {
            showToast('Connection failed', 'error');
            // Try ICE restart
            tryIceRestart();
        }

        if (pc.iceConnectionState === 'closed') {
            // Peer gone
        }
    };

    pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            handlePeerDisconnect();
        }
    };

    state.peerConnection = pc;
    return pc;
}

function updateCallStatus(iceState) {
    const dot = document.querySelector('.call-status-dot');
    const text = DOM.callStatusText;

    switch (iceState) {
        case 'checking':
            text.textContent = 'Connecting...';
            dot.className = 'call-status-dot';
            break;
        case 'connected':
        case 'completed':
            text.textContent = 'Connected';
            dot.className = 'call-status-dot connected';
            break;
        case 'disconnected':
            text.textContent = 'Reconnecting...';
            dot.className = 'call-status-dot';
            break;
        case 'failed':
            text.textContent = 'Connection failed';
            dot.className = 'call-status-dot';
            break;
        case 'closed':
            text.textContent = 'Call ended';
            dot.className = 'call-status-dot';
            break;
        default:
            text.textContent = 'Connecting...';
    }
}

async function tryIceRestart() {
    if (!state.peerConnection || !state.isCreator) return;
    try {
        const offer = await state.peerConnection.createOffer({ iceRestart: true });
        await state.peerConnection.setLocalDescription(offer);
        const roomRef = db.collection('rooms').doc(state.roomId);
        await roomRef.update({
            offer: { type: offer.type, sdp: offer.sdp }
        });
        console.log('ICE restart initiated');
    } catch (e) {
        console.error('ICE restart failed:', e);
    }
}

function handlePeerDisconnect() {
    DOM.remotePlaceholder.classList.remove('hidden');
    stopCallTimer();
}

// ============================================
// ROOM CREATION (Caller)
// ============================================
async function createRoom() {
    const roomId = DOM.roomIdInput.value.trim().toUpperCase();
    if (!roomId) {
        setLobbyStatus('Please enter a Room ID', 'error');
        shakeElement(DOM.roomIdInput.parentElement);
        return;
    }

    setButtonLoading(DOM.btnCreate, true);
    setButtonLoading(DOM.btnJoin, true);

    try {
        // Check if room already exists
        const roomRef = db.collection('rooms').doc(roomId);
        const roomDoc = await roomRef.get();
        if (roomDoc.exists) {
            setLobbyStatus('Room already exists. Join or use another ID.', 'error');
            setButtonLoading(DOM.btnCreate, false);
            setButtonLoading(DOM.btnJoin, false);
            return;
        }

        await getLocalStream();

        state.roomId = roomId;
        state.isCreator = true;

        const pc = createPeerConnection();

        // Collect ICE candidates
        const callerCandidatesRef = roomRef.collection('callerCandidates');

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                callerCandidatesRef.add(event.candidate.toJSON());
            }
        };

        // Create offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await roomRef.set({
            offer: { type: offer.type, sdp: offer.sdp },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        DOM.roomIdDisplay.textContent = roomId;
        switchScreen('call-screen');
        showToast(`Room "${roomId}" created. Waiting for peer...`, 'info');

        // Listen for answer
        const unsubRoom = roomRef.onSnapshot(async (snapshot) => {
            const data = snapshot.data();
            if (!data) return;

            if (data.answer && pc.signalingState === 'have-local-offer') {
                console.log('Got answer');
                const answer = new RTCSessionDescription(data.answer);
                await pc.setRemoteDescription(answer);
                state.remoteDescriptionSet = true;
                processIceCandidateQueue();
            }
        });
        state.unsubscribers.push(unsubRoom);

        // Listen for callee ICE candidates
        const unsubCallee = roomRef.collection('calleeCandidates').onSnapshot((snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    if (state.remoteDescriptionSet) {
                        await pc.addIceCandidate(candidate).catch(console.error);
                    } else {
                        state.iceCandidatesQueue.push(candidate);
                    }
                }
            });
        });
        state.unsubscribers.push(unsubCallee);

    } catch (err) {
        console.error('Create room error:', err);
        setLobbyStatus('Failed to create room', 'error');
        showToast('Failed to create room', 'error');
        cleanupCall();
    } finally {
        setButtonLoading(DOM.btnCreate, false);
        setButtonLoading(DOM.btnJoin, false);
    }
}

// ============================================
// ROOM JOIN (Callee)
// ============================================
async function joinRoom() {
    const roomId = DOM.roomIdInput.value.trim().toUpperCase();
    if (!roomId) {
        setLobbyStatus('Please enter a Room ID', 'error');
        shakeElement(DOM.roomIdInput.parentElement);
        return;
    }

    setButtonLoading(DOM.btnCreate, true);
    setButtonLoading(DOM.btnJoin, true);

    try {
        const roomRef = db.collection('rooms').doc(roomId);
        const roomDoc = await roomRef.get();

        if (!roomDoc.exists) {
            setLobbyStatus('Room not found', 'error');
            showToast('Room does not exist', 'error');
            setButtonLoading(DOM.btnCreate, false);
            setButtonLoading(DOM.btnJoin, false);
            return;
        }

        await getLocalStream();

        state.roomId = roomId;
        state.isCreator = false;

        const pc = createPeerConnection();

        // Collect ICE candidates
        const calleeCandidatesRef = roomRef.collection('calleeCandidates');

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                calleeCandidatesRef.add(event.candidate.toJSON());
            }
        };

        // Set remote description (offer)
        const data = roomDoc.data();
        const offer = new RTCSessionDescription(data.offer);
        await pc.setRemoteDescription(offer);
        state.remoteDescriptionSet = true;

        // Create answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await roomRef.update({
            answer: { type: answer.type, sdp: answer.sdp }
        });

        DOM.roomIdDisplay.textContent = roomId;
        switchScreen('call-screen');
        showToast(`Joined room "${roomId}"`, 'success');

        // Process any queued ICE candidates
        processIceCandidateQueue();

        // Listen for caller ICE candidates
        const unsubCaller = roomRef.collection('callerCandidates').onSnapshot((snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    if (state.remoteDescriptionSet) {
                        await pc.addIceCandidate(candidate).catch(console.error);
                    } else {
                        state.iceCandidatesQueue.push(candidate);
                    }
                }
            });
        });
        state.unsubscribers.push(unsubCaller);

        // Listen for room deletion (caller hung up)
        const unsubRoom = roomRef.onSnapshot((snapshot) => {
            if (!snapshot.exists) {
                showToast('Peer ended the call', 'info');
                cleanupCall();
                switchScreen('lobby-screen');
            }
        });
        state.unsubscribers.push(unsubRoom);

    } catch (err) {
        console.error('Join room error:', err);
        setLobbyStatus('Failed to join room', 'error');
        showToast('Failed to join room', 'error');
        cleanupCall();
    } finally {
        setButtonLoading(DOM.btnCreate, false);
        setButtonLoading(DOM.btnJoin, false);
    }
}

// ============================================
// ICE CANDIDATE QUEUE
// ============================================
async function processIceCandidateQueue() {
    if (!state.peerConnection) return;
    while (state.iceCandidatesQueue.length > 0) {
        const candidate = state.iceCandidatesQueue.shift();
        try {
            await state.peerConnection.addIceCandidate(candidate);
        } catch (e) {
            console.error('Error adding queued ICE candidate:', e);
        }
    }
}

// ============================================
// CALL CONTROLS
// ============================================
function toggleMic() {
    if (!state.localStream) return;
    const audioTracks = state.localStream.getAudioTracks();
    if (audioTracks.length === 0) {
        showToast('No microphone available', 'warning');
        return;
    }

    state.isMicOn = !state.isMicOn;
    audioTracks.forEach(track => track.enabled = state.isMicOn);

    DOM.btnToggleMic.classList.toggle('active', !state.isMicOn);
    DOM.btnToggleMic.querySelector('i').className = state.isMicOn ? 'fas fa-microphone' : 'fas fa-microphone-slash';
    showToast(state.isMicOn ? 'Microphone on' : 'Microphone muted', 'info', 1500);
}

function toggleCamera() {
    if (!state.localStream) return;
    const videoTracks = state.localStream.getVideoTracks();
    if (videoTracks.length === 0) {
        showToast('No camera available', 'warning');
        return;
    }

    state.isCameraOn = !state.isCameraOn;
    videoTracks.forEach(track => track.enabled = state.isCameraOn);

    DOM.btnToggleCamera.classList.toggle('active', !state.isCameraOn);
    DOM.btnToggleCamera.querySelector('i').className = state.isCameraOn ? 'fas fa-video' : 'fas fa-video-slash';
    DOM.localPlaceholder.classList.toggle('hidden', state.isCameraOn);
    showToast(state.isCameraOn ? 'Camera on' : 'Camera off', 'info', 1500);
}

async function switchCamera() {
    if (!state.localStream || state.isScreenSharing) return;

    const videoTrack = state.localStream.getVideoTracks()[0];
    if (!videoTrack) {
        showToast('No camera to switch', 'warning');
        return;
    }

    const currentFacing = videoTrack.getSettings().facingMode;
    const newFacing = currentFacing === 'user' ? 'environment' : 'user';

    try {
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: newFacing }
        });

        const newVideoTrack = newStream.getVideoTracks()[0];

        // Replace track in peer connection
        if (state.peerConnection) {
            const sender = state.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(newVideoTrack);
            }
        }

        // Replace in local stream
        videoTrack.stop();
        state.localStream.removeTrack(videoTrack);
        state.localStream.addTrack(newVideoTrack);
        DOM.localVideo.srcObject = state.localStream;

        showToast('Camera switched', 'success', 1500);
    } catch (err) {
        console.error('Switch camera error:', err);
        showToast('Cannot switch camera', 'error');
    }
}

async function toggleScreenShare() {
    if (!state.peerConnection) return;

    if (state.isScreenSharing) {
        // Stop screen share, restore camera
        await stopScreenShare();
    } else {
        // Start screen share
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });

            state.screenStream = screenStream;
            const screenTrack = screenStream.getVideoTracks()[0];

            // Save original video track
            state.originalVideoTrack = state.localStream.getVideoTracks()[0] || null;

            // Replace track in peer connection
            const sender = state.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(screenTrack);
            }

            // Update local video preview
            DOM.localVideo.srcObject = screenStream;

            // Handle user stopping share via browser UI
            screenTrack.onended = () => {
                stopScreenShare();
            };

            state.isScreenSharing = true;
            DOM.btnScreenShare.classList.add('active');
            DOM.remoteVideoWrapper.classList.add('screen-sharing');
            showToast('Screen sharing started', 'success');
        } catch (err) {
            if (err.name !== 'NotAllowedError') {
                console.error('Screen share error:', err);
                showToast('Failed to share screen', 'error');
            }
        }
    }
}

async function stopScreenShare() {
    if (state.screenStream) {
        state.screenStream.getTracks().forEach(t => t.stop());
        state.screenStream = null;
    }

    // Restore original camera track
    if (state.originalVideoTrack && state.peerConnection) {
        const sender = state.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
            // Get a new camera track since the old one might be stopped
            try {
                const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
                const newTrack = newStream.getVideoTracks()[0];
                await sender.replaceTrack(newTrack);

                // Update local stream
                const oldTrack = state.localStream.getVideoTracks()[0];
                if (oldTrack) {
                    state.localStream.removeTrack(oldTrack);
                }
                state.localStream.addTrack(newTrack);
            } catch (e) {
                console.error('Error restoring camera:', e);
            }
        }
    }

    DOM.localVideo.srcObject = state.localStream;
    state.isScreenSharing = false;
    state.originalVideoTrack = null;
    DOM.btnScreenShare.classList.remove('active');
    DOM.remoteVideoWrapper.classList.remove('screen-sharing');
    showToast('Screen sharing stopped', 'info');
}

// ============================================
// HANG UP & CLEANUP
// ============================================
async function hangUp() {
    showToast('Call ended', 'info');

    // Delete room from Firestore
    if (state.roomId) {
        try {
            const roomRef = db.collection('rooms').doc(state.roomId);

            // Delete subcollections
            const callerCandidates = await roomRef.collection('callerCandidates').get();
            callerCandidates.forEach(doc => doc.ref.delete());

            const calleeCandidates = await roomRef.collection('calleeCandidates').get();
            calleeCandidates.forEach(doc => doc.ref.delete());

            await roomRef.delete();
        } catch (e) {
            console.error('Error cleaning up Firestore:', e);
        }
    }

    cleanupCall();
    switchScreen('lobby-screen');
}

function cleanupCall() {
    // Unsubscribe from all Firestore listeners
    state.unsubscribers.forEach(unsub => {
        try { unsub(); } catch (e) {}
    });
    state.unsubscribers = [];

    // Close peer connection
    if (state.peerConnection) {
        state.peerConnection.ontrack = null;
        state.peerConnection.onicecandidate = null;
        state.peerConnection.oniceconnectionstatechange = null;
        state.peerConnection.onconnectionstatechange = null;
        state.peerConnection.close();
        state.peerConnection = null;
    }

    // Stop all media
    stopLocalStream();

    // Clean remote
    if (state.remoteStream) {
        state.remoteStream.getTracks().forEach(t => t.stop());
        state.remoteStream = null;
    }
    DOM.remoteVideo.srcObject = null;
    DOM.remotePlaceholder.classList.remove('hidden');

    // Reset UI state
    state.isMicOn = true;
    state.isCameraOn = true;
    state.isScreenSharing = false;
    state.screenStream = null;
    state.originalVideoTrack = null;
    state.remoteDescriptionSet = false;
    state.iceCandidatesQueue = [];
    state.roomId = null;
    state.isCreator = false;

    DOM.btnToggleMic.classList.remove('active');
    DOM.btnToggleMic.querySelector('i').className = 'fas fa-microphone';
    DOM.btnToggleCamera.classList.remove('active');
    DOM.btnToggleCamera.querySelector('i').className = 'fas fa-video';
    DOM.btnScreenShare.classList.remove('active');
    DOM.remoteVideoWrapper.classList.remove('screen-sharing');

    stopCallTimer();
    DOM.callTimer.textContent = '00:00';
    DOM.callStatusText.textContent = 'Connecting...';
    document.querySelector('.call-status-dot').className = 'call-status-dot';

    // Reset local video wrapper position
    DOM.localVideoWrapper.style.transform = '';
    DOM.localVideoWrapper.style.left = '';
    DOM.localVideoWrapper.style.top = '';
}

// ============================================
// CALL TIMER
// ============================================
function startCallTimer() {
    if (state.callTimerInterval) return;
    state.callStartTime = Date.now();
    state.callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.callStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        DOM.callTimer.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopCallTimer() {
    if (state.callTimerInterval) {
        clearInterval(state.callTimerInterval);
        state.callTimerInterval = null;
    }
    state.callStartTime = null;
}

// ============================================
// COPY ROOM ID
// ============================================
function copyRoomId() {
    if (!state.roomId) return;
    navigator.clipboard.writeText(state.roomId).then(() => {
        showToast('Room ID copied!', 'success', 1500);
    }).catch(() => {
        // Fallback
        const input = document.createElement('input');
        input.value = state.roomId;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('Room ID copied!', 'success', 1500);
    });
}

// ============================================
// DRAGGABLE LOCAL VIDEO (PiP)
// ============================================
function initDraggable() {
    const el = DOM.localVideoWrapper;
    let startX, startY, initialX, initialY;

    const onStart = (e) => {
        if (e.target.closest('.control-btn')) return;
        state.isDragging = true;
        el.style.transition = 'none';

        const rect = el.getBoundingClientRect();
        const clientX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
        const clientY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;

        startX = clientX - rect.left;
        startY = clientY - rect.top;
        initialX = rect.left;
        initialY = rect.top;

        el.style.cursor = 'grabbing';
    };

    const onMove = (e) => {
        if (!state.isDragging) return;
        e.preventDefault();

        const clientX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
        const clientY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;

        let newX = clientX - startX;
        let newY = clientY - startY;

        // Boundary constraints
        const container = DOM.videosContainer.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();

        newX = Math.max(container.left, Math.min(newX, container.right - elRect.width));
        newY = Math.max(container.top, Math.min(newY, container.bottom - elRect.height));

        el.style.position = 'fixed';
        el.style.left = newX + 'px';
        el.style.top = newY + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    };

    const onEnd = () => {
        if (!state.isDragging) return;
        state.isDragging = false;
        el.style.cursor = 'grab';
        el.style.transition = '';
    };

    el.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);

    el.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
}

// ============================================
// UI HELPERS
// ============================================
function setButtonLoading(btn, loading) {
    btn.disabled = loading;
    if (loading) {
        btn.dataset.originalText = btn.querySelector('span')?.textContent || '';
        const span = btn.querySelector('span');
        if (span) span.textContent = '...';
    } else {
        const span = btn.querySelector('span');
        if (span && btn.dataset.originalText) {
            span.textContent = btn.dataset.originalText;
        }
    }
}

function shakeElement(el) {
    el.style.animation = 'none';
    el.offsetHeight; // Trigger reflow
    el.style.animation = 'shake 0.4s ease';
    el.addEventListener('animationend', () => {
        el.style.animation = '';
    }, { once: true });
}

// Add shake keyframe dynamically
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-8px); }
        40% { transform: translateX(8px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
    }
`;
document.head.appendChild(shakeStyle);

function addRipple(element) {
    const ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = '50%';
    ripple.style.top = '50%';
    ripple.style.marginLeft = -(size / 2) + 'px';
    ripple.style.marginTop = -(size / 2) + 'px';
    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
}

// ============================================
// START APP
// ============================================
init();
