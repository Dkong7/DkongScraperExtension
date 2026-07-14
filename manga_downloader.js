// manga_downloader.js

function extractAllImages() {
    let imgContainer = document.getElementById('PageContainer') || document.body;
    let imgs = Array.from(imgContainer.querySelectorAll('img'));
    
    // Grab possible sources from common lazy-load attributes
    let urls = imgs.map(img => {
        return img.getAttribute('data-src') || 
               img.getAttribute('data-lazy-src') || 
               img.getAttribute('data-original') || 
               img.getAttribute('data-image') || 
               img.src;
    }).filter(src => {
        if (!src) return false;
        // Ignore inline base64 if it's purely generic tiny data 
        if (src.startsWith('data:image') && src.length < 1000) return false; 
        return true;
    });

    // Resolve relative URLs to absolute
    let absoluteUrls = urls.map(src => {
        try { return new URL(src, window.location.href).href; } 
        catch (e) { return src; }
    });
    
    // Remove duplicates
    return [...new Set(absoluteUrls)];
}

// Escuchar peticiones del background o popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download_manga') {
        
        let toast = document.createElement('div');
        toast.innerText = `Forzando carga de imágenes...`;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.background = '#d97736';
        toast.style.color = '#f4efe6';
        toast.style.padding = '15px 20px';
        toast.style.borderRadius = '8px';
        toast.style.zIndex = '999999';
        toast.style.fontWeight = 'bold';
        document.body.appendChild(toast);

        // Auto-scroll para forzar el lazy-loader
        let totalHeight = document.body.scrollHeight;
        let distance = 800;
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
                    const urls = extractAllImages();
                    
                    if (urls.length === 0) {
                        toast.innerText = "Error: No se encontraron imágenes.";
                        setTimeout(() => toast.remove(), 4000);
                        return;
                    }

                    // Get title from document
                    let titleText = document.title.replace(/[^a-zA-Z0-9 ]/g, "").trim() || "Galeria";
                    
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
        }, 300); // Moverse cada 300ms para hacer scroll rápido
    }
});
