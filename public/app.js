// ===== DOM =====
const joinScreen=document.getElementById('join-screen'),callScreen=document.getElementById('call-screen'),roomInput=document.getElementById('room-input'),nicknameInput=document.getElementById('nickname-input'),joinBtn=document.getElementById('join-btn'),randomBtn=document.getElementById('random-btn'),statusText=document.getElementById('status-text'),callStatus=document.getElementById('call-status'),localVideo=document.getElementById('local-video'),hangUp=document.getElementById('hang-up'),volumeSlider=document.getElementById('volume-slider'),settingsBtn=document.getElementById('settings-btn'),settingsModal=document.getElementById('settings-modal'),settingsClose=document.getElementById('settings-close'),micSelect=document.getElementById('mic-select'),speakerSelect=document.getElementById('speaker-select'),camSelect=document.getElementById('cam-select'),applyCamBtn=document.getElementById('apply-cam-btn'),noiseToggle=document.getElementById('noise-toggle'),echoToggle=document.getElementById('echo-toggle'),micLevel=document.getElementById('mic-level'),localOverlay=document.getElementById('local-overlay'),localSpeaking=document.getElementById('local-speaking'),indicatorMic=document.getElementById('indicator-mic'),indicatorCam=document.getElementById('indicator-cam'),sidebarRoom=document.getElementById('sidebar-room'),topRoomName=document.getElementById('top-room-name'),connectionQuality=document.getElementById('connection-quality'),channelUsersList=document.getElementById('channel-users-list'),videosContainer=document.getElementById('videos'),reactionsFloat=document.getElementById('reactions-float'),toastContainer=document.getElementById('toast-container'),inviteBtn=document.getElementById('invite-btn'),copiedTooltip=document.getElementById('copied-tooltip'),chatPanel=document.getElementById('chat-panel'),chatMessages=document.getElementById('chat-messages'),chatInput=document.getElementById('chat-input'),chatSend=document.getElementById('chat-send'),chatClose=document.getElementById('chat-close'),chatToggleBtn=document.getElementById('chat-toggle-btn'),typingIndicator=document.getElementById('typing-indicator'),typingText=document.getElementById('typing-text'),localVideoName=document.getElementById('local-video-name'),sidebarSelfName=document.getElementById('sidebar-self-name'),panelSelfName=document.getElementById('panel-self-name');

const toggleMicBtns=[document.getElementById('toggle-mic'),document.getElementById('toggle-mic-2')];
const toggleCamBtns=[document.getElementById('toggle-cam'),document.getElementById('toggle-cam-2')];
const switchCamBtn=document.getElementById('switch-cam-btn');
const toggleScreenBtn=document.getElementById('toggle-screen-btn');
const toggleFullscreen=document.getElementById('toggle-fullscreen');

// ===== STATE =====
let ws=null,localStream=null,screenStream=null,myId=null,myNickname='You';
let micOn=true,camOn=true,screenOn=false;
let monitorCtx=null,analyser=null,animFrameId=null;
let cameraList=[],currentCamIndex=0;
let reconnectTimer=null,currentRoom=null;
let chatOpen=false,unreadCount=0;
let typingTimeout=null,lastTypingSent=0;
const mutedUsers=new Set();
const userNames=new Map();
const peers=new Map();

const ICE={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},{urls:'stun:stun2.l.google.com:19302'}]};

// ===== SOUNDS =====
const AudioCtx=window.AudioContext||window.webkitAudioContext;
function playTone(freq,dur,type,vol){
  try{const c=new AudioCtx(),o=c.createOscillator(),g=c.createGain();o.type=type||'sine';o.frequency.value=freq;g.gain.value=vol||0.15;o.connect(g);g.connect(c.destination);o.start();g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+dur);o.stop(c.currentTime+dur);setTimeout(()=>c.close(),dur*1000+100);}catch(e){}
}
function soundJoin(){playTone(880,0.15,'sine',0.12);setTimeout(()=>playTone(1100,0.15,'sine',0.12),100);}
function soundLeave(){playTone(600,0.15,'sine',0.12);setTimeout(()=>playTone(440,0.2,'sine',0.12),100);}
function soundMsg(){playTone(1200,0.08,'sine',0.08);}
function soundReaction(){playTone(1400,0.06,'sine',0.06);setTimeout(()=>playTone(1600,0.06,'sine',0.06),60);}

