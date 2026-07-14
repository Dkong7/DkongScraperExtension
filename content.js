let itemsMap = new Map(); // Para evitar duplicados usando la url como key

// Extrae los enlaces del DOM y los guarda en itemsMap de memoria
function extractUrlsFromDOM() {
    const url = window.location.href;

    if (url.includes('x.com') || url.includes('twitter.com')) {
        const aTags = document.querySelectorAll('a[href*="/status/"]');
        aTags.forEach(a => {
            const href = a.href;
            const match = href ? href.match(/\/[^\/]+\/status\/\d+/) : null;
            if (match) {
                // Normalizar URL usando solo el match base
                const cleanUrl = 'https://x.com' + match[0];
                
                // Buscar miniatura (imagen que no sea de perfil)
                let thumbSrc = null;
                const article = a.closest('article');
                if (article) {
                    const imgs = article.querySelectorAll('img');
                    for (const img of imgs) {
                        if (img.src && !img.src.includes('profile_images')) {
                            thumbSrc = img.src;
                            break;
                        }
                    }
                }
                
                if (!itemsMap.has(cleanUrl)) {
                    itemsMap.set(cleanUrl, { url: cleanUrl, thumb: thumbSrc });
                } else if (thumbSrc && !itemsMap.get(cleanUrl).thumb) {
                    itemsMap.get(cleanUrl).thumb = thumbSrc;
                }
            }
        });
    } 
    else if (url.includes('instagram.com')) {
        const aTags = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
        aTags.forEach(a => {
            const href = a.href;
            if (href) {
                let cleanUrl = href.split('?')[0];
                if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
                
                let thumbSrc = null;
                const img = a.querySelector('img');
                if (img && img.src) thumbSrc = img.src;
                
                if (!itemsMap.has(cleanUrl)) itemsMap.set(cleanUrl, { url: cleanUrl, thumb: thumbSrc });
            }
        });
    } 
    else if (url.includes('tiktok.com')) {
        const aTags = document.querySelectorAll('a[href*="/video/"]');
        aTags.forEach(a => {
            const href = a.href;
            const match = href ? href.match(/@[\w\.-]+\/video\/\d+/) : null;
            if (match) {
                // Forzar URL base para evitar cualquier duplicado por parámetros o barras extras
                const cleanUrl = 'https://www.tiktok.com/' + match[0];
                
                let thumbSrc = null;
                const wrapper = a.closest('div');
                if (wrapper) {
                    const img = wrapper.querySelector('img');
                    if (img && img.src && !img.src.includes('avatar')) {
                        thumbSrc = img.src;
                    }
                }
                
                if (!itemsMap.has(cleanUrl)) {
                    itemsMap.set(cleanUrl, { url: cleanUrl, thumb: thumbSrc });
                } else if (thumbSrc && !itemsMap.get(cleanUrl).thumb) {
                    itemsMap.get(cleanUrl).thumb = thumbSrc;
                }
            }
        });
    }
    else if (url.includes('youtube.com')) {
        const aTags = document.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]');
        aTags.forEach(a => {
            const href = a.href;
            if (href) {
                let cleanUrl = null;
                if (href.includes('/shorts/')) {
                    const match = href.match(/\/shorts\/([^&?]+)/);
                    if (match) cleanUrl = 'https://www.youtube.com/shorts/' + match[1];
                } else {
                    try {
                        const urlObj = new URL(href);
                        const v = urlObj.searchParams.get('v');
                        if (v) cleanUrl = 'https://www.youtube.com/watch?v=' + v;
                    } catch (e) {}
                }
                
                if (cleanUrl) {
                    let thumbSrc = null;
                    const img = a.querySelector('img');
                    if (img && img.src) thumbSrc = img.src;
                    
                    if (!itemsMap.has(cleanUrl)) {
                        itemsMap.set(cleanUrl, { url: cleanUrl, thumb: thumbSrc });
                    } else if (thumbSrc && !itemsMap.get(cleanUrl).thumb) {
                        itemsMap.get(cleanUrl).thumb = thumbSrc;
                    }
                }
            }
        });
    }
}

// Escanear el DOM cada 1.5 segundos para capturar nuevos elementos a medida que el usuario hace scroll
setInterval(extractUrlsFromDOM, 1500);

// Ejecutar inmediatamente una vez
extractUrlsFromDOM();

// Escuchar peticiones desde el popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'get_extracted_urls') {
        // Ejecutar una última vez antes de responder
        extractUrlsFromDOM();
        // Responder con todos los enlaces acumulados
        sendResponse(Array.from(itemsMap.values()));
    }
});
