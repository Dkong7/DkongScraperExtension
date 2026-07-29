// manga_downloader.js - Universal & Kumanga Scraper (CSP Safe, Reliable & Accurate)

function extractAllImages() {
    let collectedUrls = [];

    // 1. Verificar variables capturadas desde el MUNDO PRINCIPAL (MAIN WORLD) de Chrome
    try {
        const mainUrls = document.documentElement.dataset.mainWorldUrls;
        if (mainUrls) {
            const parsed = JSON.parse(mainUrls);
            if (Array.isArray(parsed)) collectedUrls.push(...parsed);
        }
    } catch(e){}

    // 2. Verificar variables globales accesibles directamente
    try {
        ['rpics', 'jaja', 'p', 'pages', 'images', 'chapter_pages', 'array_pages', 'pArray', 'lst_pages', 'paginas', 'fotos', 'urls', 'manga'].forEach(v => {
            if (window[v]) {
                if (Array.isArray(window[v])) {
                    collectedUrls.push(...window[v]);
                } else if (typeof window[v] === 'string' && window[v].length > 10) {
                    try {
                        const parsed = JSON.parse(window[v].replace(/\\\//g, '/'));
                        if (Array.isArray(parsed)) collectedUrls.push(...parsed);
                    } catch(e){}
                }
            }
        });
    } catch(e){}

    // 3. Verificar Vue / Alpine en elementos DOM
    try {
        const allEls = document.querySelectorAll('*');
        for (const el of allEls) {
            if (el.__vue__) {
                const v = el.__vue__;
                if (v.pages && Array.isArray(v.pages)) collectedUrls.push(...v.pages);
                if (v.images && Array.isArray(v.images)) collectedUrls.push(...v.images);
                if (v.chapter && v.chapter.pages) collectedUrls.push(...v.chapter.pages);
                if (v.rpics && Array.isArray(v.rpics)) collectedUrls.push(...v.rpics);
                if (v.p && Array.isArray(v.p)) collectedUrls.push(...v.p);
                if (v.urls && Array.isArray(v.urls)) collectedUrls.push(...v.urls);
                if (v.imageUrl) collectedUrls.push(v.imageUrl);
            }
        }
    } catch(e){}

    // 4. Verificar Select de páginas (Opciones que puedan contener enlaces reales)
    const selects = Array.from(document.querySelectorAll('select'));
    let maxSelectPages = 0;
    selects.forEach(select => {
        if (select.options && select.options.length > maxSelectPages) {
            maxSelectPages = select.options.length;
        }
        Array.from(select.options || []).forEach(opt => {
            const val = opt.getAttribute('data-url') || opt.getAttribute('data-src') || opt.getAttribute('data-img') || opt.value;
            if (val && (val.includes('http') || val.includes('/') || val.match(/\.(jpg|jpeg|png|webp|avif)/i))) {
                if (!val.includes('assets/') && !val.includes('logo') && !val.includes('banner') && val.length > 5) {
                    collectedUrls.push(val);
                }
            }
        });
    });

    // 5. Extraer de etiquetas <script> y limpiar barras invertidas (\/)
    const scripts = Array.from(document.querySelectorAll('script'));
    scripts.forEach(script => {
        let text = script.innerText || script.textContent || '';
        if (!text) return;

        // Desenmascarar slashes en cadenas JS o JSON ("\/" -> "/")
        text = text.replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\'/g, "'");

        // Buscar URLs absolutas terminadas en extensiones de imagen
        const urlMatches = text.match(/(?:https?:)?\/\/[^\s"'\<\>\{\}\(\)\[\]\\]+?\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^\s"'\<\>\{\}\(\)\[\]\\]*)?/gi);
        if (urlMatches) collectedUrls.push(...urlMatches);

        // Buscar rutas relativas típicas de manga / servidores
        const relMatches = text.match(/["'](\/(?:backend|uploads|manga|chapter|capitulo|img|pages|viewer|storage|content)[^"'\<\>\{\}\(\)\[\]]+?\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^"'\<\>\{\}\(\)\[\]]*)?)["']/gi);
        if (relMatches) {
            relMatches.forEach(m => collectedUrls.push(m.replace(/['"]/g, '').trim()));
        }

        // Buscar arrays JSON en texto plano (ej: p = ["...", "..."])
        try {
            const arrayMatches = text.match(/\[\s*(?:["'][^"']+?\.(?:jpg|jpeg|png|webp|avif)["']\s*,?\s*){2,}\]/gi);
            if (arrayMatches) {
                arrayMatches.forEach(arrStr => {
                    try {
                        const parsed = JSON.parse(arrStr.replace(/'/g, '"'));
                        if (Array.isArray(parsed)) collectedUrls.push(...parsed);
                    } catch(e){}
                });
            }
        } catch(e){}
    });

    // 6. Extraer elementos DOM img, source, canvas y fondos css de contenedores
    let domElements = Array.from(document.querySelectorAll('img, source, canvas, [style*="background"], div[data-src], div[data-url], section[data-src]'));
    domElements.forEach(el => {
        let possibleSrc = el.getAttribute('data-src') || 
                          el.getAttribute(':data-src') ||
                          el.getAttribute('data-lazy-src') || 
                          el.getAttribute('data-original') || 
                          el.getAttribute('data-image') || 
                          el.getAttribute('data-url') || 
                          el.getAttribute('data-echo') || 
                          el.getAttribute('data-cdn') || 
                          el.getAttribute('data-full') || 
                          el.getAttribute('data-path') || 
                          el.getAttribute('data-file') || 
                          el.getAttribute('data-bg') || 
                          el.getAttribute('data-img') || 
                          el.getAttribute('data-cfsrc') || 
                          el.src;

        if (!possibleSrc && el.style && el.style.backgroundImage) {
            const bgMatch = el.style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/i);
            if (bgMatch) possibleSrc = bgMatch[1];
        }

        if (possibleSrc) {
            collectedUrls.push(possibleSrc);
            if (el.tagName === 'IMG' && (!el.src || el.src.startsWith('data:'))) {
                try { el.src = possibleSrc; } catch(e){}
            }
        }
    });

    // 7. Resolver URLs relativas y limpiar strings
    let absoluteUrls = collectedUrls.map(src => {
        if (!src || typeof src !== 'string') return null;
        src = src.trim().replace(/\\/g, ''); // <- FIX: Remove all escaped backslashes to avoid malformed %5C URLs!
        if (src.startsWith('data:image')) return src;
        if (src.startsWith('//')) src = 'https:' + src;
        try { return new URL(src, window.location.href).href; } 
        catch (e) { return src; }
    }).filter(Boolean);

    // 8. Filtrado INTELIGENTE sin romper CDNs legítimos
    const ignoreKeywords = [
        'assets/', 'logo', 'banner', 'avatar', 'icon', 'facebook', 'twitter', 'discord', 'paypal', 
        'badge', 'favicon', 'advertisement', 'captcha', 'theme', 'assets/img', 'data:image/svg',
        'footer', 'header', 'loading.gif', 'spinner', 'placeholder', 'site-logo', 'image_loader', 'button'
    ];

    let filteredUrls = absoluteUrls.filter(src => {
        if (src.startsWith('data:image') && src.length < 1000) return false;
        const lower = src.toLowerCase();
        if (ignoreKeywords.some(kw => lower.includes(kw))) return false;
        
        // Mantener cualquier imagen con extensión O con estructura habitual de manga en el enlace
        return lower.match(/\.(jpg|jpeg|png|webp|avif|gif)($|\?)/) || 
               lower.includes('/manga/') || 
               lower.includes('/chapter/') || 
               lower.includes('/capitulo/') || 
               lower.includes('/backend/') || 
               lower.includes('/uploads/') ||
               lower.includes('/pages/') ||
               lower.includes('/viewer/') ||
               lower.includes('/storage/') ||
               lower.includes('kumanga') ||
               lower.includes('inmanga') ||
               lower.includes('tmo');
    });

    return [...new Set(filteredUrls)];
}

function runFullMangaExtraction() {
    const urls = extractAllImages();
    let titleText = document.title
        .replace(/Kumanga|Leer|Manga|Online|Capítulo|Capitulo|TMO|TuMangaOnline|Inmanga/gi, '')
        .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ]/g, '')
        .replace(/\s+/g, ' ')
        .trim() || "Manga_Capitulo";

    return { urls: urls, title: titleText };
}

// Escuchar petición de descarga de manga
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download_manga') {
        if (sendResponse) sendResponse({ status: 'started' });

        let toast = document.createElement('div');
        toast.innerText = `Iniciando escaneo del manga...`;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.background = '#d97736';
        toast.style.color = '#f4efe6';
        toast.style.padding = '15px 20px';
        toast.style.borderRadius = '8px';
        toast.style.zIndex = '999999';
        toast.style.fontWeight = 'bold';
        toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        document.body.appendChild(toast);

        // Forzar clic adicional en botones de cascada
        const cascadeBtn = document.querySelector('#cascada, .cascade-btn, a[href*="cascada"], button[id*="cascade"]');
        if (cascadeBtn) {
            try { cascadeBtn.click(); } catch(e){}
        }

        // Conjunto persistente de URLs acumuladas durante el scroll
        let persistentUrls = new Set();
        extractAllImages().forEach(u => persistentUrls.add(u));

        let totalHeight = document.body.scrollHeight;
        let distance = 600;
        let currentScroll = 0;
        let bottomAttempts = 0;
        
        let timer = setInterval(() => {
            window.scrollBy(0, distance);
            currentScroll += distance;
            totalHeight = document.body.scrollHeight;
            
            // Acumular imágenes descubiertas mientras se scrollea
            extractAllImages().forEach(u => persistentUrls.add(u));

            toast.innerText = `Escaneando imágenes (${persistentUrls.size} detectadas)...`;
            
            // Si hemos llegado al fondo
            if ((window.innerHeight + window.scrollY) >= totalHeight - 200 || currentScroll >= totalHeight + distance) {
                bottomAttempts++;
                // Dar 2 ciclos extra de espera para carga perezosa al fondo
                if (bottomAttempts >= 3) {
                    clearInterval(timer);
                    window.scrollTo(0, 0);
                    toast.innerText = `Extrayendo imágenes...`;
                    
                    setTimeout(() => {
                        // Última inspección tras regresar arriba
                        extractAllImages().forEach(u => persistentUrls.add(u));
                        
                        const finalUrls = Array.from(persistentUrls);
                        const result = runFullMangaExtraction();
                        if (finalUrls.length > result.urls.length) {
                            result.urls = finalUrls;
                        }
                        
                        if (result.urls.length === 0) {
                            toast.innerText = "Error: No se encontraron imágenes en esta página.";
                            setTimeout(() => toast.remove(), 4000);
                            return;
                        }

                        chrome.runtime.sendMessage({
                            action: 'process_manga_downloads',
                            urls: result.urls,
                            title: result.title
                        });

                        toast.innerText = `¡${result.urls.length} imágenes listas!`;
                        setTimeout(() => toast.remove(), 3000);
                    }, 600);
                }
            } else {
                bottomAttempts = 0;
            }
        }, 200);
    }
    return true;
});
