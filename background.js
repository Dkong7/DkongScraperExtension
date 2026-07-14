// background.js
importScripts('storage_manager.js');

// Helper to write to local directory handle
async function saveToLocalDisk(filename, blob, subfolderName = null) {
    try {
        const handle = await self.storageManager.getDirectoryHandle('outputFolder');
        if (!handle) throw new Error("No handle");
        
        const hasPermission = await self.storageManager.verifyPermission(handle, true);
        if (!hasPermission) throw new Error("No permission");
        
        let targetDir = handle;
        if (subfolderName) {
            targetDir = await handle.getDirectoryHandle(subfolderName, { create: true });
        }
        
        const fileHandle = await targetDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
    } catch (e) {
        console.log("No se pudo guardar localmente, cayendo a chrome.downloads", e);
        return false;
    }
}

// Escuchar peticiones
// Helper to send message and inject script if missing
function sendCaptureMessage(tab, mode) {
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        console.warn("No se puede capturar en páginas internas de Chrome.");
        return;
    }
    chrome.tabs.sendMessage(tab.id, {action: 'init_area_selection', mode: mode}).catch(async () => {
        try {
            await chrome.scripting.executeScript({ target: {tabId: tab.id}, files: ['capture.js'] });
            chrome.tabs.sendMessage(tab.id, {action: 'init_area_selection', mode: mode});
        } catch(e) { console.error("No se pudo inyectar el script", e); }
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.action === 'capture_visible') {
        chrome.windows.getCurrent(win => {
            chrome.tabs.captureVisibleTab(win.id, {format: 'png'}, (dataUrl) => {
                openEditorWithImage(dataUrl);
            });
        });
        return true;
    }

    if (request.action === 'capture_visible_sync') {
        const mode = request.mode;
        const rect = request.rect;
        const targetWindowId = sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
        
        chrome.tabs.captureVisibleTab(targetWindowId, {format: 'png'}, (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                sendResponse(null);
                return;
            }
            if (mode === 'screenshot') {
                cropImage(dataUrl, rect).then(croppedUrl => {
                    openEditorWithImage(croppedUrl);
                });
            } else if (mode === 'video' || mode === 'gif') {
                startRecordingProcess('screen', mode, rect, sender.tab);
            } else {
                sendResponse(dataUrl);
            }
        });
        return true;
    }

    if (request.action === 'full_page_captured') {
        openEditorWithImage(request.dataUrl);
        return true;
    }

    if (request.action === 'process_manga_downloads') {
        chrome.storage.local.set({ 
            mangaPreviewUrls: request.urls, 
            mangaPreviewTitle: request.title 
        }, () => {
            chrome.tabs.create({ url: 'preview.html' });
        });
        return true;
    }

    if (request.action === 'download_manual_manga') {
        chrome.tabs.create({ url: request.url, active: false }, (newTab) => {
            // Esperar a que la página cargue y ejecute su JS interno (SPA)
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === newTab.id && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    // Inyectar el script y extraer las imágenes después de 2 segundos (dar tiempo a Inmanga)
                    setTimeout(() => {
                        chrome.scripting.executeScript({ target: {tabId: newTab.id}, files: ['manga_downloader.js'] }).then(() => {
                            chrome.tabs.sendMessage(newTab.id, {action: 'download_manga'}).catch(e => console.log(e));
                        }).catch(e => console.log("Error inyectando en manual", e));
                    }, 2000);
                }
            });
        });
        return true;
    }

    if (request.action === 'start_recording') {
        startRecordingProcess(request.type);
        return true;
    }

    if (request.action === 'start_audio_record') {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                startRecordingProcess('audio', 'audio', null, tabs[0]);
            }
        });
        return true;
    }

    if (request.action === 'stop_recording') {
        stopRecordingProcess();
        return true;
    }

    if (request.action === 'open_gif_editor') {
        chrome.tabs.create({ url: 'gif_editor.html' });
        return true;
    }

    if (request.action === 'open_media_preview') {
        chrome.tabs.create({ url: `media_preview.html?type=${request.mediaType}` });
        return true;
    }

    if (request.action === 'start_capture_area') {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                sendCaptureMessage(tabs[0], request.mode || 'screenshot');
            }
        });
        return true;
    }
    
    if (request.action === 'start_full_page_capture') {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                if (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('chrome-extension://')) return;
                chrome.tabs.sendMessage(tabs[0].id, { action: 'start_scroll_capture' }).catch(async () => {
                    try {
                        await chrome.scripting.executeScript({ target: {tabId: tabs[0].id}, files: ['capture.js'] });
                        chrome.tabs.sendMessage(tabs[0].id, { action: 'start_scroll_capture' });
                    } catch(e) {}
                });
            }
        });
        return true;
    }
    
    if (request.action === 'area_selected') {
        const rect = request.rect;
        const mode = request.mode;
        
        if (mode === 'screenshot') {
            const targetWindowId = sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
            chrome.tabs.captureVisibleTab(targetWindowId, {format: 'png'}, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    return;
                }
                cropImage(dataUrl, rect).then(croppedUrl => {
                    openEditorWithImage(croppedUrl);
                });
            });
        } else if (mode === 'video' || mode === 'gif') {
            startRecordingProcess('screen', mode, rect, sender.tab);
        }
        return true;
    }
});

