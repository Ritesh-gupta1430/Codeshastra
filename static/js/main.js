/**
 * Main application script
 */
import Camera from './camera.js';
import ChangeVisualizer from './visualization.js';

// State variables
let camera = null;
let visualizer = null;
let currentScan = null;
let baselineScan = null;
let scanSession = null;
let processingInProgress = false;

// DOM elements
const elements = {
    // Video and canvas elements
    video: null,
    captureCanvas: null,
    visualizationCanvas: null,
    
    // Status elements
    statusText: null,
    processingOverlay: null,
    
    // Buttons
    captureBtn: null,
    switchCameraBtn: null,
    saveAsBaselineBtn: null,
    compareWithBaselineBtn: null,
    viewBaselineBtn: null,
    viewCurrentBtn: null,
    viewVisualizationBtn: null,
    startSessionBtn: null,
    
    // Information display
    changesList: null,
    detailsPanel: null,
    baselineSelector: null
};

/**
 * Initialize the application when the DOM is ready
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize DOM elements
    initializeElements();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize camera
    await initializeCamera();
    
    // Initialize visualizer
    initializeVisualizer();
    
    // Load baselines from server
    await loadBaselines();
    
    // Show instructions
    updateStatus('Ready. Capture an image or select a baseline to compare with.');
});

/**
 * Initialize DOM element references
 */
function initializeElements() {
    elements.video = document.getElementById('camera-video');
    elements.captureCanvas = document.getElementById('capture-canvas');
    elements.visualizationCanvas = document.getElementById('visualization-canvas');
    elements.statusText = document.getElementById('status-text');
    elements.processingOverlay = document.getElementById('processing-overlay');
    elements.captureBtn = document.getElementById('capture-btn');
    elements.switchCameraBtn = document.getElementById('switch-camera-btn');
    elements.saveAsBaselineBtn = document.getElementById('save-as-baseline-btn');
    elements.compareWithBaselineBtn = document.getElementById('compare-with-baseline-btn');
    elements.viewBaselineBtn = document.getElementById('view-baseline-btn');
    elements.viewCurrentBtn = document.getElementById('view-current-btn');
    elements.viewVisualizationBtn = document.getElementById('view-visualization-btn');
    elements.startSessionBtn = document.getElementById('start-session-btn');
    elements.changesList = document.getElementById('changes-list');
    elements.detailsPanel = document.getElementById('details-panel');
    elements.baselineSelector = document.getElementById('baseline-selector');
}

/**
 * Set up event listeners for UI interactions
 */
function setupEventListeners() {
    // Capture button
    elements.captureBtn.addEventListener('click', captureImage);
    
    // Switch camera button
    elements.switchCameraBtn.addEventListener('click', switchCamera);
    
    // Save as baseline button
    elements.saveAsBaselineBtn.addEventListener('click', saveAsBaseline);
    
    // Compare with baseline button
    elements.compareWithBaselineBtn.addEventListener('click', compareWithBaseline);
    
    // View buttons
    elements.viewBaselineBtn.addEventListener('click', () => visualizer.switchView('base'));
    elements.viewCurrentBtn.addEventListener('click', () => visualizer.switchView('comparison'));
    elements.viewVisualizationBtn.addEventListener('click', () => visualizer.switchView('visualization'));
    
    // Start session button
    elements.startSessionBtn.addEventListener('click', startNewSession);
    
    // Baseline selector change
    elements.baselineSelector.addEventListener('change', selectBaseline);
    
    // Visualizer change selection event
    elements.visualizationCanvas.addEventListener('change-selected', (e) => {
        showChangeDetails(e.detail.change);
    });
}

/**
 * Initialize the camera
 */
async function initializeCamera() {
    try {
        camera = new Camera(
            elements.video,
            elements.captureCanvas,
            elements.statusText
        );
        
        const success = await camera.initialize();
        if (!success) {
            showError('Failed to initialize camera. Please check permissions.');
        }
    } catch (error) {
        console.error('Error initializing camera:', error);
        showError('Camera error: ' + error.message);
    }
}

/**
 * Initialize the change visualizer
 */
