/**
 * Visualization module for displaying change detection results
 */
class ChangeVisualizer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.changes = [];
        this.baseImage = null;
        this.comparisonImage = null;
        this.visualizationImage = null;
        this.activeView = 'comparison'; // 'base', 'comparison', 'visualization'
        this.zoomLevel = 1.0;
        this.panOffset = { x: 0, y: 0 };
        this.selectedChange = null;
        this.hoverChange = null;
        
        // Initialize event listeners
        this.initializeEventListeners();
    }
    
    /**
     * Set up event listeners for interaction
     */
    initializeEventListeners() {
        // Mouse wheel for zooming
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Determine zoom direction
            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            
            // Apply zoom with mouse position as center
            this.zoom(zoomFactor, mouseX, mouseY);
            
            // Redraw canvas
            this.render();
        });
        
        // Mouse down for panning and selection
        this.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Check if clicking on a change region
            const change = this.getChangeAtPosition(mouseX, mouseY);
            if (change) {
                this.selectChange(change);
            } else {
                // Start panning
                this.isPanning = true;
                this.lastPanPoint = { x: mouseX, y: mouseY };
            }
            
            // Redraw canvas
            this.render();
        });
        
        // Mouse move for panning and hover
        this.canvas.addEventListener('mousemove', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Update hover state
            const change = this.getChangeAtPosition(mouseX, mouseY);
            if (change !== this.hoverChange) {
                this.hoverChange = change;
                this.render();
            }
            
            // Handle panning
            if (this.isPanning && this.lastPanPoint) {
                const dx = mouseX - this.lastPanPoint.x;
                const dy = mouseY - this.lastPanPoint.y;
                
                this.panOffset.x += dx;
                this.panOffset.y += dy;
                
                this.lastPanPoint = { x: mouseX, y: mouseY };
                this.render();
            }
        });
        
        // Mouse up to end panning
        window.addEventListener('mouseup', () => {
            this.isPanning = false;
        });
        
        // Reset view on double click
        this.canvas.addEventListener('dblclick', () => {
            this.resetView();
        });
    }
    
    /**
     * Set the base image
     * @param {string} imageData - Base64 encoded image
     */
    setBaseImage(imageData) {
        return new Promise((resolve) => {
            this.baseImage = new Image();
            this.baseImage.onload = () => {
                this.render();
                resolve();
            };
            this.baseImage.src = imageData;
        });
    }
    
    /**
     * Set the comparison image
     * @param {string} imageData - Base64 encoded image
     */
    setComparisonImage(imageData) {
        return new Promise((resolve) => {
            this.comparisonImage = new Image();
            this.comparisonImage.onload = () => {
                this.render();
                resolve();
            };
            this.comparisonImage.src = imageData;
        });
    }
    
    /**
     * Set the visualization image with highlighted changes
     * @param {string} imageData - Base64 encoded image
     */
    setVisualizationImage(imageData) {
        return new Promise((resolve) => {
            this.visualizationImage = new Image();
            this.visualizationImage.onload = () => {
                this.render();
                resolve();
            };
            this.visualizationImage.src = imageData;
        });
    }
    
    /**
     * Set change detection results
     * @param {Array} changes - List of change objects
     */
    setChanges(changes) {
        this.changes = changes;
        this.render();
    }
    
    /**
     * Switch between different views (base, comparison, visualization)
     * @param {string} viewMode - View mode to switch to
     */
    switchView(viewMode) {
        if (['base', 'comparison', 'visualization'].includes(viewMode)) {
            this.activeView = viewMode;
            this.render();
        }
    }
    
    /**
     * Adjust zoom level
     * @param {number} factor - Zoom factor to apply
     * @param {number} centerX - X-coordinate of zoom center
     * @param {number} centerY - Y-coordinate of zoom center
     */
    zoom(factor, centerX, centerY) {
        // Calculate position in unzoomed image space
        const unzoomedX = (centerX - this.panOffset.x) / this.zoomLevel;
        const unzoomedY = (centerY - this.panOffset.y) / this.zoomLevel;
        
        // Apply zoom factor
        this.zoomLevel *= factor;
        
        // Limit zoom level
        this.zoomLevel = Math.max(0.1, Math.min(5.0, this.zoomLevel));
        
        // Adjust pan offset to keep zoom center at the same position
        this.panOffset.x = centerX - unzoomedX * this.zoomLevel;
        this.panOffset.y = centerY - unzoomedY * this.zoomLevel;
    }
    
    /**
     * Reset view to default state
     */
    resetView() {
        this.zoomLevel = 1.0;
        this.panOffset = { x: 0, y: 0 };
        this.selectedChange = null;
        this.render();
    }
    
    /**
     * Select a change region
     * @param {Object} change - Change object to select
     */
    selectChange(change) {
        this.selectedChange = change;
        
        // Trigger change selection event
        const event = new CustomEvent('change-selected', { 
            detail: { change: change } 
        });
        this.canvas.dispatchEvent(event);
    }
    
    /**
     * Find change at a specific position
     * @param {number} x - X-coordinate
     * @param {number} y - Y-coordinate
     * @returns {Object|null} Change object or null if none found
     */
    getChangeAtPosition(x, y) {
        // Convert screen position to image position
        const imageX = (x - this.panOffset.x) / this.zoomLevel;
        const imageY = (y - this.panOffset.y) / this.zoomLevel;
        
        // Check each change region
        for (const change of this.changes) {
            if (
                imageX >= change.x && 
                imageX <= change.x + change.width &&
                imageY >= change.y && 
                imageY <= change.y + change.height
            ) {
                return change;
            }
        }
        
        return null;
    }
    
    /**
     * Render the current view to the canvas
     */
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Determine which image to display
        let activeImage;
        switch (this.activeView) {
            case 'base':
                activeImage = this.baseImage;
                break;
            case 'comparison':
                activeImage = this.comparisonImage;
                break;
            case 'visualization':
                activeImage = this.visualizationImage;
                break;
            default:
                activeImage = this.comparisonImage || this.baseImage;
        }
        
        if (!activeImage) {
            // No image to display
            this.drawNoImageMessage();
            return;
        }
        
        // Apply transform for zoom and pan
        this.ctx.save();
        this.ctx.translate(this.panOffset.x, this.panOffset.y);
        this.ctx.scale(this.zoomLevel, this.zoomLevel);
        
        // Draw the image
        this.ctx.drawImage(activeImage, 0, 0);
        
        // If in base or comparison view, draw change rectangles
        if (this.activeView !== 'visualization') {
            this.drawChangeRectangles();
        }
        
        // Restore transform
        this.ctx.restore();
        
        // Draw UI overlays
        this.drawUIOverlays();
    }
    
    /**
     * Draw change rectangles on the image
     */
    drawChangeRectangles() {
        for (const change of this.changes) {
            // Determine color based on change type
            let color;
            switch (change.type) {
                case 'added':
                    color = 'rgba(0, 255, 0, 0.5)';  // Green for added
                    break;
                case 'removed':
                    color = 'rgba(255, 0, 0, 0.5)';  // Red for removed
                    break;
                default:
                    color = 'rgba(255, 255, 0, 0.5)'; // Yellow for changed
            }
            
            // Highlight selected or hovered change
            if (change === this.selectedChange) {
                this.ctx.lineWidth = 3;
                this.ctx.strokeStyle = 'rgba(0, 162, 255, 1.0)';
            } else if (change === this.hoverChange) {
                this.ctx.lineWidth = 2;
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            } else {
                this.ctx.lineWidth = 1;
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            }
            
            // Draw rectangle
            this.ctx.fillStyle = color;
            this.ctx.fillRect(change.x, change.y, change.width, change.height);
            this.ctx.strokeRect(change.x, change.y, change.width, change.height);
            
            // Draw label
            this.ctx.font = '12px Arial';
            this.ctx.fillStyle = 'white';
            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 0.5;
            const label = change.type.charAt(0).toUpperCase() + change.type.slice(1);
            this.ctx.strokeText(label, change.x + 2, change.y - 5);
            this.ctx.fillText(label, change.x + 2, change.y - 5);
        }
    }
    
    /**
     * Draw UI overlays on the canvas
     */
    drawUIOverlays() {
        // Draw zoom level indicator
        this.ctx.font = '14px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.fillText(`Zoom: ${(this.zoomLevel * 100).toFixed(0)}%`, 10, 20);
        
        // Draw active view mode
        this.ctx.fillText(`View: ${this.activeView}`, 10, 40);
        
        // Draw help text
        this.ctx.fillText('Scroll to zoom, drag to pan, double-click to reset', 10, this.canvas.height - 10);
    }
    
    /**
     * Draw message when no image is available
     */
    drawNoImageMessage() {
        this.ctx.font = '20px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('No image available', this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.font = '16px Arial';
        this.ctx.fillText('Capture an image to begin', this.canvas.width / 2, this.canvas.height / 2 + 30);
        this.ctx.textAlign = 'left';
    }
}

export default ChangeVisualizer;
