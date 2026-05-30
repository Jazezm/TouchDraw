const video = document.getElementById('webcam');
const uiCanvas = document.getElementById('uiCanvas');
const uiCtx = uiCanvas.getContext('2d');
const paintCanvas = document.getElementById('paintCanvas');
const paintCtx = paintCanvas.getContext('2d');
const cursorCanvas = document.getElementById('cursorCanvas');
const cursorCtx = cursorCanvas.getContext('2d');
const statusText = document.getElementById('status');

// Control Buttons
const drawModeBtn = document.getElementById('drawModeBtn');
const eraseModeBtn = document.getElementById('eraseModeBtn');
const clearBtn = document.getElementById('clearBtn');

let isDrawing = false;
let currentMode = 'draw'; // Can be 'draw' or 'erase'
let lastX = 0, lastY = 0;
const lerpAmount = 0.35;

// Touch support variables
let touchActive = false;
let lastTouchX = 0;
let lastTouchY = 0;

function initCanvasDimensions() {
    const container = paintCanvas.parentElement;
    paintCanvas.width = container.clientWidth;
    paintCanvas.height = container.clientHeight;
    cursorCanvas.width = container.clientWidth;
    cursorCanvas.height = container.clientHeight;
    
    updateBrushSettings();
}

// Central tool management function
function updateBrushSettings() {
    paintCtx.lineCap = 'round';
    paintCtx.lineJoin = 'round';

    if (currentMode === 'draw') {
        paintCtx.globalCompositeOperation = 'source-over'; // Normal drawing
        paintCtx.strokeStyle = '#ff007f'; // Sublime Pink
        paintCtx.lineWidth = 6;
    } else if (currentMode === 'erase') {
        paintCtx.globalCompositeOperation = 'destination-out'; // Cuts holes / erases pixels
        paintCtx.lineWidth = 30; // Eraser path is wider to make it easier to clear things
    }
}

// --- UI Button Event Listeners ---
drawModeBtn.addEventListener('click', () => {
    currentMode = 'draw';
    drawModeBtn.className = 'active-mode';
    eraseModeBtn.className = 'secondary';
    updateBrushSettings();
});

eraseModeBtn.addEventListener('click', () => {
    currentMode = 'erase';
    eraseModeBtn.className = 'active-mode';
    drawModeBtn.className = 'secondary';
    updateBrushSettings();
});

clearBtn.addEventListener('click', () => {
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
});

// Touch event handlers for mobile drawing
paintCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
        const rect = paintCanvas.getBoundingClientRect();
        lastTouchX = e.touches[0].clientX - rect.left;
        lastTouchY = e.touches[0].clientY - rect.top;
        touchActive = true;
        isDrawing = true;
        paintCtx.beginPath();
        paintCtx.moveTo(lastTouchX, lastTouchY);
    }
});

paintCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (touchActive && e.touches.length > 0) {
        const rect = paintCanvas.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const y = e.touches[0].clientY - rect.top;
        
        paintCtx.lineTo(x, y);
        paintCtx.stroke();
        
        lastTouchX = x;
        lastTouchY = y;
    }
});

paintCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    touchActive = false;
    isDrawing = false;
});

// Cursor canvas touch indicator
cursorCanvas.addEventListener('touchmove', (e) => {
    if (touchActive && e.touches.length > 0) {
        const rect = cursorCanvas.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const y = e.touches[0].clientY - rect.top;
        
        cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
        cursorCtx.beginPath();
        
        if (currentMode === 'draw') {
            cursorCtx.arc(x, y, 6, 0, 2 * Math.PI);
            cursorCtx.fillStyle = '#ff007f';
            cursorCtx.strokeStyle = '#ff007f';
        } else {
            cursorCtx.arc(x, y, 15, 0, 2 * Math.PI);
            cursorCtx.fillStyle = 'rgba(0, 255, 204, 0.5)';
            cursorCtx.strokeStyle = '#00ffcc';
        }
        cursorCtx.lineWidth = 2;
        cursorCtx.fill();
        cursorCtx.stroke();
    }
});

function onResults(results) {
    uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    uiCtx.save();
    uiCtx.translate(uiCanvas.width, 0);
    uiCtx.scale(-1, 1);
    uiCtx.drawImage(results.image, 0, 0, uiCanvas.width, uiCanvas.height);
    uiCtx.restore();

    cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        statusText.innerText = `Mode: ${currentMode.toUpperCase()} — Pinch Thumb + Index to interact.`;
        
        const landmarks = results.multiHandLandmarks[0];
        
        // Mirror your hand placement skeleton over your video feed perfectly
        const mirroredLandmarks = landmarks.map(lm => ({
            ...lm,
            x: 1 - lm.x
        }));

        drawConnectors(uiCtx, mirroredLandmarks, HAND_CONNECTIONS, {color: '#00ffcc', lineWidth: 2});
        drawLandmarks(uiCtx, mirroredLandmarks, {color: '#ff007f', radius: 3});

        const thumb = landmarks[4];
        const index = landmarks[8];

        // Inverted whiteboard drawing space calculation
        const targetX = (1 - index.x) * paintCanvas.width;
        const targetY = index.y * paintCanvas.height;
        const thumbX = (1 - thumb.x) * paintCanvas.width;
        const thumbY = thumb.y * paintCanvas.height;

        lastX = lastX + (targetX - lastX) * lerpAmount;
        lastY = lastY + (targetY - lastY) * lerpAmount;

        const distance = Math.hypot(targetX - thumbX, targetY - thumbY);
        const pinchThreshold = 45; 
        const isPinching = distance < pinchThreshold;

        // --- RENDER DYNAMIC TARGET PREVIEW ---
        cursorCtx.beginPath();
        if (currentMode === 'draw') {
            // Draw Mode: Small precise dot tracker
            cursorCtx.arc(lastX, lastY, isPinching ? 6 : 12, 0, 2 * Math.PI);
            cursorCtx.fillStyle = isPinching ? '#ff007f' : 'rgba(255, 0, 127, 0.3)';
            cursorCtx.strokeStyle = '#ff007f';
        } else {
            // Eraser Mode: Larger structural circle representing the actual eraser boundaries
            cursorCtx.arc(lastX, lastY, 15, 0, 2 * Math.PI);
            cursorCtx.fillStyle = isPinching ? 'rgba(0, 255, 204, 0.5)' : 'rgba(255, 255, 255, 0.15)';
            cursorCtx.strokeStyle = '#00ffcc';
        }
        cursorCtx.lineWidth = 2;
        cursorCtx.fill();
        cursorCtx.stroke();

        // Line Processing Loop
        if (isPinching) {
            if (!isDrawing) {
                isDrawing = true;
                paintCtx.beginPath();
                paintCtx.moveTo(lastX, lastY);
            } else {
                paintCtx.lineTo(lastX, lastY);
                paintCtx.stroke();
            }
        } else {
            isDrawing = false;
        }
    } else {
        statusText.innerText = "Searching for hand tracking...";
        isDrawing = false;
    }
}

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
});
hands.onResults(onResults);

const camera = new Camera(video, {
    onFrame: async () => { await hands.send({ image: video }); },
    width: 640,
    height: 480
});

camera.start().then(() => {
    statusText.innerText = "System operational.";
    initCanvasDimensions();
});

window.addEventListener('resize', initCanvasDimensions);