// ===== UTILS =====
function genId(){return Math.random().toString(36).substr(2,8);}
function setStatus(t){callStatus.textContent=t;}
function escHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}

function showToast(html){
  const t=document.createElement('div');t.className='toast';t.innerHTML=html;
  toastContainer.appendChild(t);setTimeout(()=>t.remove(),3000);
}

// ===== MEDIA =====
async function getMedia(){
  try{localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:{noiseSuppression:noiseToggle.checked,echoCancellation:echoToggle.checked,autoGainControl:true}});}
  catch(e){try{localStream=await navigator.mediaDevices.getUserMedia({video:false,audio:true});camOn=false;updateCamUI();localOverlay.classList.remove('hidden');}catch(e2){statusText.textContent='❌ No camera/mic access';return false;}}
  localVideo.srcObject=localStream;startAudioMonitor();await refreshDevices();await updateCameraList();return true;
}

// ===== AUDIO =====
function startAudioMonitor(){
  try{if(monitorCtx)monitorCtx.close();monitorCtx=new AudioCtx();const s=monitorCtx.createMediaStreamSource(localStream);analyser=monitorCtx.createAnalyser();analyser.fftSize=256;s.connect(analyser);animLoop();}catch(e){}
}
function animLoop(){
  if(!analyser)return;const d=new Uint8Array(analyser.frequencyBinCount);
  (function tick(){analyser.getByteFrequencyData(d);let s=0;for(let i=0;i<d.length;i++)s+=d[i];const a=s/d.length,p=Math.min(100,(a/128)*100);micLevel.style.width=p+'%';localSpeaking.classList.toggle('hidden',!(p>10&&micOn));animFrameId=requestAnimationFrame(tick);})();
}
function monitorRemoteAudio(stream,id){
  try{const c=new AudioCtx(),s=c.createMediaStreamSource(stream),a=c.createAnalyser();a.fftSize=256;s.connect(a);const d=new Uint8Array(a.frequencyBinCount);
  (function chk(){a.getByteFrequencyData(d);let s=0;for(let i=0;i<d.length;i++)s+=d[i];const el=document.getElementById('sp-'+id);if(el)el.classList.toggle('hidden',(s/d.length)<=8);requestAnimationFrame(chk);})();}catch(e){}
}

// ===== DEVICES =====
async function refreshDevices(){
  try{const devs=await navigator.mediaDevices.enumerateDevices();micSelect.innerHTML='';speakerSelect.innerHTML='';camSelect.innerHTML='';
  devs.forEach(d=>{const o=document.createElement('option');o.value=d.deviceId;o.text=d.label||d.kind+' '+d.deviceId.slice(0,6);if(d.kind==='audioinput')micSelect.appendChild(o);else if(d.kind==='audiooutput')speakerSelect.appendChild(o);else if(d.kind==='videoinput')camSelect.appendChild(o);});
  if(!speakerSelect.options.length){const o=document.createElement('option');o.text='Default';speakerSelect.appendChild(o);}
  const ct=localStream?.getVideoTracks()[0];if(ct)for(let i=0;i<camSelect.options.length;i++)if(camSelect.options[i].text===ct.label){camSelect.selectedIndex=i;break;}}catch(e){}
}
async function updateCameraList(){try{const d=await navigator.mediaDevices.enumerateDevices();cameraList=d.filter(d=>d.kind==='videoinput');const ct=localStream?.getVideoTracks()[0];if(ct){const i=cameraList.findIndex(c=>c.label===ct.label);if(i>=0)currentCamIndex=i;}}catch(e){}}
async function switchCamera(devId){
  if(!localStream||screenOn)return;try{const ns=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:devId}}});const nt=ns.getVideoTracks()[0],ot=localStream.getVideoTracks()[0];
  peers.forEach(p=>{const s=p.pc.getSenders().find(s=>s.track&&s.track.kind==='video');if(s)s.replaceTrack(nt);});
  if(ot){localStream.removeTrack(ot);ot.stop();}localStream.addTrack(nt);localVideo.srcObject=localStream;}catch(e){}
}
async function nextCamera(){if(cameraList.length<2)return;currentCamIndex=(currentCamIndex+1)%cameraList.length;await switchCamera(cameraList[currentCamIndex].deviceId);}

