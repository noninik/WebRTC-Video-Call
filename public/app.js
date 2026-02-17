/* ======= NEXUS — Full App ======= */

// DOM
const $ = id => document.getElementById(id);
const joinScreen=$('join-screen'),callScreen=$('call-screen'),roomInput=$('room-input'),nicknameInput=$('nickname-input'),joinBtn=$('join-btn'),randomBtn=$('random-btn'),statusText=$('status-text'),callStatus=$('call-status'),localVideo=$('local-video'),hangUp=$('hang-up'),volumeSlider=$('volume-slider'),settingsBtn=$('settings-btn'),settingsModal=$('settings-modal'),settingsClose=$('settings-close'),micSelect=$('mic-select'),speakerSelect=$('speaker-select'),camSelect=$('cam-select'),applyCamBtn=$('apply-cam-btn'),noiseToggle=$('noise-toggle'),echoToggle=$('echo-toggle'),micLevel=$('mic-level'),localOverlay=$('local-overlay'),localSpeaking=$('local-speaking'),indicatorMic=$('indicator-mic'),indicatorCam=$('indicator-cam'),sidebarRoom=$('sidebar-room'),topRoomName=$('top-room-name'),connectionQuality=$('connection-quality'),channelUsersList=$('channel-users-list'),videosContainer=$('videos'),reactionsFloat=$('reactions-float'),toastContainer=$('toast-container'),inviteBtn=$('invite-btn'),copiedTooltip=$('copied-tooltip'),chatPanel=$('chat-panel'),chatMessages=$('chat-messages'),chatInput=$('chat-input'),chatSend=$('chat-send'),chatClose=$('chat-close'),chatToggleBtn=$('chat-toggle-btn'),typingIndicator=$('typing-indicator'),typingText=$('typing-text'),localVideoName=$('local-video-name'),sidebarSelfName=$('sidebar-self-name'),panelSelfName=$('panel-self-name'),emojiBtn=$('emoji-btn'),emojiPicker=$('emoji-picker'),emojiSearch=$('emoji-search'),emojiListEl=$('emoji-list'),gifBtn=$('gif-btn'),gifPicker=$('gif-picker'),gifSearch=$('gif-search'),gifResults=$('gif-results'),volModal=$('vol-modal'),volModalName=$('vol-modal-name'),volModalSlider=$('vol-modal-slider'),volModalVal=$('vol-modal-val'),volModalMute=$('vol-modal-mute'),volModalClose=$('vol-modal-close');

const toggleMicBtns=[$('toggle-mic'),$('toggle-mic-2')];
const toggleCamBtns=[$('toggle-cam'),$('toggle-cam-2')];
const switchCamBtn=$('switch-cam-btn'),toggleScreenBtn=$('toggle-screen-btn'),toggleFullscreen=$('toggle-fullscreen');

// STATE
let ws=null,localStream=null,screenStream=null,myId=null,myNickname='User';
let micOn=true,camOn=true,screenOn=false;
let monitorCtx=null,analyser=null,animFrameId=null;
let cameraList=[],currentCamIndex=0;
let reconnectTimer=null,currentRoom=null;
let chatOpen=false,unreadCount=0;
let typingTimeout=null,lastTypingSent=0;
let emojiOpen=false,gifOpen=false;
let volModalTarget=null;
const userVolumes=new Map();
const mutedUsers=new Set();
const userNames=new Map();
const peers=new Map();
const ICE={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},{urls:'stun:stun2.l.google.com:19302'}]};

// SOUNDS
const ACtx=window.AudioContext||window.webkitAudioContext;
function tone(f,d,t,v){try{const c=new ACtx(),o=c.createOscillator(),g=c.createGain();o.type=t||'sine';o.frequency.value=f;g.gain.value=v||0.12;o.connect(g);g.connect(c.destination);o.start();g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+d);o.stop(c.currentTime+d);setTimeout(()=>c.close(),d*1000+100)}catch(e){}}
function sndJoin(){tone(880,0.12);setTimeout(()=>tone(1100,0.12),80)}
function sndLeave(){tone(600,0.12);setTimeout(()=>tone(440,0.15),80)}
function sndMsg(){tone(1200,0.06,'sine',0.06)}
function sndReact(){tone(1400,0.05,'sine',0.05);setTimeout(()=>tone(1600,0.05,'sine',0.05),50)}

