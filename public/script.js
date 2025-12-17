const socket = io('/');
const videoGrid = document.getElementById('video-grid');
// Səs üçün (video elementini gizlədə bilərik, amma WebRTC video teqi tələb edir)
const myVideo = document.createElement('video');
myVideo.muted = true; // Öz səsimizi eşitməmək üçün

// PeerJS serverinə qoşulma (Render-də pulsuz peer serveri istifadə edirik)
const peer = new Peer(undefined, {
  host: 'peerjs-server.herokuapp.com', 
  secure: true, 
  port: 443,
});

let myVideoStream;

// Mikrofona icazə alırıq
navigator.mediaDevices.getUserMedia({
  video: false, // Sadəcə səs
  audio: true
}).then(stream => {
  myVideoStream = stream;
  addVideoStream(myVideo, stream);

  // Kimsə bizə zəng edəndə cavab veririk
  peer.on('call', call => {
    call.answer(stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
      addVideoStream(video, userVideoStream);
    });
  });

  // Yeni istifadəçi gələndə ona zəng edirik
  socket.on('user-connected', userId => {
    connectToNewUser(userId, stream);
  });
});

// Peer ID yarananda serverə bildiririk
peer.on('open', id => {
  const ROOM_ID = window.location.pathname.substring(1); // URL-dən ID-ni götürür
  document.getElementById('room-id-display').innerText = ROOM_ID;
  socket.emit('join-room', ROOM_ID, id);
});

function connectToNewUser(userId, stream) {
  const call = peer.call(userId, stream);
  const video = document.createElement('video');
  call.on('stream', userVideoStream => {
    addVideoStream(video, userVideoStream);
  });
  call.on('close', () => {
    video.remove();
  });
}

function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener('loadedmetadata', () => {
    video.play();
  });
  videoGrid.append(video);
}

function toggleMute() {
    const enabled = myVideoStream.getAudioTracks()[0].enabled;
    if (enabled) {
        myVideoStream.getAudioTracks()[0].enabled = false;
        // Düymə rəngini dəyişmək olar
    } else {
        myVideoStream.getAudioTracks()[0].enabled = true;
    }
}