// ===== VIDEO GRID =====
function addRemoteVideo(id){
  rmRemoteVideo(id);const box=document.createElement('div');box.className='video-container remote-video-box';box.id='vbox-'+id;
  const vid=document.createElement('video');vid.autoplay=true;vid.playsInline=true;vid.id='vid-'+id;vid.volume=mutedUsers.has(id)?0:volumeSlider.value/100;
  const ov=document.createElement('div');ov.className='video-overlay';ov.id='ov-'+id;ov.innerHTML='<div class="no-video-avatar"><i class="fas fa-user"></i></div>';
  const nm=document.createElement('div');nm.className='video-name';nm.innerHTML='<span>'+ escHtml(userNames.get(id)||'User')+'</span>';
  const sp=document.createElement('div');sp.className='speaking-indicator hidden';sp.id='sp-'+id;sp.innerHTML='<i class="fas fa-volume-high"></i>';
  box.appendChild(vid);box.appendChild(ov);box.appendChild(nm);box.appendChild(sp);
  const lc=document.getElementById('local-container');videosContainer.insertBefore(box,lc);layoutVideos();return vid;
}
function rmRemoteVideo(id){const b=document.getElementById('vbox-'+id);if(b)b.remove();layoutVideos();}
function layoutVideos(){
  const boxes=videosContainer.querySelectorAll('.remote-video-box'),lc=document.getElementById('local-container'),n=boxes.length;
  if(n===0)lc.className='video-container local-small';
  else if(n===1){boxes[0].className='video-container remote-video-box remote-single';lc.className='video-container local-small';}
  else{boxes.forEach(b=>b.className='video-container remote-video-box remote-grid');lc.className='video-container remote-grid';}
  updateSidebar();
}
function updateSidebar(){
  channelUsersList.querySelectorAll('.remote-user-entry').forEach(e=>e.remove());
  peers.forEach((p,id)=>{
    const name=userNames.get(id)||'User';
    const div=document.createElement('div');div.className='channel-user remote-user-entry';div.id='su-'+id;
    const isMuted=mutedUsers.has(id);
    div.innerHTML='<div class="status-dot online"></div><div class="user-avatar remote-avatar"><i class="fas fa-user"></i></div><span>'+escHtml(name)+'</span><button class="mute-user-btn'+(isMuted?' muted-user':'')+'" data-id="'+id+'" title="'+(isMuted?'Unmute':'Mute')+'"><i class="fas fa-volume-'+(isMuted?'xmark':'high')+'"></i></button>';
    channelUsersList.appendChild(div);
  });
  // Add mute click handlers
  channelUsersList.querySelectorAll('.mute-user-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const uid=btn.dataset.id;
      if(mutedUsers.has(uid)){mutedUsers.delete(uid);btn.classList.remove('muted-user');btn.innerHTML='<i class="fas fa-volume-high"></i>';btn.title='Mute';}
      else{mutedUsers.add(uid);btn.classList.add('muted-user');btn.innerHTML='<i class="fas fa-volume-xmark"></i>';btn.title='Unmute';}
      const v=document.getElementById('vid-'+uid);if(v)v.volume=mutedUsers.has(uid)?0:volumeSlider.value/100;
    });
  });
  const count=peers.size;
  connectionQuality.textContent=count>0?'Connected':'Waiting...';
  connectionQuality.style.color=count>0?'#00ff88':'';
}

