const arButton = document.getElementById('ar-button');
const statusText = document.getElementById('status');
const replayBtn = document.getElementById('replay-btn');

replayBtn.addEventListener('click', () => {
    if (isHost) {
        Module.ccall('reset_game', null, [], []);
        replayBtn.style.display = 'none';
        document.getElementById('joystick-zone').style.display = 'block';
        logUI("Game restarted!");
    } else {
        if (socket) socket.emit('request_replay');
        logUI("Requested Host to replay...");
    }
});
let xrSession = null;
let xrRefSpace = null;
let xrViewerSpace = null;
let xrHitTestSource = null;
let glContext = null;
let isPlaced = false;

// Multiplayer variables
let socket = null;
let isHost = true;
let localPlayerId = 0;

// Pointers for WASM memory
let viewPtr = null;
let projPtr = null;
let hitPtr = null;
const viewArray = new Float32Array(16);
const projArray = new Float32Array(16);
const hitArray = new Float32Array(16);

function logUI(msg) {
    statusText.innerText = msg;
    console.log("[WebAR] " + msg);
}

// --- Joystick Logic ---
let moveX = 0;
let moveY = 0;
const speed = 0.05;
let joystickManager = null;

function setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    if (!zone || joystickManager) return;

    joystickManager = nipplejs.create({
        zone: zone,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white',
        size: 100
    });

    joystickManager.on('move', (evt, data) => {
        // nipple.js vector.y is positive when moving UP
        moveX = data.vector.x;
        moveY = data.vector.y;
    });

    joystickManager.on('end', () => {
        moveX = 0;
        moveY = 0;
    });
}

arButton.disabled = true;

// Emscripten's Module object is globally available when game.js loads
Module.onRuntimeInitialized = () => {
    logUI("1. WASM loaded. Preparing memory...");

    viewPtr = Module._malloc(64);
    projPtr = Module._malloc(64);
    hitPtr = Module._malloc(64);

    const canvas = document.getElementById('canvas');
    glContext = canvas.getContext('webgl2');

    if (!glContext) {
        logUI("Error: WebGL2 context not found!");
        return;
    }

    logUI("2. WebGL ready. Checking AR support...");
    checkARSupport();
};

function checkARSupport() {
    if (navigator.xr) {
        navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
            if (supported) {
                logUI("AR is Ready! Select a mode above.");
                setupLobbyUI();
            } else {
                logUI("Error: AR not supported on this device.");
            }
        });
    } else {
        logUI("Error: WebXR not available.");
    }
}

// --- LOBBY & MULTIPLAYER LOGIC ---
function setupSocketListeners() {
    socket.on('client_input', (data) => {
        if (isHost) {
            Module.ccall('move_player', null, ['number', 'number', 'number'], [data.playerId, data.dx, data.dy]);
        }
    });

    socket.on('game_state', (data) => {
        if (!isHost) {
            const syncPtr = Module.ccall('get_sync_buffer', 'number', [], []);
            const syncArray = new Float32Array(Module.HEAPF32.buffer, syncPtr, data.length);
            syncArray.set(data);
            Module.ccall('unpack_state', null, [], []);
        }
    });

    socket.on('player_joined', (data) => {
        logUI("Player " + data.playerId + " joined!");
        if (isHost) {
            Module.ccall('add_player', null, ['number'], [data.playerId]);
        }
    });

    socket.on('player_left', (playerId) => {
        logUI("Player " + playerId + " left.");
        if (isHost) {
            Module.ccall('remove_player', null, ['number'], [playerId]);
        }
    });

    socket.on('do_replay', () => {
        if (isHost) {
            Module.ccall('reset_game', null, [], []);
        } else {
            replayBtn.style.display = 'none';
            document.getElementById('joystick-zone').style.display = 'block';
            logUI("Game restarted by Host!");
        }
    });
}

function setupLobbyUI() {
    const s1 = document.getElementById('lobby-screen');
    const s2 = document.getElementById('multiplayer-screen');
    const s3 = document.getElementById('ar-screen');

    document.getElementById('btn-singleplayer').addEventListener('click', () => {
        isHost = true;
        localPlayerId = 0;
        Module.ccall('set_multiplayer_info', null, ['number', 'number'], [1, 0]);
        s1.style.display = 'none';
        s3.style.display = 'block';
        arButton.disabled = false;
        arButton.addEventListener('click', onARButtonClicked);
    });

    document.getElementById('btn-multiplayer').addEventListener('click', () => {
        s1.style.display = 'none';
        s2.style.display = 'block';
    });

    document.getElementById('btn-back').addEventListener('click', () => {
        s2.style.display = 'none';
        s1.style.display = 'block';
    });

    document.getElementById('btn-create-room').addEventListener('click', () => {
        if (!socket) socket = io();
        setupSocketListeners();
        socket.emit('create_room', (res) => {
            isHost = true;
            localPlayerId = res.playerId;
            Module.ccall('set_multiplayer_info', null, ['number', 'number'], [1, res.playerId]);
            document.getElementById('display-room-code').innerText = res.code;
            document.getElementById('room-info').style.display = 'block';

            s2.style.display = 'none';
            s3.style.display = 'block';
            arButton.disabled = false;
            arButton.addEventListener('click', onARButtonClicked);
        });
    });

    document.getElementById('btn-join-room').addEventListener('click', () => {
        const code = document.getElementById('input-room-code').value;
        if (code.length !== 4) return alert("Enter 4 digit code");
        if (!socket) socket = io();
        setupSocketListeners();

        socket.emit('join_room', code, (res) => {
            if (res.success) {
                isHost = false;
                localPlayerId = res.playerId;
                Module.ccall('set_multiplayer_info', null, ['number', 'number'], [0, res.playerId]);
                document.getElementById('display-room-code').innerText = code;
                document.getElementById('room-info').style.display = 'block';

                s2.style.display = 'none';
                s3.style.display = 'block';
                arButton.disabled = false;
                arButton.addEventListener('click', onARButtonClicked);
            } else {
                alert("Room not found!");
            }
        });
    });
}


