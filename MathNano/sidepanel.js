// sidepanel.js (Updated)

document.addEventListener('DOMContentLoaded', () => {
	// --- Start of original code ---

	// --- **** NEW: Model Status UI Elements **** ---
	const statusIndicator = document.getElementById('model-status-indicator');
	const statusText = document.getElementById('model-status-text');

	// --- **** NEW: Input Buttons **** ---
	// Get all input buttons to disable/enable them globally
	const drawBtn = document.getElementById('draw-btn');
	const cropBtn = document.getElementById('crop-btn');
	const recordAudioBtn = document.getElementById('record-audio-btn');
	const intelligentAskBtn = document.getElementById('intelligent-ask-btn');
	const allInputButtons = [drawBtn, cropBtn, recordAudioBtn, intelligentAskBtn];

	// --- **** NEW: Global Model Availability Flag **** ---
	let isModelGloballyAvailable = false; // Assume false until checked

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

	// --- Image Settings Global ---
	let imageSettings = {
		padding: 10,
		scale: 2.0,
		fontColor: '#000000',
		bgColor: '#FFFFFF',
		transparent: false
	};

	// --- Global Loading Overlay ---
	const globalLoadingOverlay = document.getElementById('global-loading-overlay');
	// --- Recording Overlay ---
	const recordingOverlay = document.getElementById('recording-overlay');

	function showLoadingOverlay() {
		globalLoadingOverlay.classList.remove('hidden');
	}

	function hideLoadingOverlay() {
		globalLoadingOverlay.classList.add('hidden');
	}

	// Get MathJax render element early for settings
	const mathjaxRender = document.getElementById('mathjax-render');

	/**
	 * Renders the LaTeX to MathJax SVG in the preview box as the user types.
	 */
	async function renderLivePreview() {
		const latex = latexInput.value.trim();
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

		// Apply settings
		mathjaxRender.style.color = imageSettings.fontColor;
		mathjaxRender.style.transform = `scale(${imageSettings.scale})`;

		// Set the text content, wrapped in display math delimiters
		mathjaxRender.textContent = `$$${latex}$$`;

		try {
			if (typeof MathJax === 'undefined' || !MathJax.typesetPromise) {
				showMessage('MathJax is not loaded yet. Please wait.', 'error');
				return;
			}
			await MathJax.typesetPromise([mathjaxRender]);
		} catch (mjError) {
			console.error("MathJax typesetting error:", mjError);
			showMessage(`MathJax error: ${mjError.message}`, 'error');
			disableActionButtons();
			return;
		}

		// Check if MathJax rendered an error
		const hasError = mathjaxRender.querySelector('mjx-merror') !== null;

		if (hasError) {
			showMessage('Invalid LaTeX syntax. Preview shows details.', 'error');
			disableActionButtons();
		} else {
			hideMessage();
			enableActionButtons();
		}
	}

	/**
	 * Generates the image blob/dataURL from the ALREADY RENDERED SVG preview.
	 * @returns {Promise<boolean>} True on success, false on failure.
	 */
	async function autoRender() {
		currentImageBlob = null;
		currentImageDataUrl = null;
		disableActionButtons();

		const latex = latexInput.value.trim();

		if (!latex) {
			resetPreview();
			showEmptyState();
			return false;
		}

		const hasError = mathjaxRender.querySelector('mjx-merror') !== null;
		if (hasError) {
			showMessage('Cannot copy/download: Invalid LaTeX.', 'error');
			disableActionButtons();
			return false;
		}

		// --- SVG to PNG conversion logic (applies settings) ---
		try {
			const svgElement = mathjaxRender.querySelector('svg');
			if (!svgElement) {
				throw new Error('No SVG element found in preview. Typesetting might have failed.');
			}

			const padding = imageSettings.padding;
			const scale = imageSettings.scale;

			// 1. Get SVG dimensions
			const svgWidth = svgElement.width.baseVal.value;
			const svgHeight = svgElement.height.baseVal.value;
			
			// 2. Serialize SVG
			if (!svgElement.getAttribute('xmlns')) {
				svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
			}
			const svgXml = new XMLSerializer().serializeToString(svgElement);

			// 3. Create a data URL from the SVG
			const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgXml)));

			// 4. Use an Image object to load the SVG
			const img = new Image();

			// 5. Wrap image loading in a Promise to get the blob
			const pngBlob = await new Promise((resolve, reject) => {
				img.onload = () => {
					const canvas = document.createElement('canvas');
					canvas.width = (svgWidth * scale) + (padding * 2);
					canvas.height = (svgHeight * scale) + (padding * 2);
					const ctx = canvas.getContext('2d');

					if (!imageSettings.transparent) {
						ctx.fillStyle = imageSettings.bgColor;
						ctx.fillRect(0, 0, canvas.width, canvas.height);
					}

					ctx.drawImage(img, padding, padding, svgWidth * scale, svgHeight * scale);

					currentImageDataUrl = canvas.toDataURL('image/png');
					canvas.toBlob((b) => {
						if (b) {
							resolve(b);
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

			currentImageBlob = pngBlob;
			enableActionButtons();
			return true;

		} catch (error) {
			showMessage(`Error generating image: ${error.message}`, 'error');
			console.error('Image generation error:', error);
			enableActionButtons();
			return false;
		}
	}

	const latexInput = document.getElementById('latex-input');

	latexInput.addEventListener('input', async () => {
		await renderLivePreview();
	});


	/**
	 * Extracts and cleans a LaTeX string from various delimiters.
	 */
	function extractLatex(rawText) {
		if (!rawText) return '';
		let processedText = rawText.trim();

		const codeBlockMatch = processedText.match(/^```(?:latex|tex|math)?\s*([\s\S]*?)\s*```$/);
		if (codeBlockMatch && codeBlockMatch[1]) {
			return codeBlockMatch[1].trim().replace(/\n/g, ' ');
		}

		const displayMathMatch = processedText.match(/^\$\$\s*([\s\S]*?)\s*\$\$$/);
		if (displayMathMatch && displayMathMatch[1]) {
			return displayMathMatch[1].trim().replace(/\n/g, ' ');
		}

		const inlineMathMatch = processedText.match(/^\$\s*([^$]*?)\s*\$$/);
		if (inlineMathMatch && inlineMathMatch[1]) {
			return inlineMathMatch[1].trim();
		}

		return processedText;
	}

	// Helper function to insert LaTeX at the cursor
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

		input.value = originalText.substring(0, start) + text + originalText.substring(end);

		const newCursorPos = start + text.length;
		input.selectionStart = newCursorPos;
		input.selectionEnd = newCursorPos;

		input.dispatchEvent(new Event('input'));
		showMessage('LaTeX inserted at cursor!', 'success');
		input.focus();
	}

	/**
	 * AI Model Initialization Function
	 */
	async function initializeModelSession(type) {
		// This check is now redundant because of the initial global check,
		// but good for defense-in-depth if a specific model (e.g., 'image') fails.
		if (!isModelGloballyAvailable) {
			showMessage('AI Model is not available. Please check browser settings.', 'error');
			return null;
		}

		if (typeof LanguageModel === 'undefined') {
			showMessage('Error: Built-in AI API (LanguageModel) not found.', 'error');
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


	// --- Shared Image Processing Function ---
    /**
     * Processes an image canvas. Shared logic for drawing, pasting, and cropping.
     * @param {HTMLCanvasElement} canvas The canvas element containing the image.
     * @param {string} prompt The text prompt for the AI.
     */
    async function processImageFromCanvas(canvas, prompt) {
        showLoadingOverlay();
        disableActionButtons();

		// --- MODIFIED: Disable all input buttons using the global array ---
		allInputButtons.forEach(btn => btn.disabled = true);

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
            
            // --- MODIFIED: Only re-enable buttons if model is globally available ---
			if (isModelGloballyAvailable) {
				allInputButtons.forEach(btn => btn.disabled = false);
			}
        }
    }
	
	// --- Process Drawing Button ---
	document.getElementById('process-drawing-btn').addEventListener('click', async () => {
		hideDrawingModal();
		await processImageFromCanvas(
			drawingCanvas,
			'Analyze the provided drawing and extract the mathematical equation as a LaTeX string. Only output the LaTeX code.'
		);
		clearDrawing();
	});


	// --- Crop from Screen Logic ---
	async function startCropSelection() {
        try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab && activeTab.id) {
                const response = await chrome.tabs.sendMessage(activeTab.id, { action: "startCrop" });
				if (response && response.status === "cropping_started") {
                	console.log(response.status);
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

	document.getElementById('crop-btn').addEventListener('click', startCropSelection);

    /**
     * Global listener for messages from content scripts.
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "cropComplete") {
            const { x, y, width, height, dpr } = request.cropData;

			if (width <= 0 || height <= 0) {
				console.log("Crop cancelled or invalid dimensions.");
				return;
			}

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
                    const canvas = document.createElement('canvas');
                    
                    const finalWidth = width * dpr;
                    const finalHeight = height * dpr;
                    const finalX = x * dpr;
                    const finalY = y * dpr;

                    canvas.width = finalWidth;
                    canvas.height = finalHeight;
                    const ctx = canvas.getContext('2d');

                    ctx.drawImage(
                        img,
                        finalX, finalY,
                        finalWidth, finalHeight,
                        0, 0,
                        finalWidth, finalHeight
                    );

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

	// --- Audio Input Processing ---
	const stopBtn = document.getElementById('stop-record-btn');

	recordAudioBtn.addEventListener('click', async () => {
		try {
			if (!audioSession) audioSession = await initializeModelSession('audio');
			if (!audioSession) return;

			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorder = new MediaRecorder(stream);
			audioChunks = [];
			mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);

			mediaRecorder.onstop = async () => {
				recordingOverlay.classList.add('hidden');
				showLoadingOverlay();
				disableActionButtons();
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
					insertLatex(response);
				} catch (error) {
					console.error('Audio processing error:', error);
					showMessage(`Audio processing failed: ${error.message}`, 'error');
					if (audioSession) audioSession.destroy();
					audioSession = null;
				} finally {
					hideLoadingOverlay();
					// --- MODIFIED: Only re-enable buttons if model is globally available ---
					if (isModelGloballyAvailable) {
						allInputButtons.forEach(btn => btn.disabled = false);
					}
					latexInput.dispatchEvent(new Event('input'));
				}
			};

			mediaRecorder.start();
			// --- MODIFIED: Disable all input buttons using the global array ---
			allInputButtons.forEach(btn => btn.disabled = true);
            recordingOverlay.classList.remove('hidden');
			showMessage('Recording audio...', 'info');

		} catch (error) {
			console.error('Error starting recording:', error);
			showMessage('Could not start recording: ' + error.message, 'error');
			// --- MODIFIED: Only re-enable buttons if model is globally available ---
			if (isModelGloballyAvailable) {
				allInputButtons.forEach(btn => btn.disabled = false);
			}
		}
	});

	stopBtn.addEventListener('click', () => {
		if (mediaRecorder && mediaRecorder.state === 'recording') {
			mediaRecorder.stop();
		}
	});

	// --- Intelligent Ask Logic ---
	const intelligentAskModal = document.getElementById('intelligent-ask-modal');
	const intelligentAskOverlay = document.getElementById('intelligent-ask-overlay');
	const intelligentAskInput = document.getElementById('intelligent-ask-input');
	const intelligentAskSubmitBtn = document.getElementById('intelligent-ask-submit-btn');
	const intelligentAskCloseBtn = document.getElementById('intelligent-ask-close-btn');

	function showIntelligentAskModal() {
		intelligentAskModal.classList.remove('hidden');
		intelligentAskOverlay.classList.remove('hidden');
		intelligentAskInput.focus();
	}
	function hideIntelligentAskModal() {
		intelligentAskModal.classList.add('hidden');
		intelligentAskOverlay.classList.add('hidden');
		intelligentAskInput.value = '';
	}

	intelligentAskBtn.addEventListener('click', showIntelligentAskModal);
	intelligentAskCloseBtn.addEventListener('click', hideIntelligentAskModal);
	intelligentAskOverlay.addEventListener('click', hideIntelligentAskModal);
	intelligentAskSubmitBtn.addEventListener('click', processIntelligentAsk);

	intelligentAskInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
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
			return;
		}

		hideIntelligentAskModal();
		showLoadingOverlay();
		disableActionButtons();

		try {
			if (!textSession) {
				// This check is also redundant, but good for defense-in-depth
				if (!isModelGloballyAvailable) {
					throw new Error('AI Model is not available.');
				}
				if (typeof LanguageModel === 'undefined') {
					throw new Error('Built-in AI API (LanguageModel) not found.');
				}
				
				// We already checked availability, but we can do it again.
				const availability = await LanguageModel.availability();
				if (availability !== 'available') {
					throw new Error(`AI Model is not available. Status: ${availability}`);
				}

				textSession = await LanguageModel.create({
					initialPrompts: [
						{ role: 'system', content: 'You are a mathematical assistant. The user will ask for a formula or equation in natural language. You must respond with ONLY the raw LaTeX code for that equation. Do not include any other text, explanations, or delimiters like $$, ```latex, or ```.' }
					]
				});
				showMessage('Text AI session initialized!', 'success');
			}

			const response = await textSession.prompt(promptText);
			console.log('Intelligent Ask Result: `' + response + '`');
			insertLatex(response);

		} catch (error) {
			console.error('Intelligent Ask error:', error);
			showMessage(`Failed to get formula: ${error.message}`, 'error');
			if (textSession) textSession.destroy();
			textSession = null;
		} finally {
			hideLoadingOverlay();
			latexInput.dispatchEvent(new Event('input'));
		}
	}

	// --- Settings Modal Logic ---
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

	function toggleBgInput() {
		settingBgColor.disabled = settingTransparentBg.checked;
	}

	function showSettingsModal() {
		settingPadding.value = imageSettings.padding;
		settingScale.value = imageSettings.scale;
		settingFontColor.value = imageSettings.fontColor;
		settingBgColor.value = imageSettings.bgColor;
		settingTransparentBg.checked = imageSettings.transparent;

		toggleBgInput();
		settingsModal.classList.remove('hidden');
		settingsOverlay.classList.remove('hidden');
	}

	function hideSettingsModal() {
		settingsModal.classList.add('hidden');
		settingsOverlay.classList.add('hidden');
	}

	async function saveSettings() {
		imageSettings.padding = parseInt(settingPadding.value, 10) || 0;
		imageSettings.scale = parseFloat(settingScale.value) || 1.0;
		imageSettings.fontColor = settingFontColor.value;
		imageSettings.bgColor = settingBgColor.value;
		imageSettings.transparent = settingTransparentBg.checked;

		if (chrome.storage && chrome.storage.local) {
			chrome.storage.local.set({ imageSettings: imageSettings }, () => {
				console.log('Image settings saved.');
			});
		}

		hideSettingsModal();
		showMessage('Settings saved!', 'success');
		await renderLivePreview();
	}

	function loadSettings() {
		if (chrome.storage && chrome.storage.local) {
			chrome.storage.local.get(['imageSettings'], (result) => {
				if (result.imageSettings) {
					imageSettings = { ...imageSettings, ...result.imageSettings };
					console.log('Image settings loaded:', imageSettings);
				}
				mathjaxRender.style.color = imageSettings.fontColor;
				mathjaxRender.style.transform = `scale(${imageSettings.scale})`;
				if (latexInput.value.trim()) {
					renderLivePreview();
				}
			});
		} else {
			mathjaxRender.style.color = imageSettings.fontColor;
		}
	}

	settingsBtn.addEventListener('click', showSettingsModal);
	settingsCloseBtn.addEventListener('click', hideSettingsModal);
	settingsOverlay.addEventListener('click', hideSettingsModal);
	settingsSaveBtn.addEventListener('click', saveSettings);
	settingTransparentBg.addEventListener('change', toggleBgInput);

	// --- Action Buttons (Copy, Download, Clear) ---

	document.getElementById('copy-btn').addEventListener('click', async () => {
		showMessage('Rendering and copying...', 'info');

		const success = await autoRender();
		if (!success || !currentImageBlob) {
			showMessage('Failed to copy. Check LaTeX for errors.', 'error');
			if (latexInput.value.trim().length > 0) {
				if (mathjaxRender.querySelector('mjx-merror') === null) {
					enableActionButtons();
				}
			}
			return;
		}

		try {
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': currentImageBlob })
			]);
			showMessage('Image copied to clipboard!', 'success');
		} catch (error) {
			showMessage('Failed to copy image: ' + error.message, 'error');
		}
		enableActionButtons();
	});

	document.getElementById('download-btn').addEventListener('click', async () => {
		showMessage('Rendering and downloading...', 'info');

		const success = await autoRender();
		if (!success || !currentImageDataUrl) {
			showMessage('Failed to download. Check LaTeX for errors.', 'error');
			if (latexInput.value.trim().length > 0) {
				if (mathjaxRender.querySelector('mjx-merror') === null) {
					enableActionButtons();
				}
			}
			return;
		}

		const filename = 'latex-equation-' + Date.now() + '.png';
		const a = document.createElement('a');
		a.href = currentImageDataUrl;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);

		showMessage('Image downloaded!', 'success');
		enableActionButtons();
	});

	document.getElementById('clear-btn').addEventListener('click', () => {
		latexInput.value = '';
		latexInput.dispatchEvent(new Event('input'));
		hideMessage();

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
		if (textSession) {
			textSession.destroy();
			textSession = null;
			console.log('Text session destroyed.');
		}
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


	// --- **** NEW: Model Status Check Functions **** ---

	/**
	 * Updates the UI to show model status and disable/enable input buttons.
	 * @param {boolean} isAvailable True if the model is loaded, false otherwise.
	 */
	function setModelStatus(isAvailable) {
		isModelGloballyAvailable = isAvailable; // Set the global flag
		statusIndicator.classList.remove('bg-yellow-400', 'animate-pulse');

		if (isAvailable) {
			// Set to GREEN status
			statusIndicator.classList.add('bg-green-500');
			statusText.textContent = 'Local model enabled';
			statusText.classList.remove('text-gray-600');
			statusText.classList.add('text-green-700');
			
			// Enable all input buttons
			allInputButtons.forEach(btn => {
				btn.disabled = false;
				btn.classList.remove('opacity-50', 'cursor-not-allowed');
			});
		} else {
			// Set to RED status
			statusIndicator.classList.add('bg-red-500');
			statusText.textContent = 'Unable to load local model';
			statusText.classList.remove('text-gray-600');
			statusText.classList.add('text-red-700');
			
			// Disable all input buttons
			allInputButtons.forEach(btn => {
				btn.disabled = true;
				btn.classList.add('opacity-50', 'cursor-not-allowed');
			});
		}
	}

	/**
	 * Checks for LanguageModel availability on load.
	 * We check for the base (text) model.
	 */
	async function checkInitialModelAvailability() {
		if (typeof LanguageModel === 'undefined') {
			console.error('LanguageModel API not found. Disabling AI features.');
			setModelStatus(false);
			return;
		}
		
		try {
			// Check for the base text model availability
			const availability = await LanguageModel.availability();
			
			if (availability === 'available') {
				console.log('LanguageModel is available.');
				setModelStatus(true);
			} else {
				console.warn(`LanguageModel not available. Status: ${availability}`);
				setModelStatus(false);
			}
		} catch (error) {
			console.error('Error checking model availability:', error);
			setModelStatus(false);
		}
	}

	// --- Initialization ---
	
	loadSettings();
	
	// --- **** NEW: Check model status on load **** ---
	checkInitialModelAvailability(); 

	// Trigger input event on load to set the initial empty state
	latexInput.dispatchEvent(new Event('input'));
});