// Listener para atajos de teclado
chrome.commands.onCommand.addListener((command) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs[0]) return;
        
        if (command === 'take-screenshot') {
            sendCaptureMessage(tabs[0], 'screenshot');
        } else if (command === 'record-gif') {
            sendCaptureMessage(tabs[0], 'gif');
        } else if (command === 'record-video') {
            sendCaptureMessage(tabs[0], 'video');
        } else if (command === 'record-audio') {
            startRecordingProcess('audio', 'audio', null, tabs[0]);
        }
    });
});

async function openEditorWithImage(dataUrl) {
    // Save to local storage temporary for editor using IndexedDB to avoid quota errors
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await self.storageManager.saveBlob('temp_image_blob', blob);
    
    chrome.storage.local.get(['openEditor', 'playShutterSound', 'screenshotSubfolder'], (settings) => {
        if (settings.openEditor !== false) {
            chrome.tabs.create({ url: 'editor.html' });
        } else {
            // Save directly
            saveDataUrlToFile(dataUrl, `Screenshot_${Date.now()}.png`, settings.screenshotSubfolder || 'Capturas');
        }
    });
}

async function saveDataUrlToFile(dataUrl, filename, subfolderName) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    
    try {
        const handle = await self.storageManager.getDirectoryHandle('outputFolder');
        if (handle) {
            const hasPerm = await self.storageManager.verifyPermission(handle, true);
            if (hasPerm) {
                // background.js is a Service Worker and cannot use createWritable.
                // Delegate to offscreen document.
                await self.storageManager.saveBlob('temp_direct_save', blob);
                await setupOffscreenDocument('offscreen.html');
                chrome.runtime.sendMessage({
                    action: 'offscreen_save_blob',
                    filename: filename,
                    subfolder: subfolderName
                });
                return;
            }
        }
    } catch(e) {}
    
    // Fallback
    chrome.downloads.download({
        url: dataUrl,
        filename: `${subfolderName}/${filename}`,
        saveAs: false
    });
}

// Crop Image using Offscreen canvas (MV3 background scripts support OffscreenCanvas)
async function cropImage(dataUrl, rect) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    
    const canvas = new OffscreenCanvas(rect.width, rect.height);
    const ctx = canvas.getContext('2d');
    
    // El rect viene en CSS pixels, debemos considerar el devicePixelRatio si es necesario
    // Para simplificar, asumimos que coinciden
    ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    
    const outBlob = await canvas.convertToBlob({ type: 'image/png' });
    
    // Blob to DataUrl
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(outBlob);
    });
}

// Process Manga
async function processManga(urls, title) {
    let settings = await chrome.storage.local.get('mangaSubfolder');
    let baseFolder = settings.mangaSubfolder || "Mangas";
    let finalFolder = `${baseFolder}/${title}`;

    for (let i = 0; i < urls.length; i++) {
        let url = urls[i];
        let ext = url.split('.').pop().split('?')[0];
        if (ext.length > 4) ext = 'jpg';
        let filename = `${String(i + 1).padStart(3, '0')}.${ext}`;
        
        try {
            let res = await fetch(url);
            let blob = await res.blob();
            let saved = await saveToLocalDisk(filename, blob, finalFolder);
            
            if (!saved) {
                // Fallback chrome downloads
                chrome.downloads.download({
                    url: url,
                    filename: `${finalFolder}/${filename}`,
                    saveAs: false
                });
            }
        } catch (e) {
            console.error("Error descargando manga", e);
        }
    }
}

// Offscreen Document Management para grabaciones
let creating;
async function setupOffscreenDocument(path) {
    if (await chrome.offscreen.hasDocument()) return;
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: ['USER_MEDIA', 'DISPLAY_MEDIA'],
            justification: 'Recording screen and audio'
        });
        await creating;
        creating = null;
    }
}

async function startRecordingProcess(type, mode = 'video', rect = null, tab = null) {
    await setupOffscreenDocument('offscreen.html');
    
    // Obtener streamId si es pantalla
    let streamInfo = null;
    if (type === 'screen' || type === 'audio') {
        streamInfo = await new Promise((resolve) => {
            if (tab && chrome.tabCapture) {
                chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
                    if (id) {
                        resolve({ id: id, source: 'tab' });
                    } else {
                        // Consumir el error para evitar Unchecked runtime.lastError
                        let err = chrome.runtime.lastError;
                        console.warn("tabCapture failed, falling back to desktopCapture", err);
                        chrome.desktopCapture.chooseDesktopMedia(['screen', 'window', 'tab', 'audio'], tab, (deskId) => resolve({ id: deskId, source: 'desktop' }));
                    }
                });
            } else if (tab) {
                chrome.desktopCapture.chooseDesktopMedia(['screen', 'window', 'tab', 'audio'], tab, (deskId) => resolve({ id: deskId, source: 'desktop' }));
            } else {
                resolve(null);
            }
        });
        if (!streamInfo || !streamInfo.id) return; // Cancelado
    }

    chrome.runtime.sendMessage({
        action: 'offscreen_start_record',
        type: type,
        mode: mode,
        rect: rect,
        streamId: (type === 'screen' || type === 'audio') ? streamInfo.id : null,
        source: (type === 'screen' || type === 'audio') ? streamInfo.source : null
    });
}

function stopRecordingProcess() {
    chrome.runtime.sendMessage({ action: 'offscreen_stop_record' });
}
