// media_preview.js

const params = new URLSearchParams(window.location.search);
const mediaType = params.get('type') || 'video';
let mediaBlob = null;
let blobUrl = null;

const titleEl = document.getElementById('title');
const container = document.getElementById('mediaContainer');
const btnSave = document.getElementById('btnSave');
const btnDiscard = document.getElementById('btnDiscard');
const timelineContainer = document.getElementById('timelineContainer');
const startSlider = document.getElementById('startSlider');
const endSlider = document.getElementById('endSlider');
const sliderFill = document.getElementById('sliderFill');
const timeDisplay = document.getElementById('timeDisplay');
const exportOverlay = document.getElementById('exportOverlay');
const exportBar = document.getElementById('exportBar');

let mainVideoElement = null;
let mainAudioElement = null;
let audioBuffer = null;
let audioContext = null;
let videoDuration = 0;
let loopPlayback = true;

// Waveform interaction
let isDraggingWaveform = false;
let dragStartX = 0;
let selectionStart = 0; // fraction 0 to 1
let selectionEnd = 1; // fraction 0 to 1

const btnLoop = document.getElementById('btnLoop');
const customControls = document.getElementById('customControls');
const btnPlayPause = document.getElementById('btnPlayPause');

btnLoop.addEventListener('click', () => {
    loopPlayback = !loopPlayback;
    btnLoop.innerText = loopPlayback ? '🔁 Bucle Activado' : '➡️ Bucle Desactivado';
    btnLoop.style.background = loopPlayback ? '#4d4d4d' : '#3d3d3d';
});

titleEl.innerText = mediaType === 'audio' ? 'Previsualizar Nota de Voz' : 'Previsualizar Video';

// Load blob from IndexedDB
async function init() {
    try {
        mediaBlob = await window.storageManager.getBlob('temp_media_blob');
        if (!mediaBlob) {
            container.innerHTML = "No se encontró el archivo temporal.";
            return;
        }

        blobUrl = URL.createObjectURL(mediaBlob);

        if (mediaType === 'audio') {
            const audio = document.createElement('audio');
            audio.src = blobUrl;
            container.appendChild(audio);
            
            const canvas = document.createElement('canvas');
            canvas.id = 'audioCanvas';
            canvas.width = 500;
            canvas.height = 120;
            container.appendChild(canvas);
            
            customControls.style.display = 'flex';
            
            mainAudioElement = audio;
            
            audio.addEventListener('loadedmetadata', () => {
                videoDuration = audio.duration;
                if (videoDuration === Infinity) {
                    audio.currentTime = 1e101;
                    audio.addEventListener('timeupdate', function getDur() {
                        audio.removeEventListener('timeupdate', getDur);
                        videoDuration = audio.duration;
                        audio.currentTime = 0;
                    });
                } else {
                    audio.currentTime = 0;
                }
            });
            if (audio.readyState >= 1) { // HAVE_METADATA
                videoDuration = audio.duration;
            }
            
            await initInteractiveWaveform(mediaBlob, canvas, audio);
            
            btnPlayPause.addEventListener('click', () => {
                if (audio.paused) {
                    audio.play();
                    btnPlayPause.innerText = '⏸ Pausar';
                } else {
                    audio.pause();
                    btnPlayPause.innerText = '▶️ Reproducir';
                }
            });
            
            audio.addEventListener('ended', () => {
                btnPlayPause.innerText = '▶️ Reproducir';
            });
            
            
            // Audio timeline is handled via the canvas, so we don't init timelineContainer
            timelineContainer.style.display = 'none';
        } else {
            const video = document.createElement('video');
            video.controls = true;
            video.autoplay = true;
            video.src = blobUrl;
            container.appendChild(video);
            mainVideoElement = video;
            
            video.addEventListener('loadedmetadata', () => {
                // Ensure duration is fully available. Sometimes Chrome gives Infinity for WebM chunks
                if (video.duration === Infinity) {
                    video.currentTime = 1e101;
                    video.addEventListener('timeupdate', function getDur() {
                        video.removeEventListener('timeupdate', getDur);
                        videoDuration = video.duration;
                        video.currentTime = 0;
                        initTimeline(video);
                    });
                } else {
                    videoDuration = video.duration;
                    initTimeline(video);
                }
            });
        }
    } catch (e) {
        container.innerHTML = "Error cargando previsualización: " + e.message;
    }
}

