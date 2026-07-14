// manga_downloader.js

function extractInmangaImages() {
    // Inmanga uses a select box for pages, or dynamically loads them.
    // Usually, images are inside a container with id 'PageContainer' or similar.
    let imgContainer = document.getElementById('PageContainer') || document.body;
    let imgs = Array.from(imgContainer.querySelectorAll('img.ImageContainer, img.manga-page, img'));
    
    // Filter out UI images, keep only those that look like manga pages
    let mangaImgs = imgs.filter(img => {
        let src = img.getAttribute('data-src') || img.src;
        return src && (src.includes('/manga/') || src.includes('page'));
    });

    // Fallback: If no images found, maybe they are in a JS array or we need to scroll.
    // We will just grab all large images on the page.
    if (mangaImgs.length === 0) {
        mangaImgs = Array.from(document.querySelectorAll('img')).filter(img => {
            return img.width > 300 && img.height > 400; // Typical manga page size
        });
    }

    let urls = mangaImgs.map(img => {
        let src = img.getAttribute('data-src') || img.src;
        try {
            return new URL(src, window.location.href).href;
        } catch (e) {
            return src;
        }
    });
    
    // Remove duplicates
    urls = [...new Set(urls)];

    return urls;
}

// Escuchar peticiones del background o popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download_manga') {
        
        let toast = document.createElement('div');
        toast.innerText = `Forzando carga de imágenes...`;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.background = '#fbbc05';
        toast.style.color = '#1e1e1e';
        toast.style.padding = '15px 20px';
        toast.style.borderRadius = '8px';
        toast.style.zIndex = '999999';
        toast.style.fontWeight = 'bold';
        document.body.appendChild(toast);

        // Auto-scroll para forzar el lazy-loader de Inmanga
        let totalHeight = document.body.scrollHeight;
        let distance = 600;
        let currentScroll = 0;
        
        let timer = setInterval(() => {
            window.scrollBy(0, distance);
            currentScroll += distance;
            
            // Re-evaluar totalHeight por si el DOM se expande al cargar
            totalHeight = document.body.scrollHeight;
            
            if (currentScroll >= totalHeight + distance) {
                clearInterval(timer);
                window.scrollTo(0, 0); // Regresar arriba
                toast.innerText = `Extrayendo imágenes...`;
                
                setTimeout(() => {
                    const urls = extractInmangaImages();
                    
                    if (urls.length === 0) {
                        toast.innerText = "Error: No se encontraron imágenes.";
                        setTimeout(() => toast.remove(), 4000);
                        return;
                    }

                    // Get title from document
                    let titleText = document.title.replace(/[^a-zA-Z0-9 ]/g, "").trim() || "Manga";
                    
                    // Send to background
                    chrome.runtime.sendMessage({
                        action: 'process_manga_downloads',
                        urls: urls,
                        title: titleText
                    });
                    
                    toast.innerText = `¡${urls.length} imágenes listas!`;
                    setTimeout(() => toast.remove(), 3000);
                }, 2000); // Dar 2 seg de gracia
            }
        }, 1000); // Moverse cada 1 segundo para asegurar carga
    }
});
