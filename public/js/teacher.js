const socket = io();

let roomId = null;
let teacherKey = null;

// ---------- Element refs ----------
const $roomId       = document.getElementById('roomId');
const $teacherKey   = document.getElementById('teacherKey');
const $createBtn    = document.getElementById('createBtn');
const $setupMsg     = document.getElementById('setupMsg');
const $videoLink    = document.getElementById('videoLink');
const $playBtn      = document.getElementById('playBtn');
const $queueBtn     = document.getElementById('queueBtn');
const $nextBtn      = document.getElementById('nextBtn');
const $stopBtn      = document.getElementById('stopBtn');
const $queueList    = document.getElementById('queueList');
const $videoWrapper = document.getElementById('videoWrapper');
const $statusBadge  = document.getElementById('statusBadge');
const $shareId      = document.getElementById('shareId');

// ---------- Create / Rejoin room ----------
$createBtn.addEventListener('click', async () => {
  const id  = $roomId.value.trim();
  const key = $teacherKey.value.trim();
  if (!id || !key) return showSetup('Please fill both fields', 'error');

  try {
    const res = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: id, teacherKey: key })
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409) return joinExisting(id, key);
      return showSetup(data.error, 'error');
    }

    roomId = id;
    teacherKey = key;
    showSetup(`Room "${id}" created!`, 'success');
    enterRoom();
  } catch (err) {
    showSetup('Server error: ' + err.message, 'error');
  }
});

async function joinExisting(id, key) {
  const res = await fetch(`/api/room/${id}`);
  const data = await res.json();
  if (!data.exists) return showSetup('Room not found', 'error');

  roomId = id;
  teacherKey = key;
  showSetup(`Rejoined room "${id}"`, 'success');
  enterRoom();
}

function showSetup(msg, type) {
  $setupMsg.textContent = msg;
  $setupMsg.className = type;
}

function enterRoom() {
  $shareId.textContent = roomId;
  $roomId.disabled = true;
  $teacherKey.disabled = true;
  $createBtn.disabled = true;
  $videoLink.disabled = false;
  $playBtn.disabled = false;
  $queueBtn.disabled = false;
  $nextBtn.disabled = false;
  $stopBtn.disabled = false;

  socket.emit('teacher-join', { roomId, teacherKey });
}

// ---------- YouTube link parsing ----------
function extractVideoId(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/watch\?.*v=([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/live\/([\w-]{11})/
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  return null;
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

function clearVideo() {
  $videoWrapper.innerHTML = `<div class="placeholder">No video playing</div>`;
}

function renderQueue(queue) {
  if (!queue || !queue.length) {
    $queueList.innerHTML = `<li style="color:#64748b">Queue is empty</li>`;
    return;
  }
  $queueList.innerHTML = queue
    .map((id, i) => `<li>${i + 1}. ${id}</li>`)
    .join('');
}

// ---------- Buttons ----------
$playBtn.addEventListener('click', () => {
  const raw = $videoLink.value.trim();
  if (!raw) return alert('Please paste a YouTube link first.');

  const vid = extractVideoId(raw);
  if (!vid) return alert('Could not find a YouTube video ID in:\n' + raw);

  socket.emit('play-video', { roomId, videoId: vid });
  renderVideo(vid);
  $videoLink.value = '';
});

$queueBtn.addEventListener('click', () => {
  const raw = $videoLink.value.trim();
  if (!raw) return alert('Please paste a YouTube link first.');

  const vid = extractVideoId(raw);
  if (!vid) return alert('Could not find a YouTube video ID in:\n' + raw);

  socket.emit('add-to-queue', { roomId, videoId: vid });
  $videoLink.value = '';
});

$nextBtn.addEventListener('click', () => {
  socket.emit('play-next', { roomId });
});

$stopBtn.addEventListener('click', () => {
  socket.emit('stop-video', { roomId });
  clearVideo();
});

// ---------- Socket events ----------
socket.on('sync-state', ({ videoId, queue }) => {
  if (videoId) renderVideo(videoId);
  renderQueue(queue || []);
});

socket.on('queue-updated', ({ queue }) => {
  renderQueue(queue);
});

socket.on('video-changed', ({ videoId }) => {
  renderVideo(videoId);
});

socket.on('teacher-online', () => {
  $statusBadge.textContent = 'ONLINE';
  $statusBadge.className = 'status-badge status-online';
});

socket.on('error-msg', (msg) => {
  alert(msg);
});

socket.on('connect', () => {
  if (roomId) {
    $statusBadge.textContent = 'ONLINE';
    $statusBadge.className = 'status-badge status-online';
  }
});