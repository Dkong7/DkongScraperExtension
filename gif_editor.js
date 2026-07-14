// gif_editor.js

let frames = [];
const container = document.getElementById('framesContainer');
const frameCount = document.getElementById('frameCount');
let isPreviewing = false;
let previewInterval;

window.storageManager.getBlob('temp_gif_blob').then(async blob => {
    if (blob) {
        try {
            document.getElementById('frameCount').innerText = "Extrayendo fotogramas...";
            const url = URL.createObjectURL(blob);
            const video = document.createElement('video');
            video.src = url;
            video.muted = true;
            await video.play();

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            
            // Await metadata
            await new Promise(r => {
                if (video.readyState >= 1) r();
                else video.addEventListener('loadedmetadata', r, {once: true});
            });

            // Workaround for Chrome WebM duration bug
            if (video.duration === Infinity) {
                video.currentTime = 1e101;
                await new Promise(r => {
                    video.addEventListener('timeupdate', function getDur() {
                        video.removeEventListener('timeupdate', getDur);
                        r();
                    });
                });
            }

            video.pause();
            video.currentTime = 0;

            const duration = video.duration;
            const fps = 10;
            const step = 1 / fps;
            
            for (let t = 0; t <= duration; t += step) {
                video.currentTime = t;
                await new Promise(r => {
                    video.addEventListener('seeked', r, {once: true});
                });
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                frames.push({ src: canvas.toDataURL('image/webp', 0.5), deleted: false });
            }
            
            if (frames.length > 0) {
                renderFrames();
                return;
            }
        } catch(e) {
            console.error(e);
        }
    }
    container.innerHTML = "<p>No hay fotogramas para mostrar.</p>";
});

function renderFrames() {
    container.innerHTML = '';
    let activeCount = 0;

    frames.forEach((f, index) => {
        const box = document.createElement('div');
        box.className = 'frame-box' + (f.deleted ? ' deleted' : '');
        
        const img = document.createElement('img');
        img.src = f.src;
        
        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.innerText = index + 1;
        
        const delIcon = document.createElement('div');
        delIcon.className = 'delete-icon';
        delIcon.innerText = '❌';

        box.appendChild(img);
        box.appendChild(badge);
        box.appendChild(delIcon);

        box.addEventListener('click', () => {
            f.deleted = !f.deleted;
            renderFrames(); // Re-render to update counts and styles
        });

        container.appendChild(box);
        if (!f.deleted) activeCount++;
    });

    frameCount.innerText = `${activeCount} fotogramas activos de ${frames.length}`;
}

// Preview
const modal = document.getElementById('previewModal');
const previewImg = document.getElementById('previewImg');

document.getElementById('btnPlayPreview').addEventListener('click', () => {
    const activeFrames = frames.filter(f => !f.deleted).map(f => f.src);
    if (activeFrames.length === 0) return alert("No hay fotogramas activos.");
    
    modal.style.display = 'flex';
    isPreviewing = true;
    
    let i = 0;
    previewInterval = setInterval(() => {
        if (!isPreviewing) return clearInterval(previewInterval);
        previewImg.src = activeFrames[i];
        i = (i + 1) % activeFrames.length;
    }, 100); // 10 fps
});

document.getElementById('btnClosePreview').addEventListener('click', () => {
    modal.style.display = 'none';
    isPreviewing = false;
    clearInterval(previewInterval);
});

// Save (Generate WebM as an animated format)
document.getElementById('btnSave').addEventListener('click', async () => {
    const activeFrames = frames.filter(f => !f.deleted).map(f => f.src);
    if (activeFrames.length === 0) return alert("No hay fotogramas activos.");

    document.getElementById('btnSave').innerText = '⏳ Generando...';
    document.getElementById('btnSave').disabled = true;

    // To generate an animated file natively without external heavy libraries like gif.js,
    // we use a Canvas + MediaRecorder to create a WebM (animated image).
    const img = new Image();
    img.src = activeFrames[0];
    await new Promise(r => img.onload = r);

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');

    const stream = canvas.captureStream(10); // 10 fps
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];

    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    
    recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const filename = `Animated_${Date.now()}.webm`;
        
        try {
            const settings = await chrome.storage.local.get(['videoSubfolder']);
            const subfolderName = settings.videoSubfolder || 'Videos';
            
            const handle = await window.storageManager.getDirectoryHandle('outputFolder');
            if (handle) {
                const hasPerm = await window.storageManager.verifyPermission(handle, true);
                if (hasPerm) {
                    const targetDir = await handle.getDirectoryHandle(subfolderName, { create: true });
                    const fileHandle = await targetDir.getFileHandle(filename, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    alert("¡Animación guardada!");
                    window.close();
                    return;
                }
            }
        } catch(e) {}

        const settingsFallback = await chrome.storage.local.get(['videoSubfolder']);
        const subfolderFallback = settingsFallback.videoSubfolder || 'Videos';
        
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url: url, filename: `${subfolderFallback}/${filename}` }, () => {
            alert('Descargado exitosamente.');
            window.close();
        });
    };

    recorder.start();

    // Draw frames sequentially
    for (let i = 0; i < activeFrames.length; i++) {
        const tempImg = new Image();
        tempImg.src = activeFrames[i];
        await new Promise(r => tempImg.onload = r);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempImg, 0, 0);
        await new Promise(r => setTimeout(r, 100)); // 100ms per frame
    }

    recorder.stop();
});
