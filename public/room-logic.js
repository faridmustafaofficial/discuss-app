// ... Socket və Peer konfiqurasiyaları (əvvəlki kimi)

// İstifadəçi kartı yaradan funksiya
function addUserCard(userId, stream, userName) {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.id = `card-${userId}`;
    
    card.innerHTML = `
        <div class="avatar">${userName.charAt(0)}</div>
        <div class="username">${userName}</div>
        <canvas id="viz-${userId}" class="audio-visualizer"></canvas>
        <input type="range" class="volume-slider" min="0" max="1" step="0.1" value="1">
    `;

    // 1. Səsi oynatmaq
    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.addEventListener('loadedmetadata', () => audio.play());
    card.appendChild(audio);

    // 2. Səs Səviyyəsi (Volume Control)
    const slider = card.querySelector('.volume-slider');
    slider.addEventListener('input', (e) => {
        audio.volume = e.target.value;
    });

    // 3. Audio Visualizer (Səs Dalğası)
    setupVisualizer(stream, `viz-${userId}`, card);

    // 4. Kick Button (Əgər Adminsənsə)
    if(imAdmin) {
        const kickBtn = document.createElement('button');
        kickBtn.innerText = 'Kick';
        kickBtn.onclick = () => socket.emit('kick-user', userId);
        card.appendChild(kickBtn);
    }

    document.getElementById('video-grid').append(card);
}

// Visualizer Məntiqi (Web Audio API)
function setupVisualizer(stream, canvasId, cardElement) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    microphone.connect(analyser);
    
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext("2d");

    function draw() {
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        // Danışıb-danışmadığını yoxlamaq (Sadə metod)
        let sum = dataArray.reduce((a, b) => a + b, 0);
        if(sum > 1000) cardElement.classList.add('speaking');
        else cardElement.classList.remove('speaking');

        // Dalğanı çəkmək
        ctx.fillStyle = '#2b2b3b'; // Təmizlə
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        let barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for(let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;
            ctx.fillStyle = '#6c5ce7'; // Discuss rəngi
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }
    draw();
}

// Cihaz Seçimi (Mikrofon Dəyişmək)
navigator.mediaDevices.enumerateDevices().then(devices => {
    const audioSelect = document.getElementById('audioSource');
    devices.forEach(device => {
        if(device.kind === 'audioinput') {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${audioSelect.length + 1}`;
            audioSelect.appendChild(option);
        }
    });
});

// Kick Hadisəsi
socket.on('kicked', (targetId) => {
    if(myPeerId === targetId) {
        alert("Siz otaqdan uzaqlaşdırıldınız!");
        window.location.href = '/'; // Ana səhifəyə at
    }
});