// ===== PEER =====
function makePeer(rid,init){
  const pc=new RTCPeerConnection(ICE);peers.set(rid,{pc,stream:null});
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.ontrack=ev=>{const pd=peers.get(rid);if(pd&&!pd.stream){pd.stream=ev.streams[0];const v=addRemoteVideo(rid);v.srcObject=ev.streams[0];document.getElementById('ov-'+rid)?.classList.add('hidden');monitorRemoteAudio(ev.streams[0],rid);setStatus('✅ Connected! ('+peers.size+')');}};
  pc.onicecandidate=ev=>{if(ev.candidate&&ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'candidate',candidate:ev.candidate,target:rid}));};
  pc.oniceconnectionstatechange=()=>{const st=pc.iceConnectionState;if(st==='failed'&&init){pc.createOffer({iceRestart:true}).then(o=>pc.setLocalDescription(o)).then(()=>{if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'offer',sdp:pc.localDescription,target:rid}));}).catch(()=>{});}};
  if(init){pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>ws.send(JSON.stringify({type:'offer',sdp:pc.localDescription,target:rid})));}
  return pc;
}
function dropPeer(id){const p=peers.get(id);if(p){try{p.pc.close();}catch(e){}}peers.delete(id);userNames.delete(id);mutedUsers.delete(id);rmRemoteVideo(id);updateSidebar();setStatus(peers.size>0?'✅ Connected! ('+peers.size+')':'⏳ Waiting...');}

// ===== WEBSOCKET =====
function connectWS(room){
  currentRoom=room;const proto=location.protocol==='https:'?'wss':'ws';ws=new WebSocket(proto+'://'+location.host);
  ws.onopen=()=>{ws.send(JSON.stringify({type:'join',room,nickname:myNickname}));if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}};
  ws.onmessage=async e=>{let msg;try{msg=JSON.parse(e.data);}catch{return;}
    switch(msg.type){
      case 'joined':myId=msg.odStr;setStatus(msg.users.length?'🔗 Connecting...':'⏳ Waiting...');msg.users.forEach(u=>{userNames.set(u.odStr,u.nickname);makePeer(u.odStr,true);});break;
      case 'user-joined':userNames.set(msg.odStr,msg.nickname);setStatus('🔗 '+msg.nickname+' joining...');soundJoin();showToast('<span class="toast-accent">'+escHtml(msg.nickname)+'</span> joined');addSystemMsg(msg.nickname+' joined');break;
      case 'offer':{const pc=makePeer(msg.from,false);await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));const a=await pc.createAnswer();await pc.setLocalDescription(a);ws.send(JSON.stringify({type:'answer',sdp:a,target:msg.from}));break;}
      case 'answer':{const pd=peers.get(msg.from);if(pd)await pd.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));break;}
      case 'candidate':{const pd=peers.get(msg.from);if(pd)try{await pd.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));}catch(e){}break;}
      case 'user-left':soundLeave();showToast('<span class="toast-danger">'+escHtml(msg.nickname||'User')+'</span> left');addSystemMsg((msg.nickname||'User')+' left');dropPeer(msg.odStr);break;
      case 'chat':handleChat(msg);break;
      case 'reaction':handleReaction(msg);break;
      case 'typing':handleTyping(msg);break;
      case 'full':statusText.textContent='❌ Room full';ws.close();break;
    }
  };
  ws.onclose=()=>{if(callScreen&&!callScreen.classList.contains('hidden')&&currentRoom){setStatus('⚠️ Reconnecting...');reconnectTimer=setTimeout(()=>{if(currentRoom)connectWS(currentRoom);},3000);}};
  ws.onerror=()=>{};
}

// ===== JOIN =====
async function joinRoom(room){
  if(!room.trim()){statusText.textContent='Enter Room ID';return;}
  myNickname=(nicknameInput.value.trim()||'User '+genId()).slice(0,20);
  statusText.textContent='Requesting camera...';if(!(await getMedia()))return;
  localVideoName.textContent=myNickname;sidebarSelfName.textContent=myNickname;panelSelfName.textContent=myNickname;
  joinScreen.classList.add('hidden');callScreen.classList.remove('hidden');
  sidebarRoom.textContent=room;topRoomName.textContent=room;connectWS(room.trim());
}