// UTILS
function genId(){return Math.random().toString(36).substr(2,8)}
function setStatus(t){callStatus.textContent=t}
function escH(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML}
function showToast(h){const t=document.createElement('div');t.className='toast';t.innerHTML=h;toastContainer.appendChild(t);setTimeout(()=>t.remove(),3200)}

// MEDIA
async function getMedia(){
  try{localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:{noiseSuppression:noiseToggle.checked,echoCancellation:echoToggle.checked,autoGainControl:true}})}
  catch(e){try{localStream=await navigator.mediaDevices.getUserMedia({video:false,audio:true});camOn=false;updateCamUI();localOverlay.classList.remove('hidden')}catch(e2){statusText.textContent='❌ No camera/mic';return false}}
  localVideo.srcObject=localStream;startAudioMon();await refreshDevs();await updateCamList();return true
}

// AUDIO MONITOR
function startAudioMon(){
  try{if(monitorCtx)monitorCtx.close();monitorCtx=new ACtx();const s=monitorCtx.createMediaStreamSource(localStream);analyser=monitorCtx.createAnalyser();analyser.fftSize=256;s.connect(analyser);aLoop()}catch(e){}
}
function aLoop(){
  if(!analyser)return;const d=new Uint8Array(analyser.frequencyBinCount);
  (function t(){analyser.getByteFrequencyData(d);let s=0;for(let i=0;i<d.length;i++)s+=d[i];const a=s/d.length,p=Math.min(100,(a/128)*100);micLevel.style.width=p+'%';localSpeaking.classList.toggle('hidden',!(p>10&&micOn));animFrameId=requestAnimationFrame(t)})()
}
function monRemote(stream,id){
  try{const c=new ACtx(),s=c.createMediaStreamSource(stream),a=c.createAnalyser();a.fftSize=256;s.connect(a);const d=new Uint8Array(a.frequencyBinCount);
  (function ck(){a.getByteFrequencyData(d);let s=0;for(let i=0;i<d.length;i++)s+=d[i];const el=$('sp-'+id);if(el)el.classList.toggle('hidden',(s/d.length)<=8);requestAnimationFrame(ck)})()}catch(e){}
}

// DEVICES
async function refreshDevs(){
  try{const devs=await navigator.mediaDevices.enumerateDevices();micSelect.innerHTML='';speakerSelect.innerHTML='';camSelect.innerHTML='';
  devs.forEach(d=>{const o=document.createElement('option');o.value=d.deviceId;o.text=d.label||d.kind+' '+d.deviceId.slice(0,6);
  if(d.kind==='audioinput')micSelect.appendChild(o);else if(d.kind==='audiooutput')speakerSelect.appendChild(o);else if(d.kind==='videoinput')camSelect.appendChild(o)});
  if(!speakerSelect.options.length){const o=document.createElement('option');o.text='Default';speakerSelect.appendChild(o)}
  const ct=localStream?.getVideoTracks()[0];if(ct)for(let i=0;i<camSelect.options.length;i++)if(camSelect.options[i].text===ct.label){camSelect.selectedIndex=i;break}}catch(e){}
}
async function updateCamList(){try{const d=await navigator.mediaDevices.enumerateDevices();cameraList=d.filter(x=>x.kind==='videoinput');const ct=localStream?.getVideoTracks()[0];if(ct){const i=cameraList.findIndex(c=>c.label===ct.label);if(i>=0)currentCamIndex=i}}catch(e){}}
async function switchCam(devId){
  if(!localStream||screenOn)return;try{const ns=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:devId}}});const nt=ns.getVideoTracks()[0],ot=localStream.getVideoTracks()[0];
  peers.forEach(p=>{const s=p.pc.getSenders().find(s=>s.track?.kind==='video');if(s)s.replaceTrack(nt)});
  if(ot){localStream.removeTrack(ot);ot.stop()}localStream.addTrack(nt);localVideo.srcObject=localStream}catch(e){}
}
async function nextCam(){if(cameraList.length<2)return;currentCamIndex=(currentCamIndex+1)%cameraList.length;await switchCam(cameraList[currentCamIndex].deviceId)}