async function initInteractiveWaveform(blob, canvas, audioEl) {
    audioContext = new AudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const ctx = canvas.getContext('2d');
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;
    
    // Pre-calculate the base waveform image to avoid redrawing it point by point every frame
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = canvas.width;
    baseCanvas.height = canvas.height;
    const baseCtx = baseCanvas.getContext('2d');
    baseCtx.fillStyle = '#fbbc05'; // Dkong orange
    for (let i = 0; i < baseCanvas.width; i++) {
        let min = 1.0; let max = -1.0;
        for (let j = 0; j < step; j++) {
            let datum = data[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        baseCtx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }
    
    // Interaction
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        dragStartX = (e.clientX - rect.left) / canvas.width;
        selectionStart = dragStartX;
        selectionEnd = dragStartX;
        isDraggingWaveform = true;
    });
    
    window.addEventListener('mousemove', (e) => {
        if (!isDraggingWaveform) return;
        const rect = canvas.getBoundingClientRect();
        let currentX = (e.clientX - rect.left) / canvas.width;
        currentX = Math.max(0, Math.min(1, currentX));
        selectionStart = Math.min(dragStartX, currentX);
        selectionEnd = Math.max(dragStartX, currentX);
        
        // Sync sliders for trimming logic
        if (videoDuration > 0) {
            startSlider.value = selectionStart * videoDuration;
            endSlider.value = selectionEnd * videoDuration;
        }
    });
    
    window.addEventListener('mouseup', (e) => {
        if (isDraggingWaveform) {
            isDraggingWaveform = false;
            // If it was just a click, don't reset everything, just jump to that point
            if (selectionEnd - selectionStart < 0.01) {
                selectionStart = 0;
                selectionEnd = 1;
                const rect = canvas.getBoundingClientRect();
                let clickX = (e.clientX - rect.left) / canvas.width;
                clickX = Math.max(0, Math.min(1, clickX));
                if (videoDuration > 0) {
                    audioEl.currentTime = clickX * videoDuration;
                    startSlider.value = 0;
                    endSlider.value = videoDuration;
                }
            } else {
                if (videoDuration > 0) {
                    audioEl.currentTime = selectionStart * videoDuration;
                    startSlider.value = selectionStart * videoDuration;
                    endSlider.value = selectionEnd * videoDuration;
                }
            }
        }
    });

    // Time update loop for audio
    audioEl.addEventListener('timeupdate', () => {
        let current = audioEl.currentTime;
        let start = selectionStart * videoDuration;
        let end = selectionEnd * videoDuration;
        
        if (selectionEnd - selectionStart > 0.01) {
            if (current < start) audioEl.currentTime = start;
            if (current >= end) {
                if (loopPlayback) {
                    audioEl.currentTime = start;
                    audioEl.play();
                } else {
                    audioEl.pause();
                    audioEl.currentTime = end;
                    btnPlayPause.innerText = '▶️ Reproducir';
                }
            }
        }
    });

    function renderLoop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw unselected parts darker
        ctx.globalAlpha = 0.3;
        ctx.drawImage(baseCanvas, 0, 0);
        
        // Draw selected part brighter
        ctx.globalAlpha = 1.0;
        let startX = selectionStart * canvas.width;
        let widthX = (selectionEnd - selectionStart) * canvas.width;
        if (widthX > 0) {
            ctx.drawImage(baseCanvas, startX, 0, widthX, canvas.height, startX, 0, widthX, canvas.height);
            
            // Draw selection box
            ctx.fillStyle = 'rgba(251, 188, 5, 0.2)'; // semi-transparent orange overlay
            ctx.fillRect(startX, 0, widthX, canvas.height);
            ctx.strokeStyle = '#fbbc05';
            ctx.lineWidth = 2;
            ctx.strokeRect(startX, 0, widthX, canvas.height);
        } else {
            // No selection, draw everything full brightness
            ctx.drawImage(baseCanvas, 0, 0);
        }
        
        // Draw playhead
        if (videoDuration > 0) {
            let playheadX = (audioEl.currentTime / videoDuration) * canvas.width;
            ctx.fillStyle = '#ff3300';
            ctx.fillRect(playheadX - 1, 0, 2, canvas.height);
        }
        
        requestAnimationFrame(renderLoop);
    }
    
    renderLoop();
}

function initTimeline(mediaEl) {
    timelineContainer.classList.add('visible');
    startSlider.max = videoDuration;
    endSlider.max = videoDuration;
    startSlider.value = 0;
    endSlider.value = videoDuration;
    
    updateSliders();
    
    startSlider.addEventListener('input', () => {
        if (parseFloat(startSlider.value) >= parseFloat(endSlider.value)) startSlider.value = endSlider.value - 0.1;
        updateSliders();
        mediaEl.currentTime = startSlider.value;
    });
    endSlider.addEventListener('input', () => {
        if (parseFloat(endSlider.value) <= parseFloat(startSlider.value)) endSlider.value = parseFloat(startSlider.value) + 0.1;
        updateSliders();
        mediaEl.currentTime = endSlider.value;
    });
    
    mediaEl.addEventListener('timeupdate', () => {
        if (mediaEl.currentTime < startSlider.value) {
            mediaEl.currentTime = startSlider.value;
        }
        if (mediaEl.currentTime >= endSlider.value) {
            if (loopPlayback) {
                mediaEl.currentTime = startSlider.value;
                mediaEl.play();
            } else {
                mediaEl.pause();
                mediaEl.currentTime = endSlider.value;
                if (mediaEl === mainAudioElement) {
                    btnPlayPause.innerText = '▶️ Reproducir';
                }
            }
        }
    });
}