// ===== UI =====
function updateMicUI(){toggleMicBtns.forEach(b=>{if(!b)return;b.classList.toggle('muted',!micOn);b.querySelector('i').className=micOn?'fas fa-microphone':'fas fa-microphone-slash';});indicatorMic.className=micOn?'fas fa-microphone':'fas fa-microphone-slash';indicatorMic.style.color=micOn?'':'#ff3b3b';}
function updateCamUI(){toggleCamBtns.forEach(b=>{if(!b)return;b.classList.toggle('muted',!camOn);b.querySelector('i').className=camOn?'fas fa-video':'fas fa-video-slash';});indicatorCam.className=camOn?'fas fa-video':'fas fa-video-slash';indicatorCam.style.color=camOn?'':'#ff3b3b';localOverlay.classList.toggle('hidden',camOn);}

// ===== CHAT =====
function handleChat(msg) {
  soundMsg();
  const div = document.createElement('div');

  // Check if message is only emojis (1-3 emoji, no other text)
  const emojiRegex = /^[\p{Emoji}\u200d\ufe0f]{1,10}$/u;
  const isEmojiOnly = !msg.gif && msg.text && emojiRegex.test(msg.text.trim());

  div.className = 'chat-msg ' + (msg.self ? 'self' : 'other') + (isEmojiOnly ? ' emoji-only' : '');
  const time = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let content = '';
  if (!msg.self) content += '<div class="msg-sender">' + escHtml(msg.nickname) + '</div>';

  if (msg.gif) {
    content += '<img class="chat-gif" src="' + escHtml(msg.gif) + '" alt="GIF" loading="lazy" />';
  } else if (msg.text) {
    content += '<div>' + escHtml(msg.text) + '</div>';
  }

  content += '<div class="msg-time">' + time + '</div>';
  div.innerHTML = content;

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (!chatOpen && !msg.self) { unreadCount++; showBadge(); }
  typingIndicator.classList.add('hidden');
}
function addSystemMsg(text){const d=document.createElement('div');d.className='chat-system';d.textContent=text;chatMessages.appendChild(d);chatMessages.scrollTop=chatMessages.scrollHeight;}
function sendChat(){const t=chatInput.value.trim();if(!t||!ws||ws.readyState!==WebSocket.OPEN)return;ws.send(JSON.stringify({type:'chat',text:t}));chatInput.value='';}
function showBadge(){removeBadge();const b=document.createElement('span');b.className='chat-badge';b.textContent=unreadCount>9?'9+':unreadCount;chatToggleBtn.appendChild(b);}
function removeBadge(){const b=chatToggleBtn.querySelector('.chat-badge');if(b)b.remove();}

chatToggleBtn.addEventListener('click',()=>{chatOpen=!chatOpen;chatPanel.classList.toggle('hidden',!chatOpen);chatToggleBtn.classList.toggle('active',chatOpen);if(chatOpen){unreadCount=0;removeBadge();chatInput.focus();chatMessages.scrollTop=chatMessages.scrollHeight;}});
chatClose.addEventListener('click',()=>{chatOpen=false;chatPanel.classList.add('hidden');chatToggleBtn.classList.remove('active');});
chatSend.addEventListener('click',sendChat);
chatInput.addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});

// Typing indicator
chatInput.addEventListener('input',()=>{
  const now=Date.now();
  if(now-lastTypingSent>2000&&ws&&ws.readyState===WebSocket.OPEN){
    ws.send(JSON.stringify({type:'typing'}));lastTypingSent=now;
  }
});
function handleTyping(msg){
  typingText.textContent=escHtml(msg.nickname)+' is typing...';
  typingIndicator.classList.remove('hidden');
  if(typingTimeout)clearTimeout(typingTimeout);
  typingTimeout=setTimeout(()=>typingIndicator.classList.add('hidden'),3000);
}

// ===== REACTIONS =====
document.querySelectorAll('.react-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(!ws||ws.readyState!==WebSocket.OPEN)return;
    ws.send(JSON.stringify({type:'reaction',emoji:btn.dataset.emoji}));
  });
});
function handleReaction(msg){
  soundReaction();
  const el=document.createElement('div');el.className='reaction-bubble';
  el.style.left=Math.random()*70+15+'%';
  el.innerHTML=msg.emoji+'<div class="reaction-name">'+escHtml(msg.nickname)+'</div>';
  reactionsFloat.appendChild(el);setTimeout(()=>el.remove(),2600);
}

