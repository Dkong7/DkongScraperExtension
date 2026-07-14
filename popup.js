document.addEventListener('DOMContentLoaded', () => {
    const status = document.getElementById('status');

    // Tab Navigation
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.add('active');
        });
    });

    // Settings Button
    document.getElementById('btnSettings').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // --- TAB CAPTURE ---
    document.getElementById('btnCaptureArea').addEventListener('click', () => {
        status.innerText = "Selecciona un área...";
        chrome.runtime.sendMessage({ action: 'start_capture_area', mode: 'screenshot' });
        window.close();
    });

    document.getElementById('btnCaptureVisible').addEventListener('click', () => {
        status.innerText = "Capturando...";
        chrome.runtime.sendMessage({ action: 'capture_visible' });
        window.close();
    });

    document.getElementById('btnCaptureFull').addEventListener('click', () => {
        status.innerText = "Haciendo scroll y capturando...";
        chrome.runtime.sendMessage({ action: 'start_full_page_capture' });
        window.close();
    });

    // --- TAB GRABAR ---
    const btnRecordVideo = document.getElementById('btnRecordVideo');
    const btnRecordGif = document.getElementById('btnRecordGif');
    const btnRecordAudio = document.getElementById('btnRecordAudio');
    const btnStopRecord = document.getElementById('btnStopRecord');
    const recordControls = document.querySelector('#tab-record'); // Parent holding the buttons
    const recordingActive = document.getElementById('recording-active');
    
    // Función para manejar la visibilidad de los controles
    function updateRecordUI(isRecording) {
        if (isRecording) {
            btnRecordVideo.style.display = 'none';
            btnRecordGif.style.display = 'none';
            btnRecordAudio.style.display = 'none';
            document.querySelector('#tab-record p').style.display = 'none';
            recordingActive.style.display = 'block';
            startTimer();
        } else {
            btnRecordVideo.style.display = 'flex';
            btnRecordGif.style.display = 'flex';
            btnRecordAudio.style.display = 'flex';
            document.querySelector('#tab-record p').style.display = 'block';
            recordingActive.style.display = 'none';
            stopTimer();
        }
    }

    if (btnRecordVideo) btnRecordVideo.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'start_capture_area', mode: 'video' });
        window.close();
    });

    if (btnRecordGif) btnRecordGif.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'start_capture_area', mode: 'gif' });
        window.close();
    });

    if (btnRecordAudio) btnRecordAudio.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'start_audio_record' });
        updateRecordUI(true);
    });

    const recordingTime = document.getElementById('recording-time');
    let timerInterval = null;
    let startTime = 0;

    function updateTimer() {
        const diff = Math.floor((Date.now() - startTime) / 1000);
        const mins = String(Math.floor(diff / 60)).padStart(2, '0');
        const secs = String(diff % 60).padStart(2, '0');
        recordingTime.innerText = `${mins}:${secs}`;
    }

    function startTimer() {
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    if (btnStopRecord) {
        btnStopRecord.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'stop_recording' });
            updateRecordUI(false);
            status.innerText = "Procesando...";
        });
    }

    // --- TAB DOWNLOAD ---
    document.getElementById('btnDownloadManga').addEventListener('click', async () => {
        status.innerText = "Extrayendo manga...";
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, { action: 'download_manga' });
            window.close();
        } catch (e) {
            status.innerText = "Error: " + e.message;
        }
    });

    document.getElementById('btnManualDownload').addEventListener('click', () => {
        const url = document.getElementById('manualLinkInput').value.trim();
        if (!url) return alert('Por favor, pega un enlace válido.');
        
        status.innerText = "Iniciando descarga manual...";
        
        if (url.includes('inmanga.com')) {
            // Descarga nativa de manga en background
            chrome.runtime.sendMessage({ action: 'download_manual_manga', url: url });
            status.innerText = "Descargando Manga...";
            setTimeout(() => window.close(), 1500);
        } else {
            // Enviar a DkongMediaConverter
            fetch('http://localhost:5000/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: [url] })
            }).then(r => {
                status.innerText = "¡Enviado al Converter!";
                setTimeout(() => window.close(), 1500);
            }).catch(e => {
                status.innerText = "Error: ¿Está abierto el Converter? " + e.message;
            });
        }
    });

    // Old Scraper Logic
    const btnExtractLinks = document.getElementById('btnExtractLinks');
    const btnCopyLinks = document.getElementById('btnCopyLinks');
    const resultsContainer = document.getElementById('results-container');
    const cardsList = document.getElementById('cards-list');
    const cbSelectAll = document.getElementById('cb-select-all');
    const selectedCount = document.getElementById('selected-count');

    function updateSelectedCount() {
        const checkedBoxes = cardsList.querySelectorAll('.card-checkbox:checked');
        selectedCount.innerText = `${checkedBoxes.length} seleccionados`;
    }

    cbSelectAll.addEventListener('change', (e) => {
        const checkboxes = cardsList.querySelectorAll('.card-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            const card = cb.closest('.card');
            if (e.target.checked) card.classList.add('selected');
            else card.classList.remove('selected');
        });
        updateSelectedCount();
    });

    btnExtractLinks.addEventListener('click', async () => {
        status.innerText = 'Analizando página...';
        resultsContainer.style.display = 'none';
        cardsList.innerHTML = '';
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const results = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { action: 'get_extracted_urls' }, resolve);
            });

            if (results && results.length > 0) {
                status.innerText = `¡Éxito! ${results.length} enlaces.`;
                results.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'card selected';
                    
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.className = 'card-checkbox';
                    cb.checked = true;
                    cb.dataset.url = item.url;
                    
                    const thumb = document.createElement('div');
                    thumb.className = 'card-thumb';
                    if (item.thumb) {
                        const img = document.createElement('img');
                        img.src = item.thumb;
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        thumb.appendChild(img);
                    } else {
                        thumb.innerText = 'IMG';
                    }
                    
                    const info = document.createElement('div');
                    info.className = 'card-info';
                    const urlText = document.createElement('div');
                    urlText.className = 'card-url';
                    urlText.innerText = item.url;
                    info.appendChild(urlText);
                    
                    card.appendChild(cb);
                    card.appendChild(thumb);
                    card.appendChild(info);
                    
                    card.addEventListener('click', (e) => {
                        if (e.target !== cb) cb.checked = !cb.checked;
                        if (cb.checked) card.classList.add('selected');
                        else card.classList.remove('selected');
                        updateSelectedCount();
                    });
                    
                    cardsList.appendChild(card);
                });
                
                resultsContainer.style.display = 'flex';
                updateSelectedCount();
            } else {
                status.innerText = 'No se encontraron enlaces soportados.';
            }
        } catch (error) {
            status.innerText = 'Error: ' + error.message;
        }
    });

    btnCopyLinks.addEventListener('click', () => {
        const checkedBoxes = cardsList.querySelectorAll('.card-checkbox:checked');
        if (checkedBoxes.length === 0) return;
        const textToCopy = Array.from(checkedBoxes).map(cb => cb.dataset.url).join('\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            btnCopyLinks.innerText = `✅ ¡Copiados!`;
            setTimeout(() => { btnCopyLinks.innerText = '📋 Copiar Enlaces'; }, 2000);
        });
    });
});