function initializeVisualizer() {
    visualizer = new ChangeVisualizer(elements.visualizationCanvas);
    
    // Set canvas size
    resizeVisualizationCanvas();
    
    // Handle window resize
    window.addEventListener('resize', resizeVisualizationCanvas);
}

/**
 * Resize visualization canvas to fit container
 */
function resizeVisualizationCanvas() {
    const container = elements.visualizationCanvas.parentElement;
    elements.visualizationCanvas.width = container.clientWidth;
    elements.visualizationCanvas.height = container.clientHeight;
    
    // Re-render if visualizer is initialized
    if (visualizer) {
        visualizer.render();
    }
}

/**
 * Load baseline scans from the server
 */
async function loadBaselines() {
    try {
        updateStatus('Loading baselines...');
        
        const response = await fetch('/api/baseline-scans');
        const data = await response.json();
        
        if (data.success) {
            // Clear current options
            elements.baselineSelector.innerHTML = '<option value="">Select a baseline</option>';
            
            // Add baseline options
            data.baselines.forEach(baseline => {
                const option = document.createElement('option');
                option.value = baseline.id;
                option.textContent = `${baseline.name} (${new Date(baseline.timestamp).toLocaleString()})`;
                elements.baselineSelector.appendChild(option);
            });
            
            updateStatus('Baselines loaded.');
        } else {
            showError('Failed to load baselines: ' + data.message);
        }
    } catch (error) {
        console.error('Error loading baselines:', error);
        showError('Network error while loading baselines.');
    }
}

/**
 * Capture an image from the camera
 */
function captureImage() {
    if (!camera) {
        showError('Camera not initialized');
        return;
    }
    
    const imageData = camera.captureImage();
    if (imageData) {
        // Store current scan
        currentScan = {
            imageData: imageData,
            timestamp: new Date()
        };
        
        // Display in visualizer
        visualizer.setComparisonImage(imageData);
        visualizer.switchView('comparison');
        
        // Enable save and compare buttons
        elements.saveAsBaselineBtn.disabled = false;
        elements.compareWithBaselineBtn.disabled = (elements.baselineSelector.value === '');
        
        updateStatus('Image captured. You can save as baseline or compare with existing baseline.');
    } else {
        showError('Failed to capture image');
    }
}

/**
 * Switch between front and back cameras
 */
async function switchCamera() {
    if (!camera) {
        showError('Camera not initialized');
        return;
    }
    
    elements.switchCameraBtn.disabled = true;
    updateStatus('Switching camera...');
    
    const success = await camera.switchCamera();
    
    elements.switchCameraBtn.disabled = false;
    if (!success) {
        showError('Failed to switch camera');
    }
}

/**
 * Save current scan as a baseline
 */