// VIDEO GRID
function addRVid(id){
  rmRVid(id);const name=userNames.get(id)||'User';
  const box=document.createElement('div');box.className='video-container remote-video-box';box.id='vbox-'+id;
  const vid=document.createElement('video');vid.autoplay=true;vid.playsInline=true;vid.id='vid-'+id;
  const vol=userVolumes.get(id)??100;vid.volume=mutedUsers.has(id)?0:vol/100;
  const ov=document.createElement('div');ov.className='video-overlay';ov.id='ov-'+id;ov.innerHTML='<div class="no-video-avatar"><i class="fas fa-user"></i></div>';
  const nm=document.createElement('div');nm.className='video-name';nm.innerHTML='<span>'+escH(name)+'</span>';
  const sp=document.createElement('div');sp.className='speaking-indicator hidden';sp.id='sp-'+id;sp.innerHTML='<i class="fas fa-volume-high"></i>';
  // Individual volume
  const vc=document.createElement('div');vc.className='video-vol';
  vc.innerHTML='<i class="fas fa-volume-high"></i><input type="range" min="0" max="200" value="'+vol+'" data-uid="'+id+'"/>';
  vc.querySelector('input').addEventListener('input',function(){
    const v=parseInt(this.value);userVolumes.set(id,v);
    const ve=$('vid-'+id);if(ve)ve.volume=mutedUsers.has(id)?0:v/100;
  });
  box.appendChild(vid);box.appendChild(ov);box.appendChild(nm);box.appendChild(sp);box.appendChild(vc);
  // Right click for volume modal
  box.addEventListener('contextmenu',e=>{e.preventDefault();openVolModal(id,e.clientX,e.clientY)});
  const lc=$('local-container');videosContainer.insertBefore(box,lc);layoutVids();return vid
}
function rmRVid(id){const b=$('vbox-'+id);if(b)b.remove();layoutVids()}
function layoutVids(){
  const boxes=videosContainer.querySelectorAll('.remote-video-box'),lc=$('local-container'),n=boxes.length;
  if(n===0)lc.className='video-container local-small';
  else if(n===1){boxes[0].className='video-container remote-video-box remote-single';lc.className='video-container local-small'}
  else{boxes.forEach(b=>b.className='video-container remote-video-box remote-grid');lc.className='video-container remote-grid'}
  updateSB()
}
function updateSB(){
  channelUsersList.querySelectorAll('.rue').forEach(e=>e.remove());
  peers.forEach((p,id)=>{
    const name=userNames.get(id)||'User',m=mutedUsers.has(id);
    const div=document.createElement('div');div.className='channel-user rue';div.id='su-'+id;
    div.innerHTML='<div class="status-dot online"></div><div class="user-avatar remote-avatar"><i class="fas fa-user"></i></div><span>'+escH(name)+'</span>';
    div.addEventListener('click',()=>openVolModal(id));
    channelUsersList.appendChild(div)
  });
  connectionQuality.textContent=peers.size>0?'Connected':'Waiting...';
  connectionQuality.style.color=peers.size>0?'var(--accent)':''
}

// INDIVIDUAL VOLUME MODAL
function openVolModal(id,x,y){
  const name=userNames.get(id)||'User';
  volModalTarget=id;
  volModalName.textContent=name;
  const vol=userVolumes.get(id)??100;
  volModalSlider.value=vol;
  volModalVal.textContent=vol+'%';
  volModalMute.innerHTML=mutedUsers.has(id)?'<i class="fas fa-volume-high"></i> Unmute':'<i class="fas fa-volume-xmark"></i> Mute';
  volModal.classList.remove('hidden');
  // Position
  const vw=window.innerWidth,vh=window.innerHeight;
  volModal.style.left=Math.min(x||vw/2,vw-220)+'px';
  volModal.style.top=Math.min(y||vh/2,vh-180)+'px';
}
volModalSlider.addEventListener('input',()=>{
  const v=parseInt(volModalSlider.value);volModalVal.textContent=v+'%';
  if(volModalTarget){userVolumes.set(volModalTarget,v);const ve=$('vid-'+volModalTarget);if(ve)ve.volume=mutedUsers.has(volModalTarget)?0:v/100;
  const hvr=document.querySelector('[data-uid="'+volModalTarget+'"]');if(hvr)hvr.value=v}
});
volModalMute.addEventListener('click',()=>{
  if(!volModalTarget)return;
  if(mutedUsers.has(volModalTarget)){mutedUsers.delete(volModalTarget);const v=userVolumes.get(volModalTarget)??100;const ve=$('vid-'+volModalTarget);if(ve)ve.volume=v/100;volModalMute.innerHTML='<i class="fas fa-volume-xmark"></i> Mute'}
  else{mutedUsers.add(volModalTarget);const ve=$('vid-'+volModalTarget);if(ve)ve.volume=0;volModalMute.innerHTML='<i class="fas fa-volume-high"></i> Unmute'}
  updateSB()
});
volModalClose.addEventListener('click',()=>{volModal.classList.add('hidden');volModalTarget=null});
document.addEventListener('click',e=>{if(!volModal.classList.contains('hidden')&&!volModal.contains(e.target)&&!e.target.closest('.channel-user')&&!e.target.closest('.remote-video-box')){volModal.classList.add('hidden');volModalTarget=null}});

// PEER
function makePeer(rid,init){
  const pc=new RTCPeerConnection(ICE);peers.set(rid,{pc,stream:null});
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.ontrack=ev=>{const pd=peers.get(rid);if(pd&&!pd.stream){pd.stream=ev.streams[0];const v=addRVid(rid);v.srcObject=ev.streams[0];const o=$('ov-'+rid);if(o)o.classList.add('hidden');monRemote(ev.streams[0],rid);setStatus('✅ Connected ('+peers.size+')')}};
  pc.onicecandidate=ev=>{if(ev.candidate&&ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'candidate',candidate:ev.candidate,target:rid}))};
  pc.oniceconnectionstatechange=()=>{if(pc.iceConnectionState==='failed'&&init){pc.createOffer({iceRestart:true}).then(o=>pc.setLocalDescription(o)).then(()=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'offer',sdp:pc.localDescription,target:rid}))}).catch(()=>{})}};
  if(init){pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>ws.send(JSON.stringify({type:'offer',sdp:pc.localDescription,target:rid})))}
  return pc
}
function dropPeer(id){const p=peers.get(id);if(p)try{p.pc.close()}catch(e){}peers.delete(id);userNames.delete(id);userVolumes.delete(id);mutedUsers.delete(id);rmRVid(id);updateSB();setStatus(peers.size>0?'✅ Connected ('+peers.size+')':'⏳ Waiting...')}

// WEBSOCKET
function connectWS(room){
  currentRoom=room;const proto=location.protocol==='https:'?'wss':'ws';ws=new WebSocket(proto+'://'+location.host);
  ws.onopen=()=>{ws.send(JSON.stringify({type:'join',room,nickname:myNickname}));if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null}};
  ws.onmessage=async e=>{let msg;try{msg=JSON.parse(e.data)}catch{return}
    switch(msg.type){
      case 'joined':myId=msg.odStr;setStatus(msg.users.length?'🔗 Connecting...':'⏳ Waiting...');msg.users.forEach(u=>{userNames.set(u.odStr,u.nickname);makePeer(u.odStr,true)});break;
      case 'user-joined':userNames.set(msg.odStr,msg.nickname);sndJoin();showToast('<span class="ta">'+escH(msg.nickname)+'</span> joined');addSysMsg(msg.nickname+' joined');break;
      case 'offer':{const pc=makePeer(msg.from,false);await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));const a=await pc.createAnswer();await pc.setLocalDescription(a);ws.send(JSON.stringify({type:'answer',sdp:a,target:msg.from}));break}
      case 'answer':{const pd=peers.get(msg.from);if(pd)await pd.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));break}
      case 'candidate':{const pd=peers.get(msg.from);if(pd)try{await pd.pc.addIceCandidate(new RTCIceCandidate(msg.candidate))}catch(e){}break}
      case 'user-left':sndLeave();showToast('<span class="td">'+escH(msg.nickname||'User')+'</span> left');addSysMsg((msg.nickname||'User')+' left');dropPeer(msg.odStr);break;
      case 'chat':handleChat(msg);break;
      case 'reaction':handleReact(msg);break;
      case 'typing':handleTyp(msg);break;
      case 'full':statusText.textContent='❌ Room full';ws.close();break
    }
  };
  ws.onclose=()=>{if(callScreen&&!callScreen.classList.contains('hidden')&&currentRoom){setStatus('⚠️ Reconnecting...');reconnectTimer=setTimeout(()=>{if(currentRoom)connectWS(currentRoom)},3000)}};
  ws.onerror=()=>{}
}

