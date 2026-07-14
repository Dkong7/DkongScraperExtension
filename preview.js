// preview.js

let urls = [];
let mangaTitle = "Manga";
let isDownloading = false;

// DOM Elements
const titleEl = document.getElementById('mangaTitle');
const countEl = document.getElementById('mangaCount');
const container = document.getElementById('framesContainer');
const btnConfirm = document.getElementById('btnConfirmDownload');
const btnChooseFolder = document.getElementById('btnChooseFolder');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

let targetDirectoryHandle = null;

// Load Data
chrome.storage.local.get(['mangaPreviewUrls', 'mangaPreviewTitle'], (data) => {
    if (data.mangaPreviewUrls && data.mangaPreviewUrls.length > 0) {
        urls = data.mangaPreviewUrls;
        mangaTitle = data.mangaPreviewTitle || "Manga";
        
        titleEl.innerText = mangaTitle;
        countEl.innerText = `${urls.length} imágenes encontradas listas para descargar.`;
        
        renderImages();
    } else {
        titleEl.innerText = "Error";
        countEl.innerText = "No se encontraron imágenes en caché.";
        btnConfirm.disabled = true;
        btnChooseFolder.disabled = true;
    }
});

btnChooseFolder.addEventListener('click', async () => {
    try {
        targetDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        btnChooseFolder.innerText = '✅ Carpeta Seleccionada';
        btnChooseFolder.style.backgroundColor = '#28a745';
        btnChooseFolder.style.borderColor = '#28a745';
        btnConfirm.disabled = false; // Enable confirm
    } catch (err) {
        console.warn("Usuario canceló la selección de carpeta");
    }
});

function renderImages() {
    container.innerHTML = '';
    urls.forEach((url, index) => {
        const box = document.createElement('div');
        box.className = 'frame-box';
        box.id = 'frame-' + index;
        
        // Cargar las imágenes progresivamente para no saturar la memoria
        const img = document.createElement('img');
        img.loading = "lazy";
        img.src = url;
        
        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.innerText = index + 1;
        
        const overlay = document.createElement('div');
        overlay.className = 'success-overlay';
        overlay.innerText = '✔️';

        box.appendChild(img);
        box.appendChild(badge);
        box.appendChild(overlay);

        container.appendChild(box);
    });
}

// Download Logic
btnConfirm.addEventListener('click', async () => {
    if (isDownloading || urls.length === 0) return;
    isDownloading = true;
    
    // UI Updates
    btnConfirm.disabled = true;
    btnConfirm.innerText = "Descargando...";
    progressContainer.style.display = 'block';
    
    let settings = await chrome.storage.local.get('mangaSubfolder');
    let baseFolder = settings.mangaSubfolder || "Mangas";
    let finalFolder = `${baseFolder}/${mangaTitle}`;
    
    let successCount = 0;

    for (let i = 0; i < urls.length; i++) {
        let url = urls[i];
        let ext = url.split('.').pop().split('?')[0];
        if (ext.length > 4 || !['jpg','png','jpeg','webp','gif'].includes(ext)) ext = 'jpg';
        let filename = `${String(i + 1).padStart(3, '0')}.${ext}`;
        
        try {
            let res = await fetch(url);
            if (!res.ok) throw new Error("Network response was not ok");
            let blob = await res.blob();
            let saved = await saveToLocalDisk(filename, blob, finalFolder);
            
            if (!saved) {
                // Fallback a chrome.downloads
                chrome.downloads.download({
                    url: url,
                    filename: `DkongScraper/${finalFolder}/${filename}`,
                    saveAs: false
                });
            }
            
            // Éxito
            successCount++;
            document.getElementById('frame-' + i).classList.add('downloaded');
            
        } catch (e) {
            console.error("Error fetching image, falling back to direct download", e);
            // Fallback if fetch fails (e.g. CORS or adblocker)
            chrome.downloads.download({
                url: url,
                filename: `DkongScraper/${finalFolder}/${filename}`,
                saveAs: false
            });
            successCount++;
            document.getElementById('frame-' + i).classList.add('downloaded');
        }
        
        // Actualizar progreso
        let percent = Math.round(((i + 1) / urls.length) * 100);
        progressBar.style.width = `${percent}%`;
        progressText.innerText = `Descargando ${i + 1} de ${urls.length} (${percent}%)`;
    }
    
    btnConfirm.innerText = "¡Descarga Completada!";
    progressText.innerText = "¡Completado!";
    progressBar.style.backgroundColor = "#28a745"; // Verde
});

async function saveToLocalDisk(filename, blob, subfolderName = null) {
    try {
        let handle = targetDirectoryHandle;
        
        // Fallback to storageManager if user didn't pick, but we forced them to pick to enable the button.
        if (!handle) {
            handle = await window.storageManager.getDirectoryHandle('outputFolder');
            if (!handle) throw new Error("No handle");
            const hasPermission = await window.storageManager.verifyPermission(handle, true);
            if (!hasPermission) throw new Error("No permission");
        }
        
        let targetDir = handle;
        // Si el usuario eligió una carpeta, creamos la carpeta con el nombre del manga adentro
        if (handle === targetDirectoryHandle) {
            // Reemplazar caracteres inválidos en el nombre de carpeta
            let safeTitle = mangaTitle.replace(/[<>:"/\\|?*]+/g, '').trim();
            targetDir = await targetDir.getDirectoryHandle(safeTitle, { create: true });
        } else if (subfolderName) {
            // Dividimos por '/' para crear subcarpetas correctamente si existen niveles (ej. Mangas/Titulo)
            const parts = subfolderName.split('/');
            for (const part of parts) {
                let safePart = part.replace(/[<>:"/\\|?*]+/g, '').trim();
                if (safePart !== '') {
                    targetDir = await targetDir.getDirectoryHandle(safePart, { create: true });
                }
            }
        }
        
        const fileHandle = await targetDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
    } catch (e) {
        console.log("Fallback a chrome.downloads", e);
        return false;
    }
}
