const arButton = document.getElementById('ar-button');
const statusText = document.getElementById('status');
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

function setupDPad() {
    const bindBtn = (id, dx, dy) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const start = (e) => { e.preventDefault(); moveX = dx; moveY = dy; };
        const end = (e) => { e.preventDefault(); moveX = 0; moveY = 0; };
        btn.addEventListener('touchstart', start, {passive: false});
        btn.addEventListener('touchend', end);
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', end);
        btn.addEventListener('mouseleave', end);
    };
    bindBtn('btn-up', 0, 1);
    bindBtn('btn-down', 0, -1);
    bindBtn('btn-left', -1, 0);
    bindBtn('btn-right', 1, 0);
}

arButton.disabled = true;

Module.onRuntimeInitialized = () => {
    logUI("1. WASM loaded. Preparing memory...");
    setupDPad();
    
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
                logUI("AR is Ready! Press the button below.");
                arButton.disabled = false;
                arButton.addEventListener('click', onARButtonClicked);
            } else {
                logUI("Error: AR not supported on this device.");
            }
        });
    } else {
        logUI("Error: WebXR not available.");
    }
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
        document.getElementById('dpad').style.display = 'flex';
    }
}

function onSessionEnded() {
    xrSession = null;
    xrHitTestSource = null;
    isPlaced = false;
    document.getElementById('dpad').style.display = 'none';
    arButton.innerText = "Start AR Session";
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
                if (isPlaced && (moveX !== 0 || moveY !== 0)) {
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
