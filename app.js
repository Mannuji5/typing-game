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
