const socket = io();

let roomId = null;
let myName = null;

// ---------- Element refs ----------
const $joinModal     = document.getElementById('joinModal');
const $joinRoomId    = document.getElementById('joinRoomId');
const $joinName      = document.getElementById('joinName');
const $joinBtn       = document.getElementById('joinBtn');
const $joinMsg       = document.getElementById('joinMsg');
const $mainView      = document.getElementById('mainView');
const $roomLabel     = document.getElementById('roomLabel');
const $teacherStatus = document.getElementById('teacherStatus');
const $videoWrapper  = document.getElementById('videoWrapper');
const $chatMessages  = document.getElementById('chatMessages');
const $chatInput     = document.getElementById('chatInput');
const $chatSend      = document.getElementById('chatSend');

// Prefill room ID from URL ?room=xxx
const urlParams = new URLSearchParams(location.search);
if (urlParams.get('room')) $joinRoomId.value = urlParams.get('room');

// ---------- Join ----------
$joinBtn.addEventListener('click', () => {
  const id   = $joinRoomId.value.trim();
  const name = $joinName.value.trim() || 'Student';
  if (!id) return showJoinMsg('Enter a room ID');

  roomId = id;
  myName = name;

  socket.emit('student-join', { roomId });

  $joinModal.style.display = 'none';
  $mainView.style.display = 'block';
  $roomLabel.textContent = roomId;
});

function showJoinMsg(msg) {
  $joinMsg.textContent = msg;
  $joinMsg.className = 'error';
}

// ---------- Rendering (FIXED for Playback Error) ----------
function renderVideo(videoId) {
  $videoWrapper.innerHTML = `
    <iframe
      src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen></iframe>
  `;
}

function showWaiting() {
  $videoWrapper.innerHTML = `
    <div class="placeholder">
      <div class="spinner"></div>
      <p>Waiting for teacher to start a video...</p>
    </div>
  `;
}

// ---------- Socket events ----------
socket.on('sync-state', ({ videoId }) => {
  if (videoId) renderVideo(videoId);
  else showWaiting();
});

socket.on('video-changed', ({ videoId }) => {
  renderVideo(videoId);
});

socket.on('video-stopped', () => {
  showWaiting();
});

socket.on('teacher-online', () => {
  $teacherStatus.textContent = 'Teacher online';
  $teacherStatus.className = 'status-badge status-online';
});

socket.on('teacher-offline', () => {
  $teacherStatus.textContent = 'Teacher offline';
  $teacherStatus.className = 'status-badge status-offline';
});

socket.on('error-msg', (msg) => {
  alert(msg);
  $joinModal.style.display = 'flex';
  $mainView.style.display = 'none';
});

// ---------- Chat ----------
$chatSend.addEventListener('click', sendChat);
$chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChat();
});

function sendChat() {
  const text = $chatInput.value.trim();
  if (!text) return;
  socket.emit('chat-message', { roomId, name: myName, text });
  $chatInput.value = '';
}

socket.on('chat-message', ({ name, text }) => {
  const div = document.createElement('div');
  div.className = 'chat-message';
  div.innerHTML = `<span class="name">${escapeHtml(name)}:</span>${escapeHtml(text)}`;
  $chatMessages.appendChild(div);
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}