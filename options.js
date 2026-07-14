document.addEventListener('DOMContentLoaded', async () => {
    // Menu navigation
    const menuItems = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.section');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            menuItems.forEach(m => m.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(item.dataset.target).classList.add('active');
        });
    });

    // Elements
    const openEditor = document.getElementById('openEditor');
    const playShutterSound = document.getElementById('playShutterSound');
    const imageFormatRadios = document.getElementsByName('imageFormat');
    const screenshotModeRadios = document.getElementsByName('screenshotMode');
    const videoFormatRadios = document.getElementsByName('videoFormat');
    const screenshotSubfolder = document.getElementById('screenshotSubfolder');
    const videoSubfolder = document.getElementById('videoSubfolder');
    const audioSubfolder = document.getElementById('audioSubfolder');
    const mangaSubfolder = document.getElementById('mangaSubfolder');
    
    const btnSelectFolder = document.getElementById('btnSelectFolder');
    const outputFolderDisplay = document.getElementById('outputFolderDisplay');
    const folderStatus = document.getElementById('folderStatus');
    const btnSave = document.getElementById('btnSave');
    const saveStatus = document.getElementById('saveStatus');
    const btnOpenShortcuts = document.getElementById('btnOpenShortcuts');

    // Load settings from chrome.storage
    chrome.storage.local.get({
        openEditor: true,
        playShutterSound: true,
        imageFormat: 'png',
        videoFormat: 'webm',
        screenshotSubfolder: 'Capturas',
        videoSubfolder: 'Videos',
        audioSubfolder: 'Audios',
        mangaSubfolder: 'Mangas'
    }, (items) => {
        openEditor.checked = items.openEditor;
        playShutterSound.checked = items.playShutterSound;
        screenshotSubfolder.value = items.screenshotSubfolder;
        videoSubfolder.value = items.videoSubfolder;
        audioSubfolder.value = items.audioSubfolder;
        mangaSubfolder.value = items.mangaSubfolder;
        
        for (let radio of screenshotModeRadios) {
            if (radio.value === items.screenshotMode) radio.checked = true;
        }
        for (let radio of imageFormatRadios) {
            if (radio.value === items.imageFormat) radio.checked = true;
        }
        for (let radio of videoFormatRadios) {
            if (radio.value === items.videoFormat) radio.checked = true;
        }
    });

    // Check if we have a directory handle in IndexedDB
    try {
        const handle = await window.storageManager.getDirectoryHandle('outputFolder');
        if (handle) {
            outputFolderDisplay.value = `Carpeta vinculada: ${handle.name}`;
            // Verify permission silently
            const hasPermission = await window.storageManager.verifyPermission(handle, true);
            if (!hasPermission) {
                folderStatus.style.display = 'block';
                folderStatus.innerText = '⚠️ Haz clic en Seleccionar Carpeta de nuevo para renovar los permisos.';
            } else {
                folderStatus.style.display = 'none';
            }
        }
    } catch (e) {
        console.error("Error loading handle", e);
    }

    // Select Folder logic
    btnSelectFolder.addEventListener('click', async () => {
        try {
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
            await window.storageManager.saveDirectoryHandle('outputFolder', handle);
            outputFolderDisplay.value = `Carpeta vinculada: ${handle.name}`;
            folderStatus.style.display = 'none';
            
            // Re-verify immediately to ensure we have permission
            await window.storageManager.verifyPermission(handle, true);
        } catch (error) {
            console.log('User cancelled or error:', error);
        }
    });

    // Save Settings
    btnSave.addEventListener('click', () => {
        let imageFormat = 'png';
        for (let radio of imageFormatRadios) {
            if (radio.checked) imageFormat = radio.value;
        }
        
        let videoFormat = 'webm';
        for (let radio of videoFormatRadios) {
            if (radio.checked) videoFormat = radio.value;
        }

        let screenshotMode = 'browser';
        for (let radio of screenshotModeRadios) {
            if (radio.checked) screenshotMode = radio.value;
        }

        chrome.storage.local.set({
            openEditor: openEditor.checked,
            playShutterSound: playShutterSound.checked,
            screenshotMode: screenshotMode,
            imageFormat: imageFormat,
            videoFormat: videoFormat,
            screenshotSubfolder: screenshotSubfolder.value,
            videoSubfolder: videoSubfolder.value,
            audioSubfolder: audioSubfolder.value,
            mangaSubfolder: mangaSubfolder.value
        }, () => {
            saveStatus.style.display = 'inline';
            setTimeout(() => {
                saveStatus.style.display = 'none';
            }, 2000);
        });
    });

    // Open Shortcuts
    btnOpenShortcuts.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
});