function onARButtonClicked() {
    if (!xrSession) {
        logUI("Preparing WebGL for AR...");
        glContext.makeXRCompatible().then(() => {
            logUI("Requesting AR Session...");
            return navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['hit-test'],
                optionalFeatures: ['dom-overlay'],
                domOverlay: { root: document.getElementById('ui-container') }
            });
        }).then(onSessionStarted).catch(err => {
            logUI("Session failed: " + err.message);
        });
    } else {
        xrSession.end();
    }
}

function onSessionStarted(session) {
    xrSession = session;
    arButton.innerText = "End AR Session";
    document.getElementById('room-info').style.display = 'none'; // Hide code during AR
    logUI("Session Active. Scanning for surfaces...");

    try {
        const glLayer = new XRWebGLLayer(session, glContext);
        session.updateRenderState({ baseLayer: glLayer });
    } catch (err) {
        logUI("Layer Error: " + err.message);
        return;
    }

    session.requestReferenceSpace('viewer').then((refSpace) => {
        xrViewerSpace = refSpace;
        session.requestHitTestSource({ space: xrViewerSpace }).then((source) => {
            xrHitTestSource = source;
        });
    });

    session.requestReferenceSpace('local').then((refSpace) => {
        xrRefSpace = refSpace;
        session.requestAnimationFrame(onXRFrame);
    });

    session.addEventListener('select', onSelect);
    session.addEventListener('end', onSessionEnded);
}

function onSelect() {
    if (!isPlaced && hitArray[15] !== 0) {
        isPlaced = true;
        logUI("Game Placed on Table! Enjoy!");
        document.getElementById('joystick-zone').style.display = 'block';
        setupJoystick();
    }
}

function onSessionEnded() {
    xrSession = null;
    xrHitTestSource = null;
    isPlaced = false;
    document.getElementById('joystick-zone').style.display = 'none';
    replayBtn.style.display = 'none';
    arButton.innerText = "Start AR Session";
    document.getElementById('room-info').style.display = 'block'; // Show code again
    logUI("AR Session Ended.");
}

function onXRFrame(time, frame) {
    const session = frame.session;
    session.requestAnimationFrame(onXRFrame);

    const pose = frame.getViewerPose(xrRefSpace);
    if (pose) {
        const glLayer = session.renderState.baseLayer;
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, glLayer.framebuffer);
        glContext.viewport(0, 0, glLayer.framebufferWidth, glLayer.framebufferHeight);

        let hitFound = false;
        if (xrHitTestSource && !isPlaced) {
            const hitTestResults = frame.getHitTestResults(xrHitTestSource);
            if (hitTestResults.length > 0) {
                const hitPose = hitTestResults[0].getPose(xrRefSpace);
                if (hitPose) {
                    hitArray.set(hitPose.transform.matrix);
                    hitFound = true;
                    logUI("Surface found! Tap to place the game.");
                }
            } else {
                logUI("Scanning for flat surfaces (Move your phone slowly)...");
            }
        }

        if (!hitFound && !isPlaced) {
            hitArray.fill(0);
        }

        Module.HEAPF32.set(hitArray, hitPtr / 4);

        for (const view of pose.views) {
            viewArray.set(view.transform.inverse.matrix);
            projArray.set(view.projectionMatrix);

            Module.HEAPF32.set(viewArray, viewPtr / 4);
            Module.HEAPF32.set(projArray, projPtr / 4);

            try {
                if (isPlaced) {
                    let gameState = 0;
                    try {
                        gameState = Module.ccall('check_game_state', 'number', [], []);
                    } catch (e) {}

                    if (gameState !== 0) {
                        if (document.getElementById('joystick-zone').style.display !== 'none') {
                            document.getElementById('joystick-zone').style.display = 'none';
                            replayBtn.style.display = 'block';
                            logUI(gameState === 1 ? "BẠN ĐÃ THẮNG!" : "GAME OVER!");
                        }
                    } else {
                        if (document.getElementById('joystick-zone').style.display === 'none') {
                            document.getElementById('joystick-zone').style.display = 'block';
                            replayBtn.style.display = 'none';
                            logUI("Game On!");
                        }
                        if (moveX !== 0 || moveY !== 0) {
                            if (isHost) {
                                Module.ccall('move_player', null, ['number', 'number', 'number'], [localPlayerId, moveX * speed, moveY * speed]);
                            } else if (socket) {
                                socket.emit('input_sync', { playerId: localPlayerId, dx: moveX * speed, dy: moveY * speed });
                            }
                        }
                    }

                    // 2. Render the frame
                    Module.ccall(
                        'render_frame',
                        null,
                        ['number', 'number', 'number', 'number'],
                        [viewPtr, projPtr, hitPtr, 1]
                    );

                    // 3. Sync state if host
                    if (isHost && socket) {
                        const len = Module.ccall('pack_state', 'number', [], []);
                        const syncPtr = Module.ccall('get_sync_buffer', 'number', [], []);
                        const syncArray = new Float32Array(Module.HEAPF32.buffer, syncPtr, len);
                        socket.emit('state_sync', Array.from(syncArray));
                    }
                } else {
                    // Still render the placement reticle
                    Module.ccall(
                        'render_frame',
                        null,
                        ['number', 'number', 'number', 'number'],
                        [viewPtr, projPtr, hitPtr, 0]
                    );
                }

            } catch (err) {
                logUI("C++ Render Crash: " + err.message);
                console.error(err);
            }
        }
    }
}
