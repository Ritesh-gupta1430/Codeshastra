/**
 * Camera module for capturing and processing images
 */
class Camera {
    constructor(videoElement, canvasElement, statusElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.statusElement = statusElement;
        
        this.stream = null;
        this.facingMode = 'environment'; // Use back camera by default
        this.constraints = {
            video: {
                facingMode: this.facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };
    }
    
    /**
     * Initialize the camera
     */
    async initialize() {
        try {
            this.updateStatus('Requesting camera access...');
            
            // Request camera access
            this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
            
            // Set the video source to the camera stream
            this.videoElement.srcObject = this.stream;
            
            // Wait for the video to be loaded
            await new Promise(resolve => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play();
                    resolve();
                };
            });
            
            // Set canvas dimensions to match video
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
            
            this.updateStatus('Camera ready');
            return true;
            
        } catch (error) {
            this.updateStatus(`Camera error: ${error.message}`);
            console.error('Camera initialization error:', error);
            return false;
        }
    }
    
    /**
     * Switch between front and back cameras
     */
    async switchCamera() {
        // Close current stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        
        // Toggle facing mode
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        this.constraints.video.facingMode = this.facingMode;
        
        // Reinitialize with new constraints
        return this.initialize();
    }
    
    /**
     * Capture a frame from the video stream
     * @returns {string} Base64 encoded image data
     */
    captureImage() {
        try {
            const context = this.canvasElement.getContext('2d');
            
            // Draw the current video frame on the canvas
            context.drawImage(
                this.videoElement, 
                0, 0, 
                this.canvasElement.width, 
                this.canvasElement.height
            );
            
            // Convert canvas to base64 image
            const imageData = this.canvasElement.toDataURL('image/jpeg', 0.9);
            
            this.updateStatus('Image captured');
            return imageData;
            
        } catch (error) {
            this.updateStatus(`Capture error: ${error.message}`);
            console.error('Error capturing image:', error);
            return null;
        }
    }
    
    /**
     * Stop the camera stream
     */
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.updateStatus('Camera stopped');
        }
    }
    
    /**
     * Update status message
     * @param {string} message - Status message to display
     */
    updateStatus(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message;
        }
        console.log('Camera status:', message);
    }
}

export default Camera;
