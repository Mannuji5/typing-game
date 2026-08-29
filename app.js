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
const localAccDisplay = document.getElementById('local-accuracy');
const remoteAccDisplay = document.getElementById('remote-accuracy');

const winScreen = document.getElementById('win-screen');
const winTitle = document.getElementById('win-title');
const winMessage = document.getElementById('win-message');
const rematchBtn = document.getElementById('rematch-btn');

let startTime = null;
let errors = 0;
let isFinished = false;

function initGame() {
    textDisplay.innerHTML = '';
    targetText.split('').forEach((char, index) => {
        const span = document.createElement('span');
        span.innerText = char;
        if (index === 0) span.classList.add('active');
        textDisplay.appendChild(span);
    });
    
    hiddenInput.value = '';
    hiddenInput.disabled = false;
    startTime = null;
    errors = 0;
    isFinished = false;
    
    localWpmDisplay.innerText = '0';
    localAccDisplay.innerText = '100';
    winScreen.classList.add('hidden');
}

textDisplay.addEventListener('click', () => {
    if (!isFinished) hiddenInput.focus();
});

hiddenInput.addEventListener('input', (e) => {
    if (isFinished) return;
    if (!startTime) startTime = Date.now();
    
    const typedText = e.target.value;
    const spans = textDisplay.querySelectorAll('span');
    let currentErrors = 0;

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

    const isLastCharWrong = typedText.length > 0 && typedText[typedText.length - 1] !== targetText[typedText.length - 1];
    playClickSound(isLastCharWrong);
    
    errors = currentErrors;
    calculateAndSendProgress(typedText.length);

    // Check for Win Condition
    if (typedText === targetText) {
        isFinished = true;
        hiddenInput.disabled = true;
        const finalWPM = localWpmDisplay.innerText;
        const finalAcc = localAccDisplay.innerText;
        
        triggerWin('You', finalWPM, finalAcc);
        
        // Notify opponent that the game is over
        if (connection && connection.open) {
            connection.send({ type: 'GAME_OVER', wpm: finalWPM, accuracy: finalAcc });
        }
    }
});

function calculateAndSendProgress(totalKeystrokes) {
    if (!startTime || totalKeystrokes === 0) return;
    
    const minutesElapsed = (Date.now() - startTime) / 60000;
    const grossWPM = (totalKeystrokes / 5) / minutesElapsed;
    
    const netWPM = Math.max(0, Math.round(grossWPM - (errors / minutesElapsed)));
    const accuracy = Math.max(0, Math.round(((totalKeystrokes - errors) / totalKeystrokes) * 100));
    
    localWpmDisplay.innerText = netWPM;
    localAccDisplay.innerText = accuracy;

    if (connection && connection.open) {
        connection.send({ type: 'PROGRESS', wpm: netWPM, accuracy: accuracy });
    }
}

function triggerWin(winner, wpm, accuracy) {
    winScreen.classList.remove('hidden');
    if (winner === 'You') {
        winTitle.innerText = "You Won!";
        winTitle.style.color = "var(--correct-color)";
    } else {
        winTitle.innerText = "Opponent Won!";
        winTitle.style.color = "var(--incorrect-color)";
        isFinished = true;
        hiddenInput.disabled = true;
    }
    winMessage.innerText = `Speed: ${wpm} WPM | Accuracy: ${accuracy}%`;
}

rematchBtn.addEventListener('click', () => {
    initGame();
    hiddenInput.focus();
    if (connection && connection.open) {
        connection.send({ type: 'REMATCH' });
    }
});

// --- PeerJS WebRTC Networking ---
// --- PeerJS WebRTC Networking ---

// 1. Generate a random 3-character short code
function generateShortId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 3; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

const shortCode = generateShortId();

// 2. Create a hidden prefix to ensure the ID is globally unique on the server
const gameNamespace = "minitype-game-"; 
const fullServerId = gameNamespace + shortCode;

// 3. Pass the full, long ID to the PeerJS server
const peer = new Peer(fullServerId, { debug: 2 });
let connection;

peer.on('open', (id) => {
    // 4. Strip the prefix away so the player ONLY sees the 3-character code
    const displayId = id.replace(gameNamespace, '');
    document.getElementById('my-id').innerText = displayId;
    document.getElementById('status-display').innerText = 'Status: Waiting for opponent...';
});

peer.on('connection', (conn) => {
    connection = conn;
    setupConnection(connection);
});

document.getElementById('connect-btn').addEventListener('click', () => {
    // 5. When the user types the opponent's 3-character code, add the prefix back invisibly
    const opponentShortCode = document.getElementById('opponent-id-input').value.toUpperCase();
    const opponentFullId = gameNamespace + opponentShortCode;
    
    // Connect using the full server ID
    connection = peer.connect(opponentFullId, { reliable: true });
    setupConnection(connection);
});

function setupConnection(conn) {
    conn.on('open', () => {
        document.getElementById('status-display').innerText = 'Status: Connected! Start typing.';
        initGame();
        hiddenInput.focus();
    });

    conn.on('data', (data) => {
        if (data.type === 'PROGRESS') {
            requestAnimationFrame(() => {
                remoteWpmDisplay.innerText = data.wpm;
                remoteAccDisplay.innerText = data.accuracy;
            });
        } else if (data.type === 'GAME_OVER') {
            triggerWin('Opponent', data.wpm, data.accuracy);
        } else if (data.type === 'REMATCH') {
            initGame();
        }
    });

    conn.on('close', () => {
        document.getElementById('status-display').innerText = 'Status: Opponent Disconnected';
    });
}

// Boot
initGame();