// JOIN
async function joinRoom(room){
  if(!room.trim()){statusText.textContent='Enter Room ID';return}
  myNickname=(nicknameInput.value.trim()||'User-'+genId()).slice(0,20);
  statusText.textContent='Requesting camera...';if(!(await getMedia()))return;
  localVideoName.textContent=myNickname;sidebarSelfName.textContent=myNickname;panelSelfName.textContent=myNickname;
  joinScreen.classList.add('hidden');callScreen.classList.remove('hidden');
  sidebarRoom.textContent=room;topRoomName.textContent=room;connectWS(room.trim())
}

// UI
function updateMicUI(){toggleMicBtns.forEach(b=>{if(!b)return;b.classList.toggle('muted',!micOn);b.querySelector('i').className=micOn?'fas fa-microphone':'fas fa-microphone-slash'});indicatorMic.className=micOn?'fas fa-microphone':'fas fa-microphone-slash';indicatorMic.style.color=micOn?'':'var(--danger)'}
function updateCamUI(){toggleCamBtns.forEach(b=>{if(!b)return;b.classList.toggle('muted',!camOn);b.querySelector('i').className=camOn?'fas fa-video':'fas fa-video-slash'});indicatorCam.className=camOn?'fas fa-video':'fas fa-video-slash';indicatorCam.style.color=camOn?'':'var(--danger)';localOverlay.classList.toggle('hidden',camOn)}

// CHAT
function handleChat(msg){
  sndMsg();const div=document.createElement('div');
  const emoRx=/^[\p{Emoji}\u200d\ufe0f]{1,10}$/u;
  const isEmo=!msg.gif&&msg.text&&emoRx.test(msg.text.trim());
  div.className='chat-msg '+(msg.self?'self':'other')+(isEmo?' emoji-only':'');
  const time=new Date(msg.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  let c='';if(!msg.self)c+='<div class="msg-sender">'+escH(msg.nickname)+'</div>';
  if(msg.gif)c+='<img class="chat-gif" src="'+escH(msg.gif)+'" alt="GIF" loading="lazy"/>';
  else if(msg.text)c+='<div>'+escH(msg.text)+'</div>';
  c+='<div class="msg-time">'+time+'</div>';div.innerHTML=c;
  chatMessages.appendChild(div);chatMessages.scrollTop=chatMessages.scrollHeight;
  if(!chatOpen&&!msg.self){unreadCount++;showBadge()}typingIndicator.classList.add('hidden')
}
function addSysMsg(t){const d=document.createElement('div');d.className='chat-system';d.textContent=t;chatMessages.appendChild(d);chatMessages.scrollTop=chatMessages.scrollHeight}
function sendChat(){const t=chatInput.value.trim();if(!t||!ws||ws.readyState!==WebSocket.OPEN)return;ws.send(JSON.stringify({type:'chat',text:t}));chatInput.value=''}
function showBadge(){rmBadge();const b=document.createElement('span');b.className='chat-badge';b.textContent=unreadCount>9?'9+':unreadCount;chatToggleBtn.appendChild(b)}
function rmBadge(){const b=chatToggleBtn.querySelector('.chat-badge');if(b)b.remove()}

// TYPING
chatInput.addEventListener('input',()=>{const n=Date.now();if(n-lastTypingSent>2000&&ws?.readyState===WebSocket.OPEN){ws.send(JSON.stringify({type:'typing'}));lastTypingSent=n}});
function handleTyp(msg){typingText.textContent=escH(msg.nickname)+' is typing...';typingIndicator.classList.remove('hidden');if(typingTimeout)clearTimeout(typingTimeout);typingTimeout=setTimeout(()=>typingIndicator.classList.add('hidden'),3000)}

// REACTIONS
document.querySelectorAll('.react-btn').forEach(btn=>{btn.addEventListener('click',()=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'reaction',emoji:btn.dataset.emoji}))})});
function handleReact(msg){sndReact();const el=document.createElement('div');el.className='reaction-bubble';el.style.left=Math.random()*70+15+'%';el.innerHTML=msg.emoji+'<div class="reaction-name">'+escH(msg.nickname)+'</div>';reactionsFloat.appendChild(el);setTimeout(()=>el.remove(),3200)}

