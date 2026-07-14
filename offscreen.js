// offscreen.js

let mediaRecorder;
let recordedChunks = [];
let currentType = '';
let currentMode = '';
let stream;
let videoElement;
let canvasElement;
let ctx;
let animationFrameId;

// For GIF
let gifFrames = [];
let gifIntervalId;

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'offscreen_start_record') {
        currentType = request.type;
        currentMode = request.mode; // 'video' or 'gif'
        const rect = request.rect;
        
        recordedChunks = [];
        gifFrames = [];

        try {
            if (currentType === 'screen') {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        mandatory: {
                            chromeMediaSource: request.source || 'desktop',
                            chromeMediaSourceId: request.streamId
                        }
                    }
                });
            } else if (currentType === 'audio') {
                const tempStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        mandatory: {
                            chromeMediaSource: request.source || 'desktop',
                            chromeMediaSourceId: request.streamId
                        }
                    },
                    video: {
                        mandatory: {
                            chromeMediaSource: request.source || 'desktop',
                            chromeMediaSourceId: request.streamId
                        }
                    }
                });
                // We only want audio, but we MUST NOT stop the video track here. 
                // Stopping the video track kills the entire tab capture session, causing silent audio!
                // Instead, we just pass only the audio tracks to the new MediaStream.
                stream = new MediaStream(tempStream.getAudioTracks());
                
                // Keep a reference to the video track so it doesn't get garbage collected,
                // but disable it to save resources.
                tempStream.getVideoTracks().forEach(t => t.enabled = false);
                window.__keepAliveStream = tempStream;
            }

            if (currentType === 'audio') {
                const audioPlayer = document.createElement('audio');
                audioPlayer.srcObject = stream;
                audioPlayer.autoplay = true;
                window.__audioPlayer = audioPlayer; // keep reference to play locally
                
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
                mediaRecorder.onstop = finishAudio;
                mediaRecorder.start();
                return;
            }

            // --- VIDEO / GIF CROPPING LOGIC ---
            videoElement = document.createElement('video');
            videoElement.srcObject = stream;
            videoElement.muted = true;
            await videoElement.play();

            const isCropped = rect && rect.width && rect.height;
            let w, h, x, y;
            if (isCropped) {
                const streamWidth = videoElement.videoWidth;
                const expectedWidth = (rect.windowWidth * rect.devicePixelRatio) || streamWidth;
                const scale = streamWidth / expectedWidth;
                
                w = rect.width * scale;
                h = rect.height * scale;
                x = rect.x * scale;
                y = rect.y * scale;
            } else {
                w = videoElement.videoWidth;
                h = videoElement.videoHeight;
                x = 0;
                y = 0;
            }

            canvasElement = document.createElement('canvas');
            canvasElement.width = w;
            canvasElement.height = h;
            ctx = canvasElement.getContext('2d', { willReadFrequently: true });

            function drawLoop() {
                if (!videoElement || videoElement.paused || videoElement.ended) return;
                ctx.drawImage(videoElement, x, y, w, h, 0, 0, w, h);
            }
            // requestAnimationFrame does not work reliably in offscreen documents, use setInterval
            animationFrameId = setInterval(drawLoop, 1000 / 30);

            if (currentMode === 'screenshot') {
                // Give it a moment to render the first frame
                setTimeout(() => {
                    const dataUrl = canvasElement.toDataURL('image/png');
                    stopAll();
                    chrome.runtime.sendMessage({
                        action: 'desktop_screenshot_captured',
                        dataUrl: dataUrl
                    });
                    window.close();
                }, 300);
            } else if (currentMode === 'video' || currentMode === 'gif') {
                const canvasStream = canvasElement.captureStream(currentMode === 'gif' ? 10 : 30); // 10 fps for GIF, 30 for Video
                mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
                mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
                mediaRecorder.onstop = currentMode === 'video' ? finishVideo : finishGif;
                mediaRecorder.start();
            }

        } catch (e) {
            console.error("Error al iniciar grabación", e);
        }
    }

    if (request.action === 'offscreen_stop_record') {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }

    if (request.action === 'offscreen_save_blob') {
        saveDirectBlob(request.filename, request.subfolder);
    }
});

async function saveDirectBlob(filename, subfolderName) {
    try {
        const blob = await window.storageManager.getBlob('temp_direct_save');
        if (!blob) return;
        
        const handle = await window.storageManager.getDirectoryHandle('outputFolder');
        if (handle) {
            const hasPerm = await window.storageManager.verifyPermission(handle, true);
            if (hasPerm) {
                const targetDir = await handle.getDirectoryHandle(subfolderName, { create: true });
                const fileHandle = await targetDir.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            }
        }
    } catch(e) {
        console.error("Error direct saving from offscreen", e);
    }
    // Close offscreen after saving
    setTimeout(() => window.close(), 100);
}

async function finishAudio() {
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    stopAll();
    await window.storageManager.saveBlob('temp_media_blob', blob);
    chrome.runtime.sendMessage({ action: 'open_media_preview', mediaType: 'audio' });
    setTimeout(() => window.close(), 500);
}

async function finishVideo() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    stopAll();
    await window.storageManager.saveBlob('temp_media_blob', blob);
    chrome.runtime.sendMessage({ action: 'open_media_preview', mediaType: 'video' });
    setTimeout(() => window.close(), 500);
}

async function finishGif() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    stopAll();
    // Guardamos el blob del WebM temporal. gif_editor extraerá los fotogramas de él.
    await window.storageManager.saveBlob('temp_gif_blob', blob);
    chrome.runtime.sendMessage({ action: 'open_gif_editor' });
    setTimeout(() => window.close(), 500);
}

function tabCaptureEnabled(streamId) {
    // If it's a tab stream, streamId is formatted differently or we just try 'tab' first
    // Actually, since we explicitly request tabCapture getMediaStreamId, 'tab' is correct.
    // If it fails, fallback is impossible here, so we just assume 'tab'.
    return true; 
}

function stopAll() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (window.__keepAliveStream) window.__keepAliveStream.getTracks().forEach(t => t.stop());
    if (window.__audioPlayer) { window.__audioPlayer.srcObject = null; window.__audioPlayer = null; }
    if (animationFrameId) clearInterval(animationFrameId);
    if (videoElement) {
        videoElement.srcObject = null;
        videoElement = null;
    }
}

async function saveRecording(blob, prefix) {
    const filename = `${prefix}_${Date.now()}.webm`;
    
    try {
        const handle = await window.storageManager.getDirectoryHandle('outputFolder');
        if (handle) {
            const hasPerm = await window.storageManager.verifyPermission(handle, true);
            if (hasPerm) {
                const fileHandle = await handle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                return;
            }
        }
    } catch(e) {
        console.log("No handle in offscreen", e);
    }

    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
        url: url,
        filename: `DkongScraper/${filename}`
    });
}