async function saveAsBaseline() {
    if (!currentScan) {
        showError('No image captured');
        return;
    }
    
    try {
        showProcessing(true);
        updateStatus('Saving baseline...');
        
        const scanName = prompt('Enter a name for this baseline:', 
            `Baseline ${new Date().toLocaleString()}`);
        
        if (!scanName) {
            showProcessing(false);
            updateStatus('Save cancelled');
            return;
        }
        
        const response = await fetch('/api/scan/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: scanName,
                image: currentScan.imageData,
                is_baseline: true,
                session_id: scanSession ? scanSession.id : null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateStatus('Baseline saved successfully.');
            
            // Store as current baseline
            baselineScan = {
                id: data.scan_id,
                name: scanName,
                imageData: currentScan.imageData
            };
            
            // Reload baselines
            await loadBaselines();
            
            // Set as selected baseline
            elements.baselineSelector.value = data.scan_id;
        } else {
            showError('Failed to save baseline: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving baseline:', error);
        showError('Network error while saving baseline.');
    } finally {
        showProcessing(false);
    }
}

/**
 * Compare current scan with selected baseline
 */
async function compareWithBaseline() {
    if (!currentScan) {
        showError('No image captured');
        return;
    }
    
    const baselineId = elements.baselineSelector.value;
    if (!baselineId) {
        showError('No baseline selected');
        return;
    }
    
    try {
        showProcessing(true);
        updateStatus('Comparing images...');
        
        const response = await fetch('/api/scan/compare', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                baseline_id: baselineId,
                current_image: currentScan.imageData,
                save_scan: true,
                session_id: scanSession ? scanSession.id : null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Set visualization image
            await visualizer.setVisualizationImage(data.visualization);
            
            // Set changes
            visualizer.setChanges(data.changes);
            
            // Switch to visualization view
            visualizer.switchView('visualization');
            
            // Enable view buttons
            elements.viewBaselineBtn.disabled = false;
            elements.viewCurrentBtn.disabled = false;
            elements.viewVisualizationBtn.disabled = false;
            
            // Display changes in list
            displayChangesList(data.changes, data.objects);
            
            updateStatus(`Comparison complete. Found ${data.change_count} changes.`);
        } else {
            showError('Comparison failed: ' + data.message);
        }
    } catch (error) {
        console.error('Error comparing images:', error);
        showError('Network error during comparison.');
    } finally {
        showProcessing(false);
    }
}

/**
 * Select a baseline from the dropdown
 */
async function selectBaseline() {
    const baselineId = elements.baselineSelector.value;
    if (!baselineId) {
        return;
    }
    
    try {
        showProcessing(true);
        updateStatus('Loading baseline...');
        
        const response = await fetch(`/api/scan/${baselineId}`);
        const data = await response.json();
        
        if (data.success) {
            // Store baseline
            baselineScan = {
                id: data.scan.id,
                name: data.scan.name,
                imageData: data.scan.image
            };
            
            // Set in visualizer
            await visualizer.setBaseImage(data.scan.image);
            
            // Enable compare button if current scan exists
            elements.compareWithBaselineBtn.disabled = !currentScan;
            
            updateStatus('Baseline loaded.');
        } else {
            showError('Failed to load baseline: ' + data.message);
        }
    } catch (error) {
        console.error('Error loading baseline:', error);
        showError('Network error while loading baseline.');
    } finally {
        showProcessing(false);
    }
}

/**
 * Start a new scanning session
 */
async function startNewSession() {
    try {
        const sessionName = prompt('Enter a name for this session:', 
            `Session ${new Date().toLocaleString()}`);
        
        if (!sessionName) {
            return;
        }
        
        showProcessing(true);
        updateStatus('Creating session...');
        
        const response = await fetch('/api/session/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: sessionName
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Store session
            scanSession = {
                id: data.session_id,
                name: sessionName
            };
            
            // Update UI
            elements.startSessionBtn.textContent = 'Session: ' + sessionName;
            
            updateStatus(`Session "${sessionName}" started.`);
        } else {
            showError('Failed to create session: ' + data.message);
        }
    } catch (error) {
        console.error('Error creating session:', error);
        showError('Network error while creating session.');
    } finally {
        showProcessing(false);
    }
}

/**
 * Display the list of detected changes
 */
function displayChangesList(changes, objects) {
    // Clear current list
    elements.changesList.innerHTML = '';
    
    if (!changes || changes.length === 0) {
        elements.changesList.innerHTML = '<li class="list-group-item">No changes detected</li>';
        return;
    }
    
    // Create a list item for each change
    changes.forEach((change, index) => {
        const object = objects[index] || { label: 'unknown', confidence: 0 };
        
        const li = document.createElement('li');
        li.className = 'list-group-item';
        
        // Determine item class based on change type
        switch (change.type) {
            case 'added':
                li.classList.add('list-group-item-success');
                break;
            case 'removed':
                li.classList.add('list-group-item-danger');
                break;
            default:
                li.classList.add('list-group-item-warning');
        }
        
        // Add click handler to select this change
        li.addEventListener('click', () => {
            visualizer.selectChange(change);
            showChangeDetails(change, object);
            
            // Update active state in list
            document.querySelectorAll('#changes-list .active').forEach(el => {
                el.classList.remove('active');
            });
            li.classList.add('active');
        });
        
        // Create content
        li.innerHTML = `
            <div>
                <strong>${capitalizeFirst(change.type)}:</strong> 
                ${object.label !== 'unknown' ? capitalizeFirst(object.label) : 'Object'}
                ${object.confidence > 0 ? 
                    `<span class="badge bg-info">${(object.confidence * 100).toFixed(0)}%</span>` : 
                    ''}
            </div>
            <small>Position: (${change.x}, ${change.y}) - Size: ${change.width}×${change.height}</small>
        `;
        
        elements.changesList.appendChild(li);
    });
}

/**
 * Show detailed information about a selected change
 */
function showChangeDetails(change, object) {
    if (!change) {
        elements.detailsPanel.innerHTML = '<p>No change selected</p>';
        return;
    }
    
    // Find the object info if not provided
    if (!object) {
        object = { label: 'unknown', confidence: 0 };
    }
    
    let changeTypeText = '';
    let recommendationText = '';
    
    // Generate different text based on change type
    switch (change.type) {
        case 'added':
            changeTypeText = 'A new object has been added to the scene.';
            recommendationText = 'Verify if this addition is expected.';
            break;
        case 'removed':
            changeTypeText = 'An object has been removed from the scene.';
            recommendationText = 'Check if this item should be returned or replaced.';
            break;
        default:
            changeTypeText = 'An object has been modified or moved.';
            recommendationText = 'Confirm if this change is intentional.';
    }
    
    elements.detailsPanel.innerHTML = `
        <div class="card">
            <div class="card-header bg-primary text-white">
                Change Details
            </div>
            <div class="card-body">
                <h5 class="card-title">${capitalizeFirst(change.type)} ${
                    object.label !== 'unknown' ? capitalizeFirst(object.label) : 'Object'
                }</h5>
                <p class="card-text">${changeTypeText}</p>
                <ul class="list-group mb-3">
                    <li class="list-group-item">
                        <strong>Position:</strong> (${change.x}, ${change.y})
                    </li>
                    <li class="list-group-item">
                        <strong>Size:</strong> ${change.width}×${change.height} pixels
                    </li>
                    ${object.label !== 'unknown' ? `
                    <li class="list-group-item">
                        <strong>Object Type:</strong> ${capitalizeFirst(object.label)}
                    </li>
                    ` : ''}
                    ${object.confidence > 0 ? `
                    <li class="list-group-item">
                        <strong>Confidence:</strong> ${(object.confidence * 100).toFixed(1)}%
                    </li>
                    ` : ''}
                </ul>
                <div class="alert alert-info">
                    <strong>Recommendation:</strong> ${recommendationText}
                </div>
            </div>
        </div>
    `;
}

/**
 * Show or hide the processing overlay
 */
function showProcessing(show) {
    processingInProgress = show;
    elements.processingOverlay.style.display = show ? 'flex' : 'none';
    
    // Disable buttons during processing
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        if (!button.disabled) {
            button.dataset.wasEnabled = 'true';
        }
        button.disabled = show;
    });
    
    // Re-enable only the buttons that were enabled before
    if (!show) {
        buttons.forEach(button => {
            if (button.dataset.wasEnabled === 'true') {
                button.disabled = false;
                button.dataset.wasEnabled = '';
            }
        });
    }
}

/**
 * Update status message
 */
function updateStatus(message) {
    if (elements.statusText) {
        elements.statusText.textContent = message;
    }
    console.log('Status:', message);
}

/**
 * Show error message
 */
function showError(message) {
    console.error('Error:', message);
    updateStatus(`Error: ${message}`);
    
    // Create a toast notification
    const toastContainer = document.getElementById('toast-container');
    if (toastContainer) {
        const toast = document.createElement('div');
        toast.className = 'toast show';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        
        toast.innerHTML = `
            <div class="toast-header bg-danger text-white">
                <strong class="me-auto">Error</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Remove after 5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toastContainer.removeChild(toast);
            }, 500);
        }, 5000);
        
        // Add close button handler
        const closeBtn = toast.querySelector('.btn-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                toast.classList.remove('show');
                setTimeout(() => {
                    toastContainer.removeChild(toast);
                }, 500);
            });
        }
    }
}

/**
 * Capitalize first letter of a string
 */
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
