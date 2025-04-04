import cv2
import numpy as np
import logging
from utils.image_processor import align_images

logger = logging.getLogger(__name__)

def detect_changes(baseline_image, current_image, threshold=30):
    """
    Detect changes between two images
    
    Args:
        baseline_image: The baseline image
        current_image: The current image to compare
        threshold: Sensitivity threshold (0-255)
        
    Returns:
        List of changes, change mask, and visualization image
    """
    try:
        # Align images to account for slightly different camera positions
        aligned_current = align_images(baseline_image, current_image)
        
        # Convert images to grayscale for comparison
        baseline_gray = cv2.cvtColor(baseline_image, cv2.COLOR_RGB2GRAY)
        current_gray = cv2.cvtColor(aligned_current, cv2.COLOR_RGB2GRAY)
        
        # Calculate absolute difference
        diff = cv2.absdiff(baseline_gray, current_gray)
        
        # Apply threshold to get binary mask of changes
        _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)
        
        # Apply morphological operations to reduce noise
        kernel = np.ones((5, 5), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        
        # Find contours of changed regions
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Create visualization image
        visualization = current_image.copy()
        
        # List to store change information
        changes = []
        
        # Process each contour
        for i, contour in enumerate(contours):
            # Filter out small contours
            if cv2.contourArea(contour) < 100:
                continue
                
            # Get bounding rectangle
            x, y, w, h = cv2.boundingRect(contour)
            
            # Extract the region from both images
            roi_baseline = baseline_image[y:y+h, x:x+w]
            roi_current = aligned_current[y:y+h, x:x+w]
            
            # Determine if object was added, removed, or moved
            # This is a simplified approach - in a real application, more sophisticated
            # analysis would be needed
            baseline_mean = np.mean(roi_baseline)
            current_mean = np.mean(roi_current)
            
            change_type = "changed"
            color = (255, 255, 0)  # Yellow for changed
            
            if current_mean > baseline_mean * 1.2:
                change_type = "added"
                color = (0, 255, 0)  # Green for added
            elif baseline_mean > current_mean * 1.2:
                change_type = "removed"
                color = (255, 0, 0)  # Red for removed
            
            # Draw rectangle on visualization
            cv2.rectangle(visualization, (x, y), (x+w, y+h), color, 2)
            cv2.putText(visualization, change_type, (x, y-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            
            # Add to changes list
            changes.append({
                'id': i,
                'type': change_type,
                'x': int(x),
                'y': int(y),
                'width': int(w),
                'height': int(h)
            })
        
        return changes, thresh, visualization
        
    except Exception as e:
        logger.error(f"Error detecting changes: {str(e)}")
        # Return empty changes and original image
        return [], np.zeros_like(baseline_image[:,:,0]), current_image


def analyze_long_term_changes(scan_sequence):
    """
    Analyze changes across multiple scans over time
    
    Args:
        scan_sequence: List of scan images in chronological order
        
    Returns:
        Analysis of trends and patterns
    """
    try:
        # Initialize tracking of regions
        region_history = {}
        
        # Compare each adjacent pair of scans
        for i in range(1, len(scan_sequence)):
            baseline = scan_sequence[i-1]
            current = scan_sequence[i]
            
            # Detect changes between this pair
            changes, _, _ = detect_changes(baseline, current)
            
            # Update history for each change region
            for change in changes:
                region_key = f"{change['x']},{change['y']},{change['width']},{change['height']}"
                
                if region_key not in region_history:
                    region_history[region_key] = {
                        'first_seen': i,
                        'last_seen': i,
                        'states': ['initial']
                    }
                
                region_history[region_key]['last_seen'] = i
                region_history[region_key]['states'].append(change['type'])
        
        # Analyze the history
        regions_frequently_changing = []
        regions_recently_added = []
        regions_recently_removed = []
        
        for region_key, history in region_history.items():
            x, y, w, h = map(int, region_key.split(','))
            
            # If a region changed more than twice
            if len(history['states']) > 3:
                regions_frequently_changing.append({
                    'x': x, 'y': y, 'width': w, 'height': h,
                    'change_count': len(history['states']) - 1
                })
            
            # If a region was recently added
            if history['states'][-1] == 'added' and history['last_seen'] == len(scan_sequence) - 1:
                regions_recently_added.append({
                    'x': x, 'y': y, 'width': w, 'height': h
                })
            
            # If a region was recently removed
            if history['states'][-1] == 'removed' and history['last_seen'] == len(scan_sequence) - 1:
                regions_recently_removed.append({
                    'x': x, 'y': y, 'width': w, 'height': h
                })
        
        return {
            'frequently_changing': regions_frequently_changing,
            'recently_added': regions_recently_added,
            'recently_removed': regions_recently_removed
        }
        
    except Exception as e:
        logger.error(f"Error analyzing long-term changes: {str(e)}")
        return {
            'frequently_changing': [],
            'recently_added': [],
            'recently_removed': []
        }