// ===== INVITE =====
inviteBtn.addEventListener('click',()=>{
  const url=location.origin+'?room='+encodeURIComponent(currentRoom||'');
  navigator.clipboard.writeText(url).then(()=>{
    copiedTooltip.classList.remove('hidden');
    setTimeout(()=>copiedTooltip.classList.add('hidden'),2000);
  }).catch(()=>{});
});

// Auto-join from URL
window.addEventListener('load',()=>{
  const params=new URLSearchParams(location.search);
  const r=params.get('room');
  if(r)roomInput.value=r;
});

// ===== EVENTS =====
joinBtn.addEventListener('click',()=>joinRoom(roomInput.value));
roomInput.addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom(roomInput.value);});
nicknameInput.addEventListener('keydown',e=>{if(e.key==='Enter')roomInput.focus();});
randomBtn.addEventListener('click',()=>{roomInput.value=genId();joinRoom(roomInput.value);});

toggleMicBtns.forEach(b=>{if(b)b.addEventListener('click',()=>{if(!localStream)return;micOn=!micOn;localStream.getAudioTracks().forEach(t=>t.enabled=micOn);updateMicUI();});});
toggleCamBtns.forEach(b=>{if(b)b.addEventListener('click',()=>{if(!localStream)return;camOn=!camOn;localStream.getVideoTracks().forEach(t=>t.enabled=camOn);updateCamUI();});});

switchCamBtn.addEventListener('click',async()=>{await updateCameraList();await nextCamera();});
applyCamBtn.addEventListener('click',async()=>{if(camSelect.value){await switchCamera(camSelect.value);await updateCameraList();}});

toggleScreenBtn.addEventListener('click',async()=>{
  if(peers.size===0)return;
  if(!screenOn){try{screenStream=await navigator.mediaDevices.getDisplayMedia({video:true});const st=screenStream.getVideoTracks()[0];peers.forEach(p=>{const s=p.pc.getSenders().find(s=>s.track&&s.track.kind==='video');if(s)s.replaceTrack(st);});localVideo.srcObject=screenStream;screenOn=true;st.onended=()=>stopScreen();toggleScreenBtn.classList.add('active');}catch(e){}}
  else stopScreen();
});
function stopScreen(){if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null;}const vt=localStream.getVideoTracks()[0];if(vt)peers.forEach(p=>{const s=p.pc.getSenders().find(s=>s.track&&s.track.kind==='video');if(s)s.replaceTrack(vt);});localVideo.srcObject=localStream;screenOn=false;toggleScreenBtn.classList.remove('active');}

volumeSlider.addEventListener('input',()=>{const v=volumeSlider.value/100;document.querySelectorAll('.remote-video-box video').forEach(el=>{const id=el.id.replace('vid-','');el.volume=mutedUsers.has(id)?0:v;});});

toggleFullscreen.addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else videosContainer.requestFullscreen().catch(()=>{});});

settingsBtn.addEventListener('click',()=>{settingsModal.classList.remove('hidden');refreshDevices();});
settingsClose.addEventListener('click',()=>settingsModal.classList.add('hidden'));
document.querySelector('.modal-backdrop')?.addEventListener('click',()=>settingsModal.classList.add('hidden'));

micSelect.addEventListener('change',async()=>{if(!localStream)return;try{const ns=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:micSelect.value},noiseSuppression:noiseToggle.checked,echoCancellation:echoToggle.checked,autoGainControl:true}});const nt=ns.getAudioTracks()[0],ot=localStream.getAudioTracks()[0];peers.forEach(p=>{const s=p.pc.getSenders().find(s=>s.track&&s.track.kind==='audio');if(s)s.replaceTrack(nt);});localStream.removeTrack(ot);ot.stop();localStream.addTrack(nt);startAudioMonitor();}catch(e){}});
speakerSelect.addEventListener('change',()=>{const id=speakerSelect.value;document.querySelectorAll('.remote-video-box video').forEach(v=>{if(v.setSinkId)v.setSinkId(id).catch(()=>{});});});