// EMOJI
const EMOJIS={
  frequent:['😂','❤️','🔥','👍','😭','🥺','✨','🎉','💀','🤣','😍','🙏','😊','😎','💯','🤔','😈','👀','🫡','💚'],
  smileys:['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😗','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👻','👽','🤖'],
  people:['👋','🤚','✋','🖖','👌','🤌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤝','🙏','💪','🦾','👀','👁️','👅','👄'],
  animals:['🐱','🐶','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦅','🦉','🐺','🐴','🦄','🐝','🦋','🐌','🐞','🐢','🐍','🐙','🦑','🐬','🐳','🦈','🐘','🦒'],
  food:['🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥙','🍳','🥘','🍿','🍱','🍣','🍤','🍦','🍩','🍪','🎂','🍰','🍫','🍬','🍭','☕','🍵','🍺','🍻','🥂','🍷','🥤','🧋'],
  objects:['💡','🔦','💰','💎','⚽','🏀','🎮','🕹️','🎲','🎨','🎬','🎤','🎧','🎸','🎹','🏆','📱','💻','⌨️','📷','🔑','📦','✉️','📝'],
  symbols:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘','✅','❌','⭕','❗','❓','💤','💬','💭','⚡','🌟','✨','💫','🎵','🎶','🔔']
};
let curECat='frequent';
function renderEmojis(cat){
  emojiListEl.innerHTML='';(EMOJIS[cat]||EMOJIS.frequent).forEach(e=>{
    const b=document.createElement('button');b.className='emoji-item';b.textContent=e;
    b.addEventListener('click',()=>{chatInput.value+=e;chatInput.focus()});
    emojiListEl.appendChild(b)
  })
}
emojiBtn.addEventListener('click',()=>{if(gifOpen){gifPicker.classList.add('hidden');gifBtn.classList.remove('active');gifOpen=false}emojiOpen=!emojiOpen;emojiPicker.classList.toggle('hidden',!emojiOpen);emojiBtn.classList.toggle('active',emojiOpen);if(emojiOpen){renderEmojis(curECat);emojiSearch.value='';emojiSearch.focus()}});
document.querySelectorAll('.ecat').forEach(b=>{b.addEventListener('click',()=>{document.querySelectorAll('.ecat').forEach(x=>x.classList.remove('active'));b.classList.add('active');curECat=b.dataset.c;emojiSearch.value='';renderEmojis(curECat)})});
emojiSearch.addEventListener('input',()=>{const q=emojiSearch.value.toLowerCase();if(!q){renderEmojis(curECat);return}emojiListEl.innerHTML='';Object.values(EMOJIS).flat().forEach(e=>{if(!emojiListEl.querySelector('[data-e="'+e+'"]')){const b=document.createElement('button');b.className='emoji-item';b.textContent=e;b.dataset.e=e;b.addEventListener('click',()=>{chatInput.value+=e;chatInput.focus()});emojiListEl.appendChild(b)}})});

