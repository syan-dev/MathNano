document.addEventListener('DOMContentLoaded', () => {
	// --- Start of original code ---

	let currentImageBlob = null;
	let currentImageDataUrl = null;
	let mediaRecorder = null;
	let audioChunks = [];

	// AI Model Session Globals
	let imageSession = null;
	let audioSession = null;
	let textSession = null;

	// Drawing Canvas Globals
	let drawingCanvas = null;
	let drawingCtx = null;
	let isDrawing = false;

	// --- **** NEW: Image Settings Global **** ---
	let imageSettings = {
		padding: 10,
		scale: 2.0, // <-- Change this value
		fontColor: '#000000',
		bgColor: '#FFFFFF',
		transparent: false
	};
	// --- **** END OF NEW BLOCK **** ---


	// --- NEW: Global Loading Overlay ---
	const globalLoadingOverlay = document.getElementById('global-loading-overlay');
	// --- **** NEW: Recording Overlay **** ---
	const recordingOverlay = document.getElementById('recording-overlay');

	function showLoadingOverlay() {
		globalLoadingOverlay.classList.remove('hidden');
	}

	function hideLoadingOverlay() {
		globalLoadingOverlay.classList.add('hidden');
	}
	// --- End of new helpers ---


	// **** MODIFIED BLOCK: Replaced KaTeX logic with MathJax logic ****

	// **** NEW: Get MathJax render element early for settings ****
	const mathjaxRender = document.getElementById('mathjax-render');

	/**
	 * Renders the LaTeX to MathJax SVG in the preview box as the user types.
	 * Does NOT generate the image.
	 */
	async function renderLivePreview() {
		const latex = latexInput.value.trim();
		// MODIFIED: Renamed element (already done)
		// const mathjaxRender = document.getElementById('mathjax-render'); // Moved up
		const emptyState = document.getElementById('empty-state');

		if (!latex) {
			resetPreview();
			showEmptyState();
			hideMessage();
			disableActionButtons();
			return;
		}

		// Show preview area and hide empty state
		emptyState.style.display = 'none';
		mathjaxRender.style.display = 'block';
		mathjaxRender.innerHTML = ''; // Clear previous render

		// --- NEW MathJax Rendering Logic ---

		// --- **** NEW: Apply font color setting to preview **** ---
		mathjaxRender.style.color = imageSettings.fontColor;
		mathjaxRender.style.transform = `scale(${imageSettings.scale})`; // <-- Add this line
		// --- **** END OF NEW BLOCK **** ---

		// Set the text content, wrapped in display math delimiters
		mathjaxRender.textContent = `$$${latex}$$`;

		try {
			// Check if MathJax is available
			if (typeof MathJax === 'undefined' || !MathJax.typesetPromise) {
				showMessage('MathJax is not loaded yet. Please wait.', 'error');
				return;
			}
			// Tell MathJax to typeset this specific element
			// We must wait for this to complete
			await MathJax.typesetPromise([mathjaxRender]);
		} catch (mjError) {
			// This catches errors in the MathJax library itself
			console.error("MathJax typesetting error:", mjError);
			showMessage(`MathJax error: ${mjError.message}`, 'error');
			disableActionButtons();
			return; // Exit if MathJax fails
		}
		// --- End of new logic ---

		// Check if MathJax rendered an error
		// MODIFIED: Changed error class from .katex-error to mjx-merror
		const hasError = mathjaxRender.querySelector('mjx-merror') !== null;

		if (hasError) {
			showMessage('Invalid LaTeX syntax. Preview shows details.', 'error');
			disableActionButtons(); // Cannot copy/download an error
		} else {
			hideMessage(); // Clear any previous errors
			enableActionButtons(); // Valid LaTeX, enable buttons
		}
	}

	/**
	 * Generates the image blob/dataURL from the ALREADY RENDERED SVG preview.
	 * This is now called on-demand by the action buttons.
	 * REMOVED: html2canvas. USES: SVG -> Canvas -> PNG
	 * @returns {Promise<boolean>} True on success, false on failure.
	 */
	async function autoRender() {
		// Clear previous image data
		currentImageBlob = null;
		currentImageDataUrl = null;
		disableActionButtons(); // Disable buttons during *image generation* process

		const latex = latexInput.value.trim();
		// MODIFIED: Renamed element (already done)
		// const mathjaxRender = document.getElementById('mathjax-render'); // Moved up

		if (!latex) {
			resetPreview();
			showEmptyState();
			return false; // Return failure (should be disabled anyway)
		}

		// --- NEW: Check if the live preview has an error ---
		// MODIFIED: Changed error class
		const hasError = mathjaxRender.querySelector('mjx-merror') !== null;
		if (hasError) {
			showMessage('Cannot copy/download: Invalid LaTeX.', 'error');
			disableActionButtons(); // Keep disabled
			return false; // Return failure
		}
		// --- End of new check ---

		// --- **** MODIFIED: SVG to PNG conversion logic (applies settings) **** ---
		try {
			const svgElement = mathjaxRender.querySelector('svg');
			if (!svgElement) {
				throw new Error('No SVG element found in preview. Typesetting might have failed.');
			}

			// --- **** NEW: Apply Settings **** ---
			const padding = imageSettings.padding;
			const scale = imageSettings.scale;
			// --- **** END OF NEW BLOCK **** ---

			// 1. Get SVG dimensions
			const svgWidth = svgElement.width.baseVal.value;
			const svgHeight = svgElement.height.baseVal.value;
			
			// 2. Serialize SVG
			// We must add xmlns attribute for standalone rendering if missing
			if (!svgElement.getAttribute('xmlns')) {
				svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
			}
			const svgXml = new XMLSerializer().serializeToString(svgElement);

			// 3. Create a data URL from the SVG
			// Use encodeURIComponent for special characters, then btoa
			const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgXml)));

			// 4. Use an Image object to load the SVG
			const img = new Image();

			// 5. Wrap image loading in a Promise to get the blob
			const pngBlob = await new Promise((resolve, reject) => {
				img.onload = () => {
					// 6. Create a temporary canvas
					const canvas = document.createElement('canvas');
					// **** MODIFIED: Apply scale and padding to canvas size ****
					canvas.width = (svgWidth * scale) + (padding * 2);
					canvas.height = (svgHeight * scale) + (padding * 2);
					const ctx = canvas.getContext('2d');

					// 7. Fill background (respecting settings)
					if (!imageSettings.transparent) {
						ctx.fillStyle = imageSettings.bgColor;
						ctx.fillRect(0, 0, canvas.width, canvas.height);
					}

					// 8. Draw the loaded SVG image onto the canvas (scaled)
					ctx.drawImage(img, padding, padding, svgWidth * scale, svgHeight * scale);
					// **** END OF MODIFICATION ****

					// 9. Get blob and data URL
					currentImageDataUrl = canvas.toDataURL('image/png');
					canvas.toBlob((b) => {
						if (b) {
							resolve(b); // Resolve the promise with the blob
						} else {
							reject(new Error('Failed to create PNG blob from canvas.'));
						}
					}, 'image/png');
				};
				img.onerror = (err) => {
					console.error("Image load error:", err);
					reject(new Error('Failed to load SVG into Image object.'));
				};
				img.src = svgDataUrl;
			});

			// 10. Store the blob
			currentImageBlob = pngBlob;

			// SUCCESS
			enableActionButtons();
			return true; // Return success

		} catch (error) {
			showMessage(`Error generating image: ${error.message}`, 'error');
			console.error('Image generation error:', error);
			enableActionButtons(); // Re-enable so they can try again
			return false; // Return failure
		}
		// --- END OF MODIFIED BLOCK ---
	}

	// **** END OF MODIFIED BLOCK ****


	// Update character and line count
	// We need to find latexInput *inside* the DOMContentLoaded listener
	const latexInput = document.getElementById('latex-input');

	// **** MODIFIED BLOCK: `input` listener now calls `renderLivePreview` ****
	// MODIFIED: Added async keyword
	latexInput.addEventListener('input', async () => {
		const text = latexInput.value;
		// const charCount = text.length;
		// const lineCount = text.split('\n').length;

		// document.getElementById('char-count').textContent = `${charCount} character${charCount !== 1 ? 's' : ''}`;
		// document.getElementById('line-count').textContent = `${lineCount} line${lineCount !== 1 ? 's' : ''}`;

		// --- MODIFIED: Call live preview on every input ---
		// MODIFIED: Added await
		await renderLivePreview();
		// --- End of modification ---
	});
	// **** END OF MODIFIED BLOCK ****


	/**
	   * Extracts and cleans a LaTeX string from various delimiters.
	   * @param {string} rawText The raw string input.
	   * @returns {string} The cleaned LaTeX code.
	   */
	function extractLatex(rawText) {
		if (!rawText) return '';
		let processedText = rawText.trim();

		// 1. Handle ```latex ... ```, ```tex ... ```, ```math ... ```, or ``` ... ```
		// This regex captures the content inside, ignoring the language identifier
		// and trimming whitespace/newlines immediately after the opening/before the closing.
		const codeBlockMatch = processedText.match(/^```(?:latex|tex|math)?\s*([\s\S]*?)\s*```$/);
		if (codeBlockMatch && codeBlockMatch[1]) {
			// We found a code block. Return the captured group, 
			// trimmed, and replace internal newlines with a space.
			return codeBlockMatch[1].trim().replace(/\n/g, ' ');
		}

		// 2. Handle $$...$$
		// This regex is more robust and trims internal whitespace.
		const displayMathMatch = processedText.match(/^\$\$\s*([\s\S]*?)\s*\$\$$/);
		if (displayMathMatch && displayMathMatch[1]) {
			// Also replace internal newlines with a space for multi-line equations.
			return displayMathMatch[1].trim().replace(/\n/g, ' ');
		}

		// 3. Handle $...$
		// This regex is also more robust.
		const inlineMathMatch = processedText.match(/^\$\s*([^$]*?)\s*\$$/);
		if (inlineMathMatch && inlineMathMatch[1]) {
			return inlineMathMatch[1].trim();
		}

		// If no delimiters are found, return the original text.
		// This handles cases where the AI *only* returns the LaTeX code.
		return processedText;
	}

	// --- REWRITTEN: Helper function to insert LaTeX at the cursor ---
	function insertLatex(text) {
		console.log("Before extraction: `" + text + "`");
		text = extractLatex(text);
		console.log("After extraction: `" + text + "`");
		if (!text) {
			showMessage('AI returned empty content.', 'error');
			return;
		}
		const input = document.getElementById('latex-input');
		const start = input.selectionStart;
		const end = input.selectionEnd;
		const originalText = input.value;

		// Insert the extracted text, replacing any selected text
		input.value = originalText.substring(0, start) + text + originalText.substring(end);

		// Move cursor to after the inserted text
		const newCursorPos = start + text.length;
		input.selectionStart = newCursorPos;
		input.selectionEnd = newCursorPos;

		// Dispatch input event to update counts and button states
		input.dispatchEvent(new Event('input'));
		showMessage('LaTeX inserted at cursor!', 'success');
		input.focus(); // Focus the textarea after insertion
	}

	/**
	 * AI Model Initialization Function
	 * @param {'image' | 'audio'} type The type of input the model will expect.
	 * @returns {Promise<LanguageModelSession | null>} The created session or null.
	 */
	async function initializeModelSession(type) {
		if (typeof LanguageModel === 'undefined') {
			showMessage('Error: Built-in AI API (LanguageModel) not found. Please enable experimental flags.', 'error');
			return null;
		}
		const availability = await LanguageModel.availability({ expectedInputs: [{ type: type }] });
		if (availability !== 'available') {
			showMessage(`AI Model for '${type}' is not available. Status: ${availability}`, 'error');
			console.error(`Model not available: ${availability}`);
			return null;
		}
		try {
			const session = await LanguageModel.create({ expectedInputs: [{ type: type }] });
			showMessage(`${type} AI session initialized!`, 'success');
			return session;
		} catch (error) {
			showMessage(`Failed to create AI session: ${error.message}`, 'error');
			console.error('Session creation error:', error);
			return null;
		}
	}

	// --- Drawing Modal Logic ---
	const modal = document.getElementById('drawing-modal');
	const overlay = document.getElementById('drawing-modal-overlay');

	function showDrawingModal() {
		modal.classList.remove('hidden');
		overlay.classList.remove('hidden');
		if (!drawingCanvas) {
			drawingCanvas = document.getElementById('drawing-canvas');
			drawingCtx = drawingCanvas.getContext('2d');
			drawingCtx.strokeStyle = '#000000';
			drawingCtx.lineWidth = 3;
			drawingCtx.lineCap = 'round';
			drawingCtx.lineJoin = 'round';
			drawingCtx.fillStyle = '#FFFFFF';
			drawingCtx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
			drawingCanvas.addEventListener('mousedown', startDrawing);
			drawingCanvas.addEventListener('mousemove', draw);
			drawingCanvas.addEventListener('mouseup', stopDrawing);
			drawingCanvas.addEventListener('mouseleave', stopDrawing);
			drawingCanvas.addEventListener('touchstart', startDrawing);
			drawingCanvas.addEventListener('touchmove', draw);
			drawingCanvas.addEventListener('touchend', stopDrawing);
		}
	}
	function hideDrawingModal() {
		modal.classList.add('hidden');
		overlay.classList.add('hidden');
	}
	function getMousePos(e) {
		const rect = drawingCanvas.getBoundingClientRect();
		let clientX = e.clientX;
		let clientY = e.clientY;
		if (e.touches && e.touches.length > 0) {
			clientX = e.touches[0].clientX;
			clientY = e.touches[0].clientY;
		}
		return { x: clientX - rect.left, y: clientY - rect.top };
	}
	function startDrawing(e) {
		e.preventDefault();
		isDrawing = true;
		const { x, y } = getMousePos(e);
		drawingCtx.beginPath();
		drawingCtx.moveTo(x, y);
	}
	function draw(e) {
		e.preventDefault();
		if (!isDrawing) return;
		const { x, y } = getMousePos(e);
		drawingCtx.lineTo(x, y);
		drawingCtx.stroke();
	}
	function stopDrawing() {
		if (!isDrawing) return;
		drawingCtx.closePath();
		isDrawing = false;
	}
	function clearDrawing() {
		drawingCtx.fillStyle = '#FFFFFF';
		drawingCtx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
	}
	document.getElementById('draw-btn').addEventListener('click', showDrawingModal);
	document.getElementById('close-modal-btn').addEventListener('click', hideDrawingModal);
	document.getElementById('clear-drawing-btn').addEventListener('click', clearDrawing);


	// --- **** NEW: Shared Image Processing Function **** ---
    /**
     * Processes an image canvas. Shared logic for drawing, pasting, and cropping.
     * @param {HTMLCanvasElement} canvas The canvas element containing the image.
     * @param {string} prompt The text prompt for the AI.
     */
    async function processImageFromCanvas(canvas, prompt) {
        showLoadingOverlay();
        disableActionButtons();

		// Disable all input buttons
		document.getElementById('draw-btn').disabled = true;
		document.getElementById('crop-btn').disabled = true;
		document.getElementById('record-audio-btn').disabled = true;
		document.getElementById('intelligent-ask-btn').disabled = true;

        try {
            if (!imageSession) imageSession = await initializeModelSession('image');
            if (!imageSession) {
                throw new Error('Image AI session could not be initialized.');
            }

            const result = await imageSession.prompt([
                {
                    role: "user", content: [
                        { type: "text", value: prompt },
                        { type: "image", value: canvas }
                    ]
                }
            ]);
            
            console.log('Image AI Result: `' + result + '`');
            insertLatex(result); // Use existing helper

        } catch (error) {
            console.error('Image processing error:', error);
            showMessage(`Image processing failed: ${error.message}`, 'error');
            if (imageSession) {
                imageSession.destroy();
                imageSession = null;
            }
        } finally {
            hideLoadingOverlay();
            latexInput.dispatchEvent(new Event('input')); // Update preview
            // Re-enable all input buttons
			document.getElementById('draw-btn').disabled = false;
			document.getElementById('crop-btn').disabled = false;
			document.getElementById('record-audio-btn').disabled = false;
			document.getElementById('intelligent-ask-btn').disabled = false;
        }
    }
	
	// --- MODIFIED: Process Drawing Button ---
	document.getElementById('process-drawing-btn').addEventListener('click', async () => {
		hideDrawingModal();
		// Use the new shared function
		await processImageFromCanvas(
			drawingCanvas,
			'Analyze the provided drawing and extract the mathematical equation as a LaTeX string. Only output the LaTeX code.'
		);
		clearDrawing(); // Clear canvas after processing
	});


	// --- **** NEW: Crop from Screen Logic **** ---
	
    /**
     * Handles the 'Crop' button click.
     * It sends a message to the content script to start the selection process.
     */
	async function startCropSelection() {
        try {
            // Find the current active tab
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab && activeTab.id) {
                // Send a message to the content script in that tab
                const response = await chrome.tabs.sendMessage(activeTab.id, { action: "startCrop" });
				if (response && response.status === "cropping_started") {
                	console.log(response.status); // Should log "cropping_started"
				} else {
					throw new Error("Could not connect to content script.");
				}
            } else {
                showMessage('Could not find active tab.', 'error');
            }
        } catch (error) {
            console.error('Error starting crop:', error);
            showMessage('Failed to start crop. Try reloading the page.', 'error');
        }
    }

    // Add listener to the new crop button
	document.getElementById('crop-btn').addEventListener('click', startCropSelection);


    /**
     * NEW: Global listener for messages from content scripts.
     * This is how the side panel receives the crop coordinates.
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "cropComplete") {
            const { x, y, width, height, dpr } = request.cropData;

			// Check for valid crop dimensions
			if (width <= 0 || height <= 0) {
				console.log("Crop cancelled or invalid dimensions.");
				return; // Do nothing if crop was invalid
			}

            // Use the activeTab permission to capture the screen
            chrome.tabs.captureVisibleTab(null, { format: "png" }, (fullImageDataUrl) => {
                if (chrome.runtime.lastError) {
                    showMessage(`Error capturing tab: ${chrome.runtime.lastError.message}`, 'error');
                    return;
                }
				if (!fullImageDataUrl) {
					showMessage('Error: Failed to capture tab image.', 'error');
					return;
				}

                const img = new Image();
                img.onload = () => {
                    // Create a canvas to draw the cropped image
                    const canvas = document.createElement('canvas');
                    
                    // Adjust dimensions for device pixel ratio (e.g., Retina screens)
                    const finalWidth = width * dpr;
                    const finalHeight = height * dpr;
                    const finalX = x * dpr;
                    const finalY = y * dpr;

                    canvas.width = finalWidth;
                    canvas.height = finalHeight;
                    const ctx = canvas.getContext('2d');

                    // Draw the cropped portion from the full screenshot
                    ctx.drawImage(
                        img,
                        finalX, finalY,       // Source X, Y (from top-left of full screenshot)
                        finalWidth, finalHeight, // Source Width, Height
                        0, 0,                  // Destination X, Y (on our new canvas)
                        finalWidth, finalHeight  // Destination Width, Height
                    );

                    // Now send this canvas to the AI
                    processImageFromCanvas(
                        canvas, 
                        'Analyze the provided screenshot image and extract the mathematical equation as a LaTeX string. Only output the LaTeX code.'
                    );
                };
				img.onerror = () => {
					showMessage('Error: Failed to load captured image.', 'error');
				};
                img.src = fullImageDataUrl;
            });
        }
    });

	// --- **** END OF NEW BLOCK **** ---


	// --- **** MODIFIED: Audio Input Processing **** ---
	const recordBtn = document.getElementById('record-audio-btn');
	const stopBtn = document.getElementById('stop-record-btn');

	recordBtn.addEventListener('click', async () => {
		try {
			if (!audioSession) audioSession = await initializeModelSession('audio');
			if (!audioSession) return; // Initialization failed

			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorder = new MediaRecorder(stream);
			audioChunks = [];
			mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);

			// --- MODIFIED: mediaRecorder.onstop ---
			mediaRecorder.onstop = async () => {
				recordingOverlay.classList.add('hidden'); // Hide recording overlay
				showLoadingOverlay(); // Show processing overlay
				disableActionButtons(); // Disable copy/download buttons
				try {
					const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
					console.log('Starting audio transcription...');
					const response = await audioSession.prompt([
						{
							role: "user", content: [
								{ type: "text", value: "Transcribe the spoken mathematical equation into a LaTeX string. Only output the LaTeX code. No \boxed{}" },
								{ type: "audio", value: audioBlob }
							]
						}
					]);
					console.log('Transcription Result: `' + response + '`');
					insertLatex(response); // Uses new function
				} catch (error) {
					console.error('Audio processing error:', error);
					showMessage(`Audio processing failed: ${error.message}`, 'error');
					if (audioSession) audioSession.destroy();
					audioSession = null;
				} finally {
					hideLoadingOverlay(); // Hide processing overlay
					// Re-enable input buttons
                    document.getElementById('draw-btn').disabled = false;
                    document.getElementById('crop-btn').disabled = false; // **** ADDED ****
                    document.getElementById('record-audio-btn').disabled = false;
                    document.getElementById('intelligent-ask-btn').disabled = false;
					latexInput.dispatchEvent(new Event('input'));
				}
			};

			mediaRecorder.start();
			// --- NEW: Disable input buttons and show recording overlay ---
            document.getElementById('draw-btn').disabled = true;
            document.getElementById('crop-btn').disabled = true; // **** ADDED ****
            document.getElementById('record-audio-btn').disabled = true;
            document.getElementById('intelligent-ask-btn').disabled = true;
            recordingOverlay.classList.remove('hidden');
			showMessage('Recording audio...', 'info');
            // --- END OF NEW BLOCK ---

		} catch (error) {
			console.error('Error starting recording:', error);
			showMessage('Could not start recording: ' + error.message, 'error');
			// --- NEW: Ensure buttons are re-enabled if getUserMedia fails ---
            document.getElementById('draw-btn').disabled = false;
            document.getElementById('crop-btn').disabled = false; // **** ADDED ****
            document.getElementById('record-audio-btn').disabled = false;
            document.getElementById('intelligent-ask-btn').disabled = false;
		}
	});

	stopBtn.addEventListener('click', () => {
		// --- MODIFIED: Only stop the recorder ---
		if (mediaRecorder && mediaRecorder.state === 'recording') {
			mediaRecorder.stop();
		}
        // All UI changes are now handled by the 'onstop' event listener
        // --- END OF MODIFICATION ---
	});
	// --- **** END OF MODIFIED BLOCK **** ---


	// --- **** NEW: Intelligent Ask Logic **** ---

	// Get DOM elements for the new modal
	const intelligentAskBtn = document.getElementById('intelligent-ask-btn');
	const intelligentAskModal = document.getElementById('intelligent-ask-modal');
	const intelligentAskOverlay = document.getElementById('intelligent-ask-overlay');
	const intelligentAskInput = document.getElementById('intelligent-ask-input');
	const intelligentAskSubmitBtn = document.getElementById('intelligent-ask-submit-btn');
	const intelligentAskCloseBtn = document.getElementById('intelligent-ask-close-btn');

	// Modal helper functions
	function showIntelligentAskModal() {
		intelligentAskModal.classList.remove('hidden');
		intelligentAskOverlay.classList.remove('hidden');
		intelligentAskInput.focus(); // Auto-focus the input
	}
	function hideIntelligentAskModal() {
		intelligentAskModal.classList.add('hidden');
		intelligentAskOverlay.classList.add('hidden');
		intelligentAskInput.value = ''; // Clear input on close
	}

	// Event listeners for the new modal
	intelligentAskBtn.addEventListener('click', showIntelligentAskModal);
	intelligentAskCloseBtn.addEventListener('click', hideIntelligentAskModal);
	intelligentAskOverlay.addEventListener('click', hideIntelligentAskModal);
	intelligentAskSubmitBtn.addEventListener('click', processIntelligentAsk);

	// Allow submitting with "Enter" key
	intelligentAskInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault(); // Prevent newline in textarea
			processIntelligentAsk();
		}
	});

	/**
	 * Processes the natural language query from the "Intelligent Ask" modal.
	 */
	async function processIntelligentAsk() {
		const promptText = intelligentAskInput.value.trim();
		if (!promptText) {
			hideIntelligentAskModal();
			return; // Do nothing if input is empty
		}

		hideIntelligentAskModal();
		showLoadingOverlay();
		disableActionButtons();

		try {
			// Initialize the text-only session if it doesn't exist
			if (!textSession) {
				if (typeof LanguageModel === 'undefined') {
					throw new Error('Built-in AI API (LanguageModel) not found.');
				}
				// Check for default text model availability
				const availability = await LanguageModel.availability();
				if (availability !== 'available') {
					throw new Error(`AI Model is not available. Status: ${availability}`);
				}

				// Create the session with a specific system prompt
				textSession = await LanguageModel.create({
					initialPrompts: [
						{ role: 'system', content: 'You are a mathematical assistant. The user will ask for a formula or equation in natural language. You must respond with ONLY the raw LaTeX code for that equation. Do not include any other text, explanations, or delimiters like $$, ```latex, or ```.' }
					]
				});
				showMessage('Text AI session initialized!', 'success');
			}

			// Send the user's prompt to the AI
			const response = await textSession.prompt(promptText);
			console.log('Intelligent Ask Result: `' + response + '`');
			insertLatex(response); // Insert the result into the main textarea

		} catch (error) {
			console.error('Intelligent Ask error:', error);
			showMessage(`Failed to get formula: ${error.message}`, 'error');
			// Destroy session on error so it can be re-created
			if (textSession) textSession.destroy();
			textSession = null;
		} finally {
			hideLoadingOverlay();
			latexInput.dispatchEvent(new Event('input')); // Trigger UI update (buttons, preview)
		}
	}

	// --- **** END OF NEW BLOCK **** ---


	// --- **** NEW: Settings Modal Logic **** ---
	
	// Get DOM elements
	const settingsModal = document.getElementById('settings-modal');
	const settingsOverlay = document.getElementById('settings-modal-overlay');
	const settingsBtn = document.getElementById('settings-btn');
	const settingsSaveBtn = document.getElementById('settings-save-btn');
	const settingsCloseBtn = document.getElementById('settings-close-btn');

	const settingPadding = document.getElementById('setting-padding');
	const settingScale = document.getElementById('setting-scale');
	const settingFontColor = document.getElementById('setting-font-color');
	const settingBgColor = document.getElementById('setting-bg-color');
	const settingTransparentBg = document.getElementById('setting-transparent-bg');

	// Helper to toggle background input
	function toggleBgInput() {
		settingBgColor.disabled = settingTransparentBg.checked;
	}

	// Show modal
	function showSettingsModal() {
		// Populate modal with current settings
		settingPadding.value = imageSettings.padding;
		settingScale.value = imageSettings.scale;
		settingFontColor.value = imageSettings.fontColor;
		settingBgColor.value = imageSettings.bgColor;
		settingTransparentBg.checked = imageSettings.transparent;

		toggleBgInput(); // Set initial state of bg color input
		settingsModal.classList.remove('hidden');
		settingsOverlay.classList.remove('hidden');
	}

	// Hide modal
	function hideSettingsModal() {
		settingsModal.classList.add('hidden');
		settingsOverlay.classList.add('hidden');
	}

	// Save settings
	async function saveSettings() {
		// Read values, validate, and save
		imageSettings.padding = parseInt(settingPadding.value, 10) || 0;
		imageSettings.scale = parseFloat(settingScale.value) || 1.0;
		imageSettings.fontColor = settingFontColor.value;
		imageSettings.bgColor = settingBgColor.value;
		imageSettings.transparent = settingTransparentBg.checked;

		// Persist to chrome storage
		if (chrome.storage && chrome.storage.local) {
			chrome.storage.local.set({ imageSettings: imageSettings }, () => {
				console.log('Image settings saved.');
			});
		}

		hideSettingsModal();
		showMessage('Settings saved!', 'success');

		// Re-render the live preview with new settings
		await renderLivePreview();
	}

	// Load settings from storage
	function loadSettings() {
		if (chrome.storage && chrome.storage.local) {
			chrome.storage.local.get(['imageSettings'], (result) => {
				if (result.imageSettings) {
					// Merge loaded settings with defaults to ensure new settings are applied
					imageSettings = { ...imageSettings, ...result.imageSettings };
					console.log('Image settings loaded:', imageSettings);
				}
				// Apply initial loaded settings to the preview area
				mathjaxRender.style.color = imageSettings.fontColor;
				mathjaxRender.style.transform = `scale(${imageSettings.scale})`; // <-- Add this line
				// Re-render if there's text
				if (latexInput.value.trim()) {
					renderLivePreview();
				}
			});
		} else {
			// Fallback for non-extension environment
			mathjaxRender.style.color = imageSettings.fontColor;
		}
	}

	// Event Listeners
	settingsBtn.addEventListener('click', showSettingsModal);
	settingsCloseBtn.addEventListener('click', hideSettingsModal);
	settingsOverlay.addEventListener('click', hideSettingsModal);
	settingsSaveBtn.addEventListener('click', saveSettings);
	settingTransparentBg.addEventListener('change', toggleBgInput);

	// --- **** END OF NEW BLOCK **** ---


	// --- Action Buttons (Copy, Download, Clear) ---

	document.getElementById('copy-btn').addEventListener('click', async () => {
		showMessage('Rendering and copying...', 'info');

		// 1. Render the image
		const success = await autoRender();

		// 2. Check if render was successful and blob exists
		if (!success || !currentImageBlob) {
			showMessage('Failed to copy. Check LaTeX for errors.', 'error');
			if (latexInput.value.trim().length > 0) {
				// Re-enable if the *LaTeX is valid*, even if image gen failed
				// MODIFIED: Renamed element and error class
				// const mathjaxRender = document.getElementById('mathjax-render'); // Moved up
				if (mathjaxRender.querySelector('mjx-merror') === null) {
					enableActionButtons();
				}
			}
			return;
		}

		// 3. Proceed with copy
		try {
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': currentImageBlob })
			]);
			showMessage('Image copied to clipboard!', 'success');
		} catch (error) {
			showMessage('Failed to copy image: ' + error.message, 'error');
		}
		enableActionButtons(); // Re-enable after operation
	});

	document.getElementById('download-btn').addEventListener('click', async () => {
		showMessage('Rendering and downloading...', 'info');

		// 1. Render the image
		const success = await autoRender();

		// 2. Check if render was successful and data URL exists
		if (!success || !currentImageDataUrl) {
			showMessage('Failed to download. Check LaTeX for errors.', 'error');
			if (latexInput.value.trim().length > 0) {
				// Re-enable if the *LaTeX is valid*, even if image gen failed
				// MODIFIED: Renamed element and error class
				// const mathjaxRender = document.getElementById('mathjax-render'); // Moved up
				if (mathjaxRender.querySelector('mjx-merror') === null) {
					enableActionButtons();
				}
			}
			return;
		}

		// 3. Proceed with download
		const filename = 'latex-equation-' + Date.now() + '.png';
		const a = document.createElement('a');
		a.href = currentImageDataUrl;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);

		showMessage('Image downloaded!', 'success');
		enableActionButtons(); // Re-enable after operation
	});

	document.getElementById('clear-btn').addEventListener('click', () => {
		latexInput.value = '';
		// Dispatch input event to reset UI (counts, buttons, preview)
		latexInput.dispatchEvent(new Event('input'));
		hideMessage();

		// Destroy sessions to free resources
		if (imageSession) {
			imageSession.destroy();
			imageSession = null;
			console.log('Image session destroyed.');
		}
		if (audioSession) {
			audioSession.destroy();
			audioSession = null;
			console.log('Audio session destroyed.');
		}
		// --- **** NEW: Destroy text session **** ---
		if (textSession) {
			textSession.destroy();
			textSession = null;
			console.log('Text session destroyed.');
		}
		// --- **** END OF NEW BLOCK **** ---
	});

	// --- Helper Functions ---
	function showMessage(text, type) {
		const message = document.getElementById('message');
		message.textContent = text;
		message.className = `mt-3 p-3 rounded-lg text-sm font-medium`;
		if (type === 'success') {
			message.className += ' bg-green-50 text-green-800 border border-green-200';
		} else if (type === 'error') {
			message.className += ' bg-red-50 text-red-800 border border-red-200';
		} else {
			message.className += ' bg-blue-50 text-blue-800 border border-blue-200';
		}
		message.classList.remove('hidden');
	}

	function hideMessage() {
		const message = document.getElementById('message');
		message.classList.add('hidden');
	}

	function showEmptyState() {
		const emptyState = document.getElementById('empty-state');
		emptyState.style.display = 'block';
	}

	function hideEmptyState() {
		const emptyState = document.getElementById('empty-state');
		emptyState.style.display = 'none';
	}

	function resetPreview() {
		// MODIFIED: Renamed element
		// const mathjaxRender = document.getElementById('mathjax-render'); // Moved up
		mathjaxRender.innerHTML = '';
		mathjaxRender.style.display = 'block';

		currentImageBlob = null;
		currentImageDataUrl = null;
	}

	function enableActionButtons() {
		document.getElementById('copy-btn').disabled = false;
		document.getElementById('download-btn').disabled = false;
	}

	function disableActionButtons() {
		document.getElementById('copy-btn').disabled = true;
		document.getElementById('download-btn').disabled = true;
	}

	// Initialize
	// --- **** NEW: Load settings on start **** ---
	loadSettings();
	// --- **** END OF NEW BLOCK **** ---

	// Trigger input event on load to set the initial empty state
	latexInput.dispatchEvent(new Event('input'));

	// --- End of original code ---
});