function updateSliders() {
    let s = parseFloat(startSlider.value);
    let e = parseFloat(endSlider.value);
    let pS = (s / videoDuration) * 100;
    let pE = (e / videoDuration) * 100;
    sliderFill.style.left = pS + '%';
    sliderFill.style.width = (pE - pS) + '%';
    
    timeDisplay.innerText = `${s.toFixed(1)}s / ${e.toFixed(1)}s`;
}

btnDiscard.addEventListener('click', () => {
    if (confirm("¿Estás seguro de desechar esta grabación?")) {
        window.close();
    }
});

btnSave.addEventListener('click', async () => {
    if (!mediaBlob) return;
    btnSave.disabled = true;
    
    let finalBlob = mediaBlob;
    let isTrimmed = (parseFloat(startSlider.value) > 0 || parseFloat(endSlider.value) < videoDuration - 0.2);
    
    if (isTrimmed) {
        btnSave.innerText = "Recortando...";
        exportOverlay.style.display = 'flex';
        if (mediaType === 'audio') {
            finalBlob = await trimAudio();
        } else if (mainVideoElement) {
            finalBlob = await trimVideo();
        }
    } else {
        btnSave.innerText = "Guardando...";
    }

    const prefix = mediaType === 'audio' ? 'Grabacion_Audio' : 'Grabacion_Video';
    const ext = finalBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const filename = `${prefix}_${Date.now()}.${ext}`;

    try {
        const handle = await window.storageManager.getDirectoryHandle('outputFolder');
        if (handle) {
            const hasPerm = await window.storageManager.verifyPermission(handle, true);
            if (hasPerm) {
                const fileHandle = await handle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(finalBlob);
                await writable.close();
                alert("¡Grabación guardada correctamente!");
                window.close();
                return;
            }
        }
    } catch(e) {
        console.log("No directory handle, using fallback", e);
    }

    // Fallback
    const finalUrl = URL.createObjectURL(finalBlob);
    chrome.downloads.download({
        url: finalUrl,
        filename: `DkongScraper/${filename}`,
        saveAs: false
    }, () => {
        alert("¡Descarga iniciada!");
        window.close();
    });
});

async function trimVideo() {
    return new Promise((resolve) => {
        const startTime = parseFloat(startSlider.value);
        const endTime = parseFloat(endSlider.value);
        const duration = endTime - startTime;
        
        const canvas = document.createElement('canvas');
        canvas.width = mainVideoElement.videoWidth;
        canvas.height = mainVideoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        
        const stream = canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks = [];
        
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
            const outBlob = new Blob(chunks, { type: 'video/webm' });
            resolve(outBlob);
        };
        
        mainVideoElement.pause();
        mainVideoElement.currentTime = startTime;
        
        recorder.start();
        
        let lastTime = performance.now();
        function drawFrame(now) {
            if (mainVideoElement.currentTime >= endTime) {
                recorder.stop();
                return;
            }
            
            ctx.drawImage(mainVideoElement, 0, 0, canvas.width, canvas.height);
            
            // update progress bar
            let progress = ((mainVideoElement.currentTime - startTime) / duration) * 100;
            exportBar.style.width = `${progress}%`;
            
            requestAnimationFrame(drawFrame);
        }
        
        mainVideoElement.play();
        requestAnimationFrame(drawFrame);
    });
}

async function trimAudio() {
    return new Promise((resolve) => {
        const startTime = parseFloat(startSlider.value);
        const endTime = parseFloat(endSlider.value);
        const duration = endTime - startTime;
        
        const dest = audioContext.createMediaStreamDestination();
        const recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
        const chunks = [];
        
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
            resolve(new Blob(chunks, { type: 'audio/webm' }));
        };
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(dest);
        
        recorder.start();
        source.start(0, startTime, duration);
        
        let playbackTime = 0;
        function updateAudioProgress() {
            playbackTime += 0.1;
            let progress = (playbackTime / duration) * 100;
            exportBar.style.width = `${Math.min(progress, 100)}%`;
            if (playbackTime < duration) {
                setTimeout(updateAudioProgress, 100);
            } else {
                recorder.stop();
            }
        }
        updateAudioProgress();
    });
}

window.addEventListener('unload', () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
});

init();