// GIF (Tenor)
const TENOR_KEY='AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
let gifTO=null;
gifBtn.addEventListener('click',()=>{if(emojiOpen){emojiPicker.classList.add('hidden');emojiBtn.classList.remove('active');emojiOpen=false}gifOpen=!gifOpen;gifPicker.classList.toggle('hidden',!gifOpen);gifBtn.classList.toggle('active',gifOpen);if(gifOpen){gifSearch.value='';gifSearch.focus();loadGifs()}});
async function loadGifs(q){
  gifResults.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.7rem">Loading...</div>';
  try{const url=q?'https://tenor.googleapis.com/v2/search?key='+TENOR_KEY+'&q='+encodeURIComponent(q)+'&limit=20&media_filter=tinygif':'https://tenor.googleapis.com/v2/featured?key='+TENOR_KEY+'&limit=20&media_filter=tinygif';
  const r=await fetch(url);const data=await r.json();renderGifs(data.results)}catch(e){gifResults.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.7rem">Failed</div>'}
}
function renderGifs(results){
  gifResults.innerHTML='';if(!results?.length){gifResults.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-3);font-size:0.7rem">No GIFs</div>';return}
  results.forEach(g=>{const url=g.media_formats?.tinygif?.url;if(!url)return;const d=document.createElement('div');d.className='gif-item';const img=document.createElement('img');img.src=url;img.alt='GIF';img.loading='lazy';d.appendChild(img);
  d.addEventListener('click',()=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'chat',text:'',gif:url}));gifOpen=false;gifPicker.classList.add('hidden');gifBtn.classList.remove('active')});gifResults.appendChild(d)})
}
gifSearch.addEventListener('input',()=>{if(gifTO)clearTimeout(gifTO);gifTO=setTimeout(()=>loadGifs(gifSearch.value),400)});

// EVENTS
joinBtn.addEventListener('click',()=>joinRoom(roomInput.value));
roomInput.addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom(roomInput.value)});
nicknameInput.addEventListener('keydown',e=>{if(e.key==='Enter')roomInput.focus()});
randomBtn.addEventListener('click',()=>{roomInput.value=genId();joinRoom(roomInput.value)});

toggleMicBtns.forEach(b=>{if(b)b.addEventListener('click',()=>{if(!localStream)return;micOn=!micOn;localStream.getAudioTracks().forEach(t=>t.enabled=micOn);updateMicUI()})});
toggleCamBtns.forEach(b=>{if(b)b.addEventListener('click',()=>{if(!localStream)return;camOn=!camOn;localStream.getVideoTracks().forEach(t=>t.enabled=camOn);updateCamUI()})});
switchCamBtn.addEventListener('click',async()=>{await updateCamList();await nextCam()});
applyCamBtn.addEventListener('click',async()=>{if(camSelect.value){await switchCam(camSelect.value);await updateCamList()}});

toggleScreenBtn.addEventListener('click',async()=>{
  if(peers.size===0)return;
  if(!screenOn){try{screenStream=await navigator.mediaDevices.getDisplayMedia({video:true});const st=screenStream.getVideoTracks()[0];peers.forEach(p=>{const s=p.pc.getSenders().find(s=>s.track?.kind==='video');if(s)s.replaceTrack(st)});localVideo.srcObject=screenStream;screenOn=true;st.onended=()=>stopScr();toggleScreenBtn.classList.add('active')}catch(e){}}
  else stopScr()
});
function stopScr(){if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null}const vt=localStream.getVideoTracks()[0];if(vt)peers.forEach(p=>{const s=p.pc.getSenders().find(s=>s.track?.kind==='video');if(s)s.replaceTrack(vt)});localVideo.srcObject=localStream;screenOn=false;toggleScreenBtn.classList.remove('active')}

volumeSlider.addEventListener('input',()=>{const v=volumeSlider.value/100;document.querySelectorAll('.remote-video-box video').forEach(el=>{const id=el.id.replace('vid-','');if(!mutedUsers.has(id)){const uv=userVolumes.get(id)??100;el.volume=Math.min(v*uv/100,2)}})});
toggleFullscreen.addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else videosContainer.requestFullscreen().catch(()=>{})});

