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

    // Completely lock mobile gestures at the Javascript level
    document.addEventListener('touchstart', (e) => {
        if(e.target.tagName !== 'BUTTON') e.preventDefault();
    }, { passive: false });
    document.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });

    function initCanvasDimensions() {
        const panel = paintCanvas.parentElement;
        
        // Match drawing memory buffers exactly to visible client bounding positions
        paintCanvas.width = panel.clientWidth;
        paintCanvas.height = panel.clientHeight;
        cursorCanvas.width = panel.clientWidth;
        cursorCanvas.height = panel.clientHeight;
        
        updateBrushSettings();
    }

    function updateBrushSettings() {
        paintCtx.lineCap = 'round';
        paintCtx.lineJoin = 'round';
        if (currentMode === 'draw') {
            paintCtx.globalCompositeOperation = 'source-over';
            paintCtx.strokeStyle = '#ff007f'; 
            paintCtx.lineWidth = 6;
        } else if (currentMode === 'erase') {
            paintCtx.globalCompositeOperation = 'destination-out';
            paintCtx.lineWidth = 35;
        }
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
            statusText.innerText = "Tracking Active! Pinch to paint.";
            
            const landmarks = results.multiHandLandmarks[0];
            const mirroredLandmarks = landmarks.map(lm => ({ ...lm, x: 1 - lm.x }));

            drawConnectors(uiCtx, mirroredLandmarks, HAND_CONNECTIONS, {color: '#00ffcc', lineWidth: 2});
            drawLandmarks(uiCtx, mirroredLandmarks, {color: '#ff007f', radius: 3});

            const thumb = landmarks[4];
            const index = landmarks[8];

            const targetX = index.x * paintCanvas.width;
            const targetY = index.y * paintCanvas.height;
            const thumbX = thumb.x * paintCanvas.width;
            const thumbY = thumb.y * paintCanvas.height;

            lastX = lastX + (targetX - lastX) * lerpAmount;
            lastY = lastY + (targetY - lastY) * lerpAmount;

            const distance = Math.hypot(targetX - thumbX, targetY - thumbY);
            const pinchThreshold = 40; 
            const isPinching = distance < pinchThreshold;

            cursorCtx.beginPath();
            if (currentMode === 'draw') {
                cursorCtx.arc(lastX, lastY, isPinching ? 5 : 12, 0, 2 * Math.PI);
                cursorCtx.fillStyle = isPinching ? '#ff007f' : 'rgba(255, 0, 127, 0.2)';
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
            statusText.innerText = "Frame ready. Frame your hand inside the webcam box.";
            isDrawing = false;
        }
    }

    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0, // Lower model complexity to keep mobile CPU frames fast
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onResults);

    // --- CRITICAL MOBILE WEBCAM INVOCATION ---
    // Instead of using MediaPipe's rigid Camera helper object, we construct native constraints 
    // to bypass iOS Safari autoplay blocking policies.
    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "user", // Forces selection of the FRONT camera
            width: { ideal: 640 },
            height: { ideal: 480 }
        },
        audio: false
    }).then(stream => {
        video.srcObject = stream;
        video.play();
        statusText.innerText = "Webcam running. Synchronizing AI model...";
        
        // Loop processing frames manually onto the model background
        async function processFrame() {
            if (!video.paused && !video.ended) {
                await hands.send({ image: video });
            }
            requestAnimationFrame(processFrame);
        }
        video.addEventListener('playing', () => {
            initCanvasDimensions();
            requestAnimationFrame(processFrame);
        });
    }).catch(err => {
        statusText.innerText = "Camera Access Error: " + err.message;
    });

    window.addEventListener('resize', initCanvasDimensions);
    window.addEventListener('orientationchange', () => setTimeout(initCanvasDimensions, 300));
