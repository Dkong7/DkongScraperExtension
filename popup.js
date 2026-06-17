document.addEventListener('DOMContentLoaded', () => {
    const btnExtract = document.getElementById('btn-extract');
    const btnCopy = document.getElementById('btn-copy');
    const status = document.getElementById('status');
    const resultsContainer = document.getElementById('results-container');
    const cardsList = document.getElementById('cards-list');
    const cbSelectAll = document.getElementById('cb-select-all');
    const selectedCount = document.getElementById('selected-count');

    let extractedData = [];

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

    btnExtract.addEventListener('click', async () => {
        status.innerText = 'Analizando página...';
        status.style.color = '#e5d3b3';
        resultsContainer.style.display = 'none';
        cardsList.innerHTML = '';
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab || !tab.url) {
                throw new Error('No se pudo acceder a la pestaña activa.');
            }

            const results = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { action: 'get_extracted_urls' }, (res) => {
                    resolve(res);
                });
            });

            if (chrome.runtime.lastError || !results) {
                throw new Error('Por favor, recarga la pestaña de X/Twitter para que el nuevo sistema de captura de historial empiece a funcionar.');
            }

            if (results && results.length > 0) {
                extractedData = results;
                if (extractedData.length > 0) {
                    status.innerText = `¡Éxito! Se encontraron ${extractedData.length} enlaces.`;
                    status.style.color = '#a3c293';
                    
                    // Renderizar tarjetas
                    extractedData.forEach((item, index) => {
                        const card = document.createElement('div');
                        card.className = 'card selected';
                        
                        // Checkbox
                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.className = 'card-checkbox';
                        cb.checked = true;
                        cb.dataset.url = item.url;
                        
                        // Thumb
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
                            thumb.innerText = 'Sin IMG';
                        }
                        
                        // Info
                        const info = document.createElement('div');
                        info.className = 'card-info';
                        
                        const urlText = document.createElement('div');
                        urlText.className = 'card-url';
                        urlText.innerText = item.url.replace('https://www.', '').replace('https://', '');
                        urlText.title = item.url;
                        
                        info.appendChild(urlText);
                        
                        // Armar tarjeta
                        card.appendChild(cb);
                        card.appendChild(thumb);
                        card.appendChild(info);
                        
                        // Eventos para seleccionar la tarjeta clickeando en cualquier parte
                        card.addEventListener('click', (e) => {
                            if (e.target !== cb) {
                                cb.checked = !cb.checked;
                            }
                            if (cb.checked) card.classList.add('selected');
                            else card.classList.remove('selected');
                            
                            // Check if all are selected to update the "Select All" checkbox
                            const allBoxes = cardsList.querySelectorAll('.card-checkbox');
                            const allChecked = Array.from(allBoxes).every(b => b.checked);
                            cbSelectAll.checked = allChecked;
                            
                            updateSelectedCount();
                        });
                        
                        cardsList.appendChild(card);
                    });
                    
                    resultsContainer.style.display = 'flex';
                    btnCopy.style.display = 'block';
                    updateSelectedCount();
                    cbSelectAll.checked = true;
                } else {
                    status.innerText = 'No se encontraron enlaces soportados en esta página.';
                    status.style.color = '#e63946';
                }
            }

        } catch (error) {
            status.innerText = 'Error: ' + error.message;
            status.style.color = '#e63946';
        }
    });

    btnCopy.addEventListener('click', () => {
        const checkedBoxes = cardsList.querySelectorAll('.card-checkbox:checked');
        if (checkedBoxes.length === 0) return;
        
        const urlsToCopy = Array.from(checkedBoxes).map(cb => cb.dataset.url);
        const textToCopy = urlsToCopy.join('\n');
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = btnCopy.innerText;
            btnCopy.innerText = `✅ ¡${checkedBoxes.length} copiados!`;
            setTimeout(() => {
                btnCopy.innerText = originalText;
            }, 2000);
        });
    });
});

// Función movida a content.js para recolección en segundo plano