chatToggleBtn.addEventListener('click',()=>{chatOpen=!chatOpen;chatPanel.classList.toggle('hidden',!chatOpen);chatToggleBtn.classList.toggle('active',chatOpen);if(chatOpen){unreadCount=0;rmBadge();chatInput.focus();chatMessages.scrollTop=chatMessages.scrollHeight}});
chatClose.addEventListener('click',()=>{chatOpen=false;chatPanel.classList.add('hidden');chatToggleBtn.classList.remove('active')});
chatSend.addEventListener('click',sendChat);
chatInput.addEventListener('keydown',e=>{if(e.key==='Enter')sendChat()});

inviteBtn.addEventListener('click',()=>{const url=location.origin+'?room='+encodeURIComponent(currentRoom||'');navigator.clipboard.writeText(url).then(()=>{copiedTooltip.classList.remove('hidden');setTimeout(()=>copiedTooltip.classList.add('hidden'),2000)}).catch(()=>{})});

settingsBtn.addEventListener('click',()=>{settingsModal.classList.remove('hidden');refreshDevs()});
settingsClose.addEventListener('click',()=>settingsModal.classList.add('hidden'));
document.querySelector('.modal-backdrop')?.addEventListener('click',()=>settingsModal.classList.add('hidden'));

micSelect.addEventListener('change',async()=>{if(!localStream)return;try{const ns=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:micSelect.value},noiseSuppression:noiseToggle.checked,echoCancellation:echoToggle.checked,autoGainControl:true}});const nt=ns.getAudioTracks()[0],ot=localStream.getAudioTracks()[0];peers.forEach(p=>{const s=p.pc.getSenders().find(s=>s.track?.kind==='audio');if(s)s.replaceTrack(nt)});localStream.removeTrack(ot);ot.stop();localStream.addTrack(nt);startAudioMon()}catch(e){}});
speakerSelect.addEventListener('change',()=>{const id=speakerSelect.value;document.querySelectorAll('.remote-video-box video').forEach(v=>{if(v.setSinkId)v.setSinkId(id).catch(()=>{})})});

// AUTO JOIN FROM URL
window.addEventListener('load',()=>{const p=new URLSearchParams(location.search);const r=p.get('room');if(r)roomInput.value=r});

// HANG UP
hangUp.addEventListener('click',()=>{
  currentRoom=null;if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null}
  peers.forEach((p,id)=>{try{p.pc.close()}catch(e){}rmRVid(id)});peers.clear();userNames.clear();userVolumes.clear();mutedUsers.clear();
  if(ws){try{ws.close()}catch(e){}ws=null}
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null}
  if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null}
  if(animFrameId)cancelAnimationFrame(animFrameId);if(monitorCtx){try{monitorCtx.close()}catch(e){}monitorCtx=null}analyser=null;
  localVideo.srcObject=null;callScreen.classList.add('hidden');joinScreen.classList.remove('hidden');
  statusText.textContent='';micOn=true;camOn=true;screenOn=false;myId=null;chatOpen=false;unreadCount=0;emojiOpen=false;gifOpen=false;
  cameraList=[];currentCamIndex=0;updateMicUI();updateCamUI();
  chatMessages.innerHTML='';chatPanel.classList.add('hidden');chatToggleBtn.classList.remove('active');rmBadge();
  emojiPicker.classList.add('hidden');gifPicker.classList.add('hidden');emojiBtn.classList.remove('active');gifBtn.classList.remove('active');
  channelUsersList.querySelectorAll('.rue').forEach(e=>e.remove())
});

// DRAG LOCAL VIDEO
const lc=$('local-container');let drag=false,dx,dy;
lc.addEventListener('mousedown',e=>{drag=true;dx=e.clientX-lc.offsetLeft;dy=e.clientY-lc.offsetTop;lc.style.cursor='grabbing';lc.style.transition='none'});
document.addEventListener('mousemove',e=>{if(!drag)return;lc.style.left=(e.clientX-dx)+'px';lc.style.top=(e.clientY-dy)+'px';lc.style.right='auto';lc.style.bottom='auto'});
document.addEventListener('mouseup',()=>{drag=false;lc.style.cursor='grab'});