hangUp.addEventListener('click',()=>{
  currentRoom=null;if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
  peers.forEach((p,id)=>{try{p.pc.close();}catch(e){}rmRemoteVideo(id);});peers.clear();userNames.clear();mutedUsers.clear();
  if(ws){try{ws.close();}catch(e){}ws=null;}
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
  if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null;}
  if(animFrameId)cancelAnimationFrame(animFrameId);if(monitorCtx){try{monitorCtx.close();}catch(e){}monitorCtx=null;}analyser=null;
  localVideo.srcObject=null;callScreen.classList.add('hidden');joinScreen.classList.remove('hidden');
  statusText.textContent='';micOn=true;camOn=true;screenOn=false;myId=null;chatOpen=false;unreadCount=0;
  cameraList=[];currentCamIndex=0;updateMicUI();updateCamUI();
  chatMessages.innerHTML='';chatPanel.classList.add('hidden');chatToggleBtn.classList.remove('active');removeBadge();
  channelUsersList.querySelectorAll('.remote-user-entry').forEach(e=>e.remove());
});

// Drag local video
const lc=document.getElementById('local-container');let drag=false,dx,dy;
lc.addEventListener('mousedown',e=>{drag=true;dx=e.clientX-lc.offsetLeft;dy=e.clientY-lc.offsetTop;lc.style.cursor='grabbing';lc.style.transition='none';});
document.addEventListener('mousemove',e=>{if(!drag)return;lc.style.left=(e.clientX-dx)+'px';lc.style.top=(e.clientY-dy)+'px';lc.style.right='auto';lc.style.bottom='auto';});
document.addEventListener('mouseup',()=>{drag=false;lc.style.cursor='grab';});
// ===== EMOJI PICKER =====
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const emojiSearch = document.getElementById('emoji-search');
const emojiList = document.getElementById('emoji-list');
const gifBtn = document.getElementById('gif-btn');
const gifPicker = document.getElementById('gif-picker');
const gifSearch = document.getElementById('gif-search');
const gifResults = document.getElementById('gif-results');

const EMOJIS = {
  frequent: ['😂','❤️','🔥','👍','😭','🥺','✨','🎉','💀','🤣','😍','🙏','😊','😎','💯','🤔','😈','👀','🫡','💚'],
  smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😗','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  people: ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄'],
  animals: ['🐱','🐶','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒'],
  food: ['🍕','🍔','🍟','🌭','🥪','🌮','🌯','🫔','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🫗','🥤','🧋','🧃','🧉','🧊'],
  objects: ['💡','🔦','🕯️','💰','💵','💎','⚽','🏀','🏈','⚾','🥎','🎾','🏐','🎮','🕹️','🎲','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎯','🏆','🥇','🥈','🥉','🏅','⌚','📱','💻','⌨️','🖥️','📷','📹','🎥','📞','📺','📻','🔑','🗝️','🔒','🔓','📦','📫','📮','✉️','📝','📁','📂','📅'],
  symbols: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','❣️','✅','❌','⭕','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','❗','❓','‼️','⁉️','💤','💬','👁️‍🗨️','🗯️','💭','🕐','🕑','🕒','🕓','🕔','🕕','⚡','🌟','✨','💫','🎵','🎶','🔔','🔕','📢','📣','🏁','🚩','🏴','🏳️','🏳️‍🌈']
};

let currentEmojiCat = 'frequent';
let emojiPickerOpen = false;
let gifPickerOpen = false;

function renderEmojis(cat, filter) {
  emojiList.innerHTML = '';
  let list = EMOJIS[cat] || EMOJIS.frequent;
  if (filter) {
    // Search across all categories
    list = [];
    Object.values(EMOJIS).forEach(arr => {
      arr.forEach(e => { if (!list.includes(e)) list.push(e); });
    });
  }
  list.forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'emoji-item';
    btn.textContent = e;
    btn.addEventListener('click', () => {
      chatInput.value += e;
      chatInput.focus();
    });
    emojiList.appendChild(btn);
  });
}

