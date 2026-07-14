// capture.js

let captureOverlay = null;
let startX, startY, currentX, currentY;
let isDragging = false;
let selectionRect = null;
let currentMode = 'screenshot';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'init_area_selection') {
        currentMode = request.mode || 'screenshot';
        initOverlay();
    }
    
    if (request.action === 'start_scroll_capture') {
        startFullPageScroll();
    }
    
    if (request.action === 'show_audio_ui') {
        showAudioRecordingUI();
    }
});

function initOverlay() {
    if (captureOverlay) return;

    captureOverlay = document.createElement('div');
    captureOverlay.id = 'dkong-capture-overlay';
    captureOverlay.style.position = 'fixed';
    captureOverlay.style.top = '0';
    captureOverlay.style.left = '0';
    captureOverlay.style.width = '100vw';
    captureOverlay.style.height = '100vh';
    captureOverlay.style.backgroundColor = 'rgba(0,0,0,0.4)';
    captureOverlay.style.zIndex = '999999999';
    captureOverlay.style.cursor = 'crosshair';

    // Show mode hint
    const hint = document.createElement('div');
    hint.innerText = `Modo: ${currentMode.toUpperCase()}. Dibuja un rectángulo o pulsa ESC para cancelar.`;
    hint.style.position = 'absolute';
    hint.style.top = '10px';
    hint.style.left = '50%';
    hint.style.transform = 'translateX(-50%)';
    hint.style.color = 'white';
    hint.style.background = '#fbbc05';
    hint.style.padding = '5px 15px';
    hint.style.borderRadius = '5px';
    hint.style.fontWeight = 'bold';
    hint.style.pointerEvents = 'none';
    captureOverlay.appendChild(hint);

    selectionRect = document.createElement('div');
    selectionRect.style.position = 'absolute';
    selectionRect.style.border = currentMode === 'screenshot' ? '2px solid #fbbc05' : '2px solid red';
    selectionRect.style.backgroundColor = 'transparent';
    selectionRect.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.5)'; // Darken outside
    selectionRect.style.display = 'none';

    captureOverlay.appendChild(selectionRect);
    document.body.appendChild(captureOverlay);

    captureOverlay.addEventListener('mousedown', onMouseDown);
    captureOverlay.addEventListener('mousemove', onMouseMove);
    captureOverlay.addEventListener('mouseup', onMouseUp);
    
    document.addEventListener('keydown', onKeyDown);
}

function onKeyDown(e) {
    if (e.key === 'Escape') {
        removeOverlay();
    }
}

function onMouseDown(e) {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    selectionRect.style.left = startX + 'px';
    selectionRect.style.top = startY + 'px';
    selectionRect.style.width = '0px';
    selectionRect.style.height = '0px';
    selectionRect.style.display = 'block';
    captureOverlay.style.backgroundColor = 'transparent';
}

function onMouseMove(e) {
    if (!isDragging) return;
    
    currentX = e.clientX;
    currentY = e.clientY;
    
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);
    
    selectionRect.style.left = x + 'px';
    selectionRect.style.top = y + 'px';
    selectionRect.style.width = w + 'px';
    selectionRect.style.height = h + 'px';
}

function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;
    
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);

    removeOverlay();

    if (w > 10 && h > 10) {
        const rect = {
            x: x * window.devicePixelRatio,
            y: y * window.devicePixelRatio,
            width: w * window.devicePixelRatio,
            height: h * window.devicePixelRatio,
            devicePixelRatio: window.devicePixelRatio,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight
        };
        
        if (currentMode === 'video' || currentMode === 'gif') {
            showCountdown(() => {
                chrome.runtime.sendMessage({
                    action: 'area_selected',
                    mode: currentMode,
                    rect: rect
                });
                showFloatingStopButton();
            });
        } else {
            setTimeout(() => {
                chrome.runtime.sendMessage({
                    action: 'area_selected',
                    mode: currentMode,
                    rect: rect
                });
            }, 100);
        }
    }
}

function showCountdown(callback) {
    const counter = document.createElement('div');
    counter.style.position = 'fixed';
    counter.style.top = '50%';
    counter.style.left = '50%';
    counter.style.transform = 'translate(-50%, -50%)';
    counter.style.fontSize = '150px';
    counter.style.fontWeight = 'bold';
    counter.style.color = '#fbbc05';
    counter.style.textShadow = '0 0 20px black';
    counter.style.zIndex = '9999999999';
    document.body.appendChild(counter);

    let count = 3;
    counter.innerText = count;
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            counter.innerText = count;
        } else {
            clearInterval(interval);
            counter.remove();
            callback();
        }
    }, 1000);
}

function showFloatingStopButton() {
    const btn = document.createElement('button');
    btn.innerText = '⏹ Detener Grabación';
    btn.style.position = 'fixed';
    btn.style.bottom = '30px';
    btn.style.right = '30px';
    btn.style.padding = '15px 25px';
    btn.style.backgroundColor = '#dc3545';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '50px';
    btn.style.fontSize = '16px';
    btn.style.fontWeight = 'bold';
    btn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
    btn.style.cursor = 'pointer';
    btn.style.zIndex = '9999999999';
    
    // Drag logic
    let isDragging = false;
    let offsetX, offsetY;
    btn.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - btn.getBoundingClientRect().left;
        offsetY = e.clientY - btn.getBoundingClientRect().top;
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        btn.style.left = (e.clientX - offsetX) + 'px';
        btn.style.top = (e.clientY - offsetY) + 'px';
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { isDragging = false; });
    
    btn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stop_recording' });
        btn.remove();
    });
    document.body.appendChild(btn);
}

