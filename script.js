const video = document.getElementById('webcam');
    const uiCanvas = document.getElementById('uiCanvas');
    const uiCtx = uiCanvas.getContext('2d');
    const paintCanvas = document.getElementById('paintCanvas');
    const paintCtx = paintCanvas.getContext('2d');
    const cursorCanvas = document.getElementById('cursorCanvas');
    const cursorCtx = cursorCanvas.getContext('2d');
    const statusText = document.getElementById('status');
    
    const drawModeBtn = document.getElementById('drawModeBtn');
    const eraseModeBtn = document.getElementById('eraseModeBtn');
    const clearBtn = document.getElementById('clearBtn');

    let isDrawing = false;
    let currentMode = 'draw'; 
    let lastX = 0, lastY = 0;
    const lerpAmount = 0.35; 

    // Handle high-density Retina displays smoothly by saving an unlinked cache array of lines if needed,
    // or scaling drawing calculations across standard offsets.
    function initCanvasDimensions() {
        const container = paintCanvas.parentElement;
        
        // Dynamic client boundary mapping
        paintCanvas.width = container.clientWidth;
        paintCanvas.height = container.clientHeight;
        cursorCanvas.width = container.clientWidth;
        cursorCanvas.height = container.clientHeight;
        
        updateBrushSettings();
    }

    function updateBrushSettings() {
        paintCtx.lineCap = 'round';
        paintCtx.lineJoin = 'round';

        if (currentMode === 'draw') {
            paintCtx.globalCompositeOperation = 'source-over';
            paintCtx.strokeStyle = varColor('--accent-pink', '#ff007f'); 
            paintCtx.lineWidth = 6;
        } else if (currentMode === 'erase') {
            paintCtx.globalCompositeOperation = 'destination-out';
            paintCtx.lineWidth = 35; // Wider brush for easier mobile erasing paths
        }
    }

    // Helper to extract native CSS variables dynamically for Canvas execution streams
    function varColor(cssVar, fallback) {
        return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || fallback;
    }

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

    function onResults(results) {
        uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
        uiCtx.save();
        uiCtx.translate(uiCanvas.width, 0);
        uiCtx.scale(-1, 1);
        uiCtx.drawImage(results.image, 0, 0, uiCanvas.width, uiCanvas.height);
        uiCtx.restore();

        cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            statusText.innerText = "Tracking Connected! Pinch finger to draw.";
            
            const landmarks = results.multiHandLandmarks[0];
            const mirroredLandmarks = landmarks.map(lm => ({ ...lm, x: 1 - lm.x }));

            drawConnectors(uiCtx, mirroredLandmarks, HAND_CONNECTIONS, {color: '#00ffcc', lineWidth: 2});
            drawLandmarks(uiCtx, mirroredLandmarks, {color: '#ff007f', radius: 3});

            const thumb = landmarks[4];
            const index = landmarks[8];

            // Mapping raw input coordinates safely to variable pixel bounds
            const targetX = index.x * paintCanvas.width;
            const targetY = index.y * paintCanvas.height;
            const thumbX = thumb.x * paintCanvas.width;
            const thumbY = thumb.y * paintCanvas.height;

            lastX = lastX + (targetX - lastX) * lerpAmount;
            lastY = lastY + (targetY - lastY) * lerpAmount;

            const distance = Math.hypot(targetX - thumbX, targetY - thumbY);
            const pinchThreshold = 45; 
            const isPinching = distance < pinchThreshold;

            cursorCtx.beginPath();
            if (currentMode === 'draw') {
                cursorCtx.arc(lastX, lastY, isPinching ? 6 : 14, 0, 2 * Math.PI);
                cursorCtx.fillStyle = isPinching ? 'rgba(255, 0, 127, 0.9)' : 'rgba(255, 0, 127, 0.25)';
                cursorCtx.strokeStyle = '#ff007f';
            } else {
                cursorCtx.arc(lastX, lastY, 18, 0, 2 * Math.PI);
                cursorCtx.fillStyle = isPinching ? 'rgba(0, 255, 204, 0.4)' : 'rgba(255, 255, 255, 0.1)';
                cursorCtx.strokeStyle = '#00ffcc';
            }
            cursorCtx.lineWidth = 2;
            cursorCtx.fill();
            cursorCtx.stroke();

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
            statusText.innerText = "Point your camera at your hand...";
            isDrawing = false;
        }
    }

    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5, // Slightly optimized lower bar for mobile camera frames
        minTrackingConfidence: 0.5
    });
    hands.onResults(onResults);

    // Using browser defaults for mobile camera resolution adaptation
    const camera = new Camera(video, {
        onFrame: async () => { await hands.send({ image: video }); },
        width: 640,
        height: 480
    });
    
    camera.start().then(() => {
        statusText.innerText = "Calibrated. Ready!";
        initCanvasDimensions();
    });

    // Smart event handling for changing device screen rotation shapes
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(initCanvasDimensions, 200);
    });