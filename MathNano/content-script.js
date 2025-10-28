// This script runs on the web page, not in the side panel.
// It remains dormant until it receives a message from the side panel.

(() => {
    let selectionBox = null;
    let overlay = null;
    let startX, startY;
    let isSelecting = false;

    function createOverlayElements() {
        // Check if elements already exist
        if (document.getElementById('mathnano-crop-overlay')) {
            overlay = document.getElementById('mathnano-crop-overlay');
            selectionBox = document.getElementById('mathnano-selection-box');
            return;
        }
        
        overlay = document.createElement('div');
        overlay.id = 'mathnano-crop-overlay';
        document.body.appendChild(overlay);

        selectionBox = document.createElement('div');
        selectionBox.id = 'mathnano-selection-box';
        overlay.appendChild(selectionBox);

        overlay.addEventListener('mousedown', startSelection);
        overlay.addEventListener('mousemove', updateSelection);
        overlay.addEventListener('mouseup', endSelection);
        // NEW: Add a keydown listener to cancel with Escape key
        document.addEventListener('keydown', cancelOnEscape, true);
    }
    
    function cancelOnEscape(e) {
        if (e.key === 'Escape') {
            hideOverlay(true); // Pass true to indicate cancellation
        }
    }

    function showOverlay() {
        if (!overlay) {
            createOverlayElements();
        }
        overlay.style.display = 'block';
        document.body.style.cursor = 'crosshair';
        isSelecting = false;
    }

    function hideOverlay(wasCancelled = false) {
        if (overlay) {
            overlay.style.display = 'none';
        }
        if (selectionBox) {
            selectionBox.style.display = 'none';
        }
        document.body.style.cursor = 'default';
        isSelecting = false;
        
        // Remove the listener to avoid conflicts
        document.removeEventListener('keydown', cancelOnEscape, true);
        
        // If cancelled, send back empty coordinates
        if (wasCancelled) {
             chrome.runtime.sendMessage({
                action: "cropComplete",
                cropData: { x: 0, y: 0, width: 0, height: 0, dpr: window.devicePixelRatio }
            });
        }
    }

    function startSelection(e) {
        e.preventDefault();
        e.stopPropagation();
        
        isSelecting = true;
        startX = e.clientX;
        startY = e.clientY;
        
        selectionBox.style.left = `${startX}px`;
        selectionBox.style.top = `${startY}px`;
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        selectionBox.style.display = 'block';
    }

    function updateSelection(e) {
        if (!isSelecting) return;
        
        e.preventDefault();
        e.stopPropagation();

        const currentX = e.clientX;
        const currentY = e.clientY;

        let width = currentX - startX;
        let height = currentY - startY;
        let left = startX;
        let top = startY;

        if (width < 0) {
            width = -width;
            left = currentX;
        }
        if (height < 0) {
            height = -height;
            top = currentY;
        }

        selectionBox.style.left = `${left}px`;
        selectionBox.style.top = `${top}px`;
        selectionBox.style.width = `${width}px`;
        selectionBox.style.height = `${height}px`;
    }

    function endSelection(e) {
        if (!isSelecting) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        isSelecting = false;
        hideOverlay(); // Pass false or nothing (default)

        const rect = {
            x: parseInt(selectionBox.style.left, 10),
            y: parseInt(selectionBox.style.top, 10),
            width: parseInt(selectionBox.style.width, 10),
            height: parseInt(selectionBox.style.height, 10)
        };

        // Only send if the selection is a reasonable size
        if (rect.width > 10 && rect.height > 10) {
            // Send coordinates and device pixel ratio for high-DPI screens
            chrome.runtime.sendMessage({
                action: "cropComplete",
                cropData: { ...rect, dpr: window.devicePixelRatio }
            });
        } else {
             // Send empty coordinates if selection is too small
             chrome.runtime.sendMessage({
                action: "cropComplete",
                cropData: { x: 0, y: 0, width: 0, height: 0, dpr: window.devicePixelRatio }
            });
        }
    }

    // Listen for the message from the side panel to start cropping
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "startCrop") {
            showOverlay();
            sendResponse({ status: "cropping_started" });
            // Add escape listener ONLY when cropping starts
            document.addEventListener('keydown', cancelOnEscape, true);
        }
        // Ensure we return true for async sendResponse if needed, though not here.
        return false;
    });
})();