function showAudioRecordingUI() {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '30px';
    container.style.right = '30px';
    container.style.padding = '15px 25px';
    container.style.backgroundColor = '#1a1512';
    container.style.color = '#d97736';
    container.style.border = '2px solid #d97736';
    container.style.borderRadius = '50px';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '15px';
    container.style.fontFamily = 'sans-serif';
    container.style.fontSize = '16px';
    container.style.fontWeight = 'bold';
    container.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
    container.style.zIndex = '9999999999';

    // Red dot animation
    const dot = document.createElement('div');
    dot.style.width = '12px';
    dot.style.height = '12px';
    dot.style.backgroundColor = '#dc3545';
    dot.style.borderRadius = '50%';
    dot.style.boxShadow = '0 0 8px #dc3545';
    
    // Keyframes for blinking
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes dkong-blink {
            0% { opacity: 1; }
            50% { opacity: 0.3; }
            100% { opacity: 1; }
        }
        .dkong-blinking {
            animation: dkong-blink 1.5s infinite;
        }
    `;
    document.head.appendChild(style);
    dot.className = 'dkong-blinking';

    const text = document.createElement('span');
    text.innerText = 'Grabando Audio...';

    const btn = document.createElement('button');
    btn.innerText = '⏹ Detener';
    btn.style.padding = '8px 15px';
    btn.style.backgroundColor = '#dc3545';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '20px';
    btn.style.fontWeight = 'bold';
    btn.style.cursor = 'pointer';

    btn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stop_recording' });
        container.remove();
        style.remove();
    });

    // Drag logic
    let isDragging = false;
    let offsetX, offsetY;
    container.addEventListener('mousedown', (e) => {
        if (e.target === btn) return; // Don't drag if clicking button
        isDragging = true;
        offsetX = e.clientX - container.getBoundingClientRect().left;
        offsetY = e.clientY - container.getBoundingClientRect().top;
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        container.style.left = (e.clientX - offsetX) + 'px';
        container.style.top = (e.clientY - offsetY) + 'px';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { isDragging = false; });

    container.appendChild(dot);
    container.appendChild(text);
    container.appendChild(btn);
    document.body.appendChild(container);
}

function removeOverlay() {
    if (captureOverlay) {
        captureOverlay.remove();
        captureOverlay = null;
        selectionRect = null;
        document.removeEventListener('keydown', onKeyDown);
    }
}

// Full page scroll logic
async function startFullPageScroll() {
    // A simple approach: we ask background to capture, scroll down, repeat, then stitch.
    // Stitching requires a canvas. To avoid large memory, we will let background do it, or we do it here.
    // Since content scripts can create canvas, we can do it here and send the final dataUrl to background.
    
    let totalHeight = Math.max(
        document.body.scrollHeight, document.documentElement.scrollHeight,
        document.body.offsetHeight, document.documentElement.offsetHeight,
        document.body.clientHeight, document.documentElement.clientHeight
    );
    
    let viewportHeight = window.innerHeight;
    let currentScroll = 0;
    
    // Limits
    const MAX_CANVAS_DIMENSION = 16000;
    let scale = 1;
    let canvasHeight = totalHeight * window.devicePixelRatio;
    let canvasWidth = window.innerWidth * window.devicePixelRatio;
    
    if (canvasHeight > MAX_CANVAS_DIMENSION) {
        scale = MAX_CANVAS_DIMENSION / canvasHeight;
        canvasHeight = MAX_CANVAS_DIMENSION;
        canvasWidth = canvasWidth * scale;
    }
    
    // Create an offscreen canvas to stitch images
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    
    // Hide scrollbars temporarily
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    // Find all fixed and sticky elements
    const fixedElements = [];
    const allElements = document.querySelectorAll('*');
    for (let el of allElements) {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
            // Check if it's visible to avoid messing with hidden elements
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                fixedElements.push({ el: el, originalOpacity: el.style.opacity });
            }
        }
    }
    
    window.scrollTo(0, 0);
    await sleep(500);
    
    while (currentScroll < totalHeight) {
        if (currentScroll > 0) {
            // Hide fixed elements after the first screenshot
            for (let item of fixedElements) {
                item.el.style.opacity = '0';
            }
        }

        // Request background to capture visible tab
        const dataUrl = await new Promise(resolve => {
            chrome.runtime.sendMessage({action: 'capture_visible_sync'}, resolve);
        });
        
        if (dataUrl) {
            // Draw to canvas
            await new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    let sourceY = currentScroll * window.devicePixelRatio * scale;
                    let targetWidth = img.width * scale;
                    let targetHeight = img.height * scale;
                    ctx.drawImage(img, 0, sourceY, targetWidth, targetHeight);
                    resolve();
                };
                img.src = dataUrl;
            });
        }
        
        currentScroll += viewportHeight;
        if (currentScroll < totalHeight) {
            window.scrollTo(0, currentScroll);
            await sleep(800); // Wait 800ms to avoid exceeding Chrome's 2 captures/sec quota
        }
    }
    
    // Restore
    document.body.style.overflow = originalOverflow;
    for (let item of fixedElements) {
        item.el.style.opacity = item.originalOpacity;
    }
    
    // Send final stitched image
    const finalDataUrl = canvas.toDataURL('image/png');
    chrome.runtime.sendMessage({
        action: 'full_page_captured',
        dataUrl: finalDataUrl
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
