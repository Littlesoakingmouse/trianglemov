const arButton = document.getElementById('ar-button');
const statusText = document.getElementById('status');
const replayBtn = document.getElementById('replay-btn');

replayBtn.addEventListener('click', () => {
    Module.ccall('reset_game', null, [], []);
    replayBtn.style.display = 'none';
    document.getElementById('joystick-zone').style.display = 'block';
    logUI("Đã chơi lại!");
});
let xrSession = null;
let xrRefSpace = null;
let xrViewerSpace = null;
let xrHitTestSource = null;
let glContext = null;
let isPlaced = false;

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

// --- D-Pad Logic ---
let moveX = 0;
let moveY = 0;
const speed = 0.05;

function setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    const joystickManager = nipplejs.create({
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

Module.onRuntimeInitialized = () => {
    logUI(" Đã tải WebAssembly. Chuẩn bị...");
    setupJoystick();

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
                logUI(" Nhấn nút bắt đầu");
                arButton.disabled = false;
                arButton.addEventListener('click', onARButtonClicked);
            } else {
                logUI("Thiết bị không hỗ trợ AR.");
            }
        });
    } else {
        logUI("Thiết bị không hỗ trợ WebXR.");
    }
}

function onARButtonClicked() {
    if (!xrSession) {
        logUI("Chuẩn bị WebGL cho AR...");
        glContext.makeXRCompatible().then(() => {
            logUI("Xác định phiên bản AR...");
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
    arButton.innerText = "KẾT THÚC";
    logUI("Đang tìm bề mặt...");

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
        logUI("Đã xác định được bề mặt, Bắt đầu chơi!");
        document.getElementById('joystick-zone').style.display = 'block';
    }
}

function onSessionEnded() {
    xrSession = null;
    xrHitTestSource = null;
    isPlaced = false;
    document.getElementById('joystick-zone').style.display = 'none';
    replayBtn.style.display = 'none';
    arButton.innerText = "BẮT ĐẦU GAME";
    logUI("Kết thúc.");
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
                    logUI("Tìm thấy bề mặt, Chạm để bắt đầu game.");
                }
            } else {
                logUI("Đang tìm kiếm bề mặt (hãy di chuyển điện thoại chậm)...");
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
                let gameState = 0;
                if (isPlaced) {
                    try {
                        gameState = Module.ccall('check_game_state', 'number', [], []);
                    } catch (e) { } // In case not recompiled yet
                }

                if (gameState !== 0) {
                    if (document.getElementById('joystick-zone').style.display !== 'none') {
                        document.getElementById('joystick-zone').style.display = 'none';
                        replayBtn.style.display = 'block';
                        logUI(gameState === 1 ? "BẠN ĐÃ THẮNG!" : "GAME OVER!");
                    }
                } else if (isPlaced && (moveX !== 0 || moveY !== 0)) {
                    // Try/catch this optional function in case user forgot to recompile C++
                    try {
                        Module.ccall('move_player', null, ['number', 'number'], [moveX * speed, moveY * speed]);
                    } catch (e) {
                        console.error("move_player missing (need C++ recompile)", e);
                    }
                }

                Module.ccall(
                    'render_frame',
                    null,
                    ['number', 'number', 'number', 'number'],
                    [viewPtr, projPtr, hitPtr, isPlaced ? 1 : 0]
                );
            } catch (err) {
                logUI("C++ Render Crash: " + err.message);
            }
        }
    }
}