// Toggle emoji picker
emojiBtn.addEventListener('click', () => {
  if (gifPickerOpen) { gifPicker.classList.add('hidden'); gifBtn.classList.remove('active'); gifPickerOpen = false; }
  emojiPickerOpen = !emojiPickerOpen;
  emojiPicker.classList.toggle('hidden', !emojiPickerOpen);
  emojiBtn.classList.toggle('active', emojiPickerOpen);
  if (emojiPickerOpen) { renderEmojis(currentEmojiCat); emojiSearch.value = ''; emojiSearch.focus(); }
});

// Category buttons
document.querySelectorAll('.emoji-cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.emoji-cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentEmojiCat = btn.dataset.cat;
    emojiSearch.value = '';
    renderEmojis(currentEmojiCat);
  });
});

// Search emoji
emojiSearch.addEventListener('input', () => {
  const q = emojiSearch.value.trim();
  if (q) renderEmojis(null, true);
  else renderEmojis(currentEmojiCat);
});

// ===== GIF PICKER (Tenor API) =====
// Free Tenor API key (get yours at https://developers.google.com/tenor)
const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';

let gifSearchTimeout = null;

gifBtn.addEventListener('click', () => {
  if (emojiPickerOpen) { emojiPicker.classList.add('hidden'); emojiBtn.classList.remove('active'); emojiPickerOpen = false; }
  gifPickerOpen = !gifPickerOpen;
  gifPicker.classList.toggle('hidden', !gifPickerOpen);
  gifBtn.classList.toggle('active', gifPickerOpen);
  if (gifPickerOpen) { gifSearch.value = ''; gifSearch.focus(); loadTrendingGifs(); }
});

async function loadTrendingGifs() {
  gifResults.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.75rem;">Loading...</div>';
  try {
    const r = await fetch('https://tenor.googleapis.com/v2/featured?key=' + TENOR_KEY + '&limit=20&media_filter=tinygif');
    const data = await r.json();
    renderGifs(data.results);
  } catch (e) {
    gifResults.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.75rem;">Failed to load GIFs</div>';
  }
}

async function searchGifs(query) {
  if (!query.trim()) { loadTrendingGifs(); return; }
  gifResults.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.75rem;">Searching...</div>';
  try {
    const r = await fetch('https://tenor.googleapis.com/v2/search?key=' + TENOR_KEY + '&q=' + encodeURIComponent(query) + '&limit=20&media_filter=tinygif');
    const data = await r.json();
    renderGifs(data.results);
  } catch (e) {
    gifResults.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.75rem;">Search failed</div>';
  }
}

function renderGifs(results) {
  gifResults.innerHTML = '';
  if (!results || !results.length) {
    gifResults.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.75rem;">No GIFs found</div>';
    return;
  }
  results.forEach(g => {
    const url = g.media_formats?.tinygif?.url || g.media_formats?.gif?.url;
    if (!url) return;
    const div = document.createElement('div');
    div.className = 'gif-item';
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'GIF';
    img.loading = 'lazy';
    div.appendChild(img);
    div.addEventListener('click', () => {
      // Send GIF as chat message
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'chat', text: '', gif: url }));
      }
      gifPickerOpen = false;
      gifPicker.classList.add('hidden');
      gifBtn.classList.remove('active');
    });
    gifResults.appendChild(div);
  });
}

gifSearch.addEventListener('input', () => {
  if (gifSearchTimeout) clearTimeout(gifSearchTimeout);
  gifSearchTimeout = setTimeout(() => searchGifs(gifSearch.value), 400);
});

// Close pickers on outside click
document.addEventListener('click', (e) => {
  if (emojiPickerOpen && !emojiPicker.contains(e.target) && e.target !== emojiBtn && !emojiBtn.contains(e.target)) {
    emojiPickerOpen = false;
    emojiPicker.classList.add('hidden');
    emojiBtn.classList.remove('active');
  }
  if (gifPickerOpen && !gifPicker.contains(e.target) && e.target !== gifBtn && !gifBtn.contains(e.target)) {
    gifPickerOpen = false;
    gifPicker.classList.add('hidden');
    gifBtn.classList.remove('active');
  }
});
