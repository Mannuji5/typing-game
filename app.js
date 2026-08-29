// --- Web Audio API Setup for Haptic Feedback ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playClickSound(isError = false) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = isError ? 'sawtooth' : 'sine';
    osc.frequency.value = isError ? 150 : 400;
    
    gainNode.gain.value = 0.1;
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Smooth attack and decay to prevent audio pops
    gainNode.gain.exponentialRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.05);
}

// --- Game Logic & DOM Management ---
const targetText = "The quick brown fox jumps over the lazy dog. Real-time web communication is fascinating.";
const textDisplay = document.getElementById('text-display');
const hiddenInput = document.getElementById('hidden-input');
const localWpmDisplay = document.getElementById('local-wpm');
const remoteWpmDisplay = document.getElementById('remote-wpm');

let startTime = null;
let errors = 0;

// Initialize DOM spans
function initGame() {
    textDisplay.innerHTML = '';
    targetText.split('').forEach((char, index) => {
        const span = document.createElement('span');
        span.innerText = char;
        if (index === 0) span.classList.add('active');
        textDisplay.appendChild(span);
    });
}

// Ensure clicking the text area focuses our hidden input
textDisplay.addEventListener('click', () => hiddenInput.focus());

hiddenInput.addEventListener('input', (e) => {
    if (!startTime) startTime = Date.now();
    
    const typedText = e.target.value;
    const spans = textDisplay.querySelectorAll('span');
    let currentErrors = 0;

    // Use requestAnimationFrame for performant DOM updates
    requestAnimationFrame(() => {
        spans.forEach((span, index) => {
            span.className = ''; 
            if (index < typedText.length) {
                if (span.innerText === typedText[index]) {
                    span.classList.add('correct');
                } else {
                    span.classList.add('incorrect');
                    currentErrors++;
                }
            } else if (index === typedText.length) {
                span.classList.add('active');
            }
        });
    });

    // Play sound based on the last keystroke
    const isLastCharWrong = typedText.length > 0 && typedText[typedText.length - 1] !== targetText[typedText.length - 1];
    playClickSound(isLastCharWrong);
    
    errors = currentErrors;
    calculateAndSendWPM(typedText.length);
});

function calculateAndSendWPM(totalKeystrokes) {
    if (!startTime) return;
    const minutesElapsed = (Date.now() - startTime) / 60000;
    // Standard Net WPM formula
    const grossWPM = (totalKeystrokes / 5) / minutesElapsed;
    const netWPM = Math.max(0, Math.round(grossWPM - (errors / minutesElapsed)));
    
    localWpmDisplay.innerText = netWPM;

    // Send payload over WebRTC
    if (connection && connection.open) {
        connection.send({ type: 'PROGRESS', wpm: netWPM });
    }
}

// --- PeerJS WebRTC Networking ---
const peer = new Peer({
    debug: 2,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }, 
            { 
                urls: 'turn:your-turn-server-url:80', 
                username: 'your-username', 
                credential: 'your-password' 
            }
        ]
    }
});
let connection;

peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
    document.getElementById('status-display').innerText = 'Status: Waiting for opponent...';
});

// Handle incoming connection
peer.on('connection', (conn) => {
    connection = conn;
    setupConnection(connection);
});

// Handle outgoing connection
document.getElementById('connect-btn').addEventListener('click', () => {
    const opponentId = document.getElementById('opponent-id-input').value;
    connection = peer.connect(opponentId, { reliable: true });
    setupConnection(connection);
});

function setupConnection(conn) {
    conn.on('open', () => {
        document.getElementById('status-display').innerText = 'Status: Connected! Start typing.';
        hiddenInput.focus();
        hiddenInput.value = ''; // Reset input
        startTime = null;
        initGame();
    });

    conn.on('data', (data) => {
        if (data.type === 'PROGRESS') {
            // Render opponent's WPM
            requestAnimationFrame(() => {
                remoteWpmDisplay.innerText = data.wpm;
            });
        }
    });

    conn.on('close', () => {
        document.getElementById('status-display').innerText = 'Status: Opponent Disconnected';
        // Basic reconnect implementation
        peer.reconnect(); 
    });
}

// Boot
initGame();
