// editor.js

const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');
let baseImage = new Image();
let drawings = [];

let currentTool = 'rect';
let isDrawing = false;
let startX, startY;
const colorPicker = document.getElementById('colorPicker');

// Load image from IndexedDB
window.storageManager.getBlob('temp_image_blob').then(blob => {
    if (blob) {
        const url = URL.createObjectURL(blob);
        baseImage.onload = () => {
            canvas.width = baseImage.width;
            canvas.height = baseImage.height;
            redraw();
            URL.revokeObjectURL(url);
        };
        baseImage.src = url;
    } else {
        // Fallback for old storage if someone had it
        chrome.storage.local.get(['tempImage'], (data) => {
            if (data.tempImage) {
                baseImage.onload = () => {
                    canvas.width = baseImage.width;
                    canvas.height = baseImage.height;
                    redraw();
                };
                baseImage.src = data.tempImage;
            }
        });
    }
});

// Tools setup
document.querySelectorAll('.tool-btn:not(.btn-save)').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.dataset.tool;
    });
});

// Canvas events
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    startX = (e.clientX - rect.left) * scaleX;
    startY = (e.clientY - rect.top) * scaleY;
    
    if (currentTool === 'text') {
        const text = prompt("Escribe tu comentario:");
        if (text) {
            drawings.push({
                type: 'text',
                x: startX,
                y: startY,
                text: text,
                color: colorPicker.value
            });
            redraw();
        }
        return;
    }
    
    isDrawing = true;
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;
    
    redraw(); // Draw base + previous drawings
    
    // Draw current active tool preview
    ctx.strokeStyle = colorPicker.value;
    ctx.fillStyle = colorPicker.value;
    ctx.lineWidth = 4;
    
    if (currentTool === 'rect') {
        ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
    } else if (currentTool === 'arrow') {
        drawArrow(ctx, startX, startY, currentX, currentY);
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const endX = (e.clientX - rect.left) * scaleX;
    const endY = (e.clientY - rect.top) * scaleY;
    
    // Solo guardar si hay distancia
    if (Math.abs(endX - startX) > 5 || Math.abs(endY - startY) > 5) {
        drawings.push({
            type: currentTool,
            startX: startX,
            startY: startY,
            endX: endX,
            endY: endY,
            color: colorPicker.value
        });
    }
    
    redraw();
});

function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0);
    
    for (let d of drawings) {
        ctx.strokeStyle = d.color;
        ctx.fillStyle = d.color;
        ctx.lineWidth = 4;
        
        if (d.type === 'rect') {
            ctx.strokeRect(d.startX, d.startY, d.endX - d.startX, d.endY - d.startY);
        } else if (d.type === 'arrow') {
            drawArrow(ctx, d.startX, d.startY, d.endX, d.endY);
        } else if (d.type === 'text') {
            ctx.font = "bold 24px Arial";
            ctx.fillText(d.text, d.x, d.y);
            // Draw background or stroke for better visibility
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'white';
            ctx.strokeText(d.text, d.x, d.y);
        }
    }
}

function drawArrow(ctx, fromX, fromY, toX, toY) {
    const headlen = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
}

// COPY
document.getElementById('btnCopy').addEventListener('click', () => {
    canvas.toBlob(blob => {
        try {
            navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ]).then(() => {
                const btn = document.getElementById('btnCopy');
                btn.innerText = '✅ Copiado';
                setTimeout(() => btn.innerText = '📋 Copiar', 2000);
            });
        } catch (err) {
            alert('Error al copiar al portapapeles: ' + err.message);
        }
    }, 'image/png');
});

// SAVE
document.getElementById('btnSave').addEventListener('click', async () => {
    const dataUrl = canvas.toDataURL('image/png');
    const filename = `Screenshot_${Date.now()}.png`;
    
    try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        
        const handle = await window.storageManager.getDirectoryHandle('outputFolder');
        if (handle) {
            const hasPerm = await window.storageManager.verifyPermission(handle, true);
            if (hasPerm) {
                const fileHandle = await handle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                alert('¡Imagen guardada localmente!');
                window.close();
                return;
            }
        }
    } catch(e) {
        console.log("No handle, falling back to chrome.downloads");
    }

    chrome.downloads.download({
        url: dataUrl,
        filename: `DkongScraper/${filename}`,
        saveAs: false
    }, () => {
        alert('Imagen descargada.');
        window.close();
    });
});
