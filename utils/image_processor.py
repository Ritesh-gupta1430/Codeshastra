import cv2
import numpy as np
from PIL import Image
import logging

logger = logging.getLogger(__name__)

def preprocess_image(image_array):
    """
    Preprocess an image for change detection
    
    Args:
        image_array: NumPy array of the image
        
    Returns:
        Preprocessed image
    """
    try:
        # Convert to RGB if needed
        if image_array.shape[2] == 4:  # RGBA
            image_array = cv2.cvtColor(image_array, cv2.COLOR_RGBA2RGB)
        
        # Resize to a standard size if needed
        # This helps with consistency in processing
        height, width = image_array.shape[:2]
        max_dim = 800
        
        if height > max_dim or width > max_dim:
            scale = max_dim / max(height, width)
            new_height = int(height * scale)
            new_width = int(width * scale)
            image_array = cv2.resize(image_array, (new_width, new_height))
            
        # Apply slight Gaussian blur to reduce noise
        image_array = cv2.GaussianBlur(image_array, (5, 5), 0)
        
        # Convert to grayscale for certain operations
        grayscale = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY)
        
        # Equalize histogram to improve contrast
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        grayscale = clahe.apply(grayscale)
        
        # Convert back to RGB for consistency in the pipeline
        enhanced = cv2.cvtColor(grayscale, cv2.COLOR_GRAY2RGB)
        
        return enhanced
        
    except Exception as e:
        logger.error(f"Error preprocessing image: {str(e)}")
        # Return original image if processing fails
        return image_array

def extract_features(image):
    """
    Extract features from an image for matching
    
    Args:
        image: Preprocessed image
        
    Returns:
        Keypoints and descriptors
    """
    try:
        # Convert to grayscale for feature detection
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        
        # Use SIFT for feature detection
        sift = cv2.SIFT_create()
        keypoints, descriptors = sift.detectAndCompute(gray, None)
        
        return keypoints, descriptors
        
    except Exception as e:
        logger.error(f"Error extracting features: {str(e)}")
        return None, None

def align_images(image1, image2):
    """
    Align two images to account for camera position changes
    
    Args:
        image1: First image (baseline)
        image2: Second image (current)
        
    Returns:
        Aligned version of image2
    """
    try:
        # Extract features
        kp1, des1 = extract_features(image1)
        kp2, des2 = extract_features(image2)
        
        if des1 is None or des2 is None:
            return image2
        
        # Match features
        bf = cv2.BFMatcher()
        matches = bf.knnMatch(des1, des2, k=2)
        
        # Apply ratio test
        good_matches = []
        for m, n in matches:
            if m.distance < 0.75 * n.distance:
                good_matches.append(m)
        
        if len(good_matches) < 10:
            # Not enough matches for alignment
            return image2
        
        # Get matched keypoints
        src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        
        # Find homography matrix
        H, mask = cv2.findHomography(dst_pts, src_pts, cv2.RANSAC, 5.0)
        
        # Apply transformation
        h, w = image1.shape[:2]
        aligned = cv2.warpPerspective(image2, H, (w, h))
        
        return aligned
        
    except Exception as e:
        logger.error(f"Error aligning images: {str(e)}")
        return image2
