import os
import base64
import json
import io
import logging
from datetime import datetime
from flask import render_template, request, jsonify, redirect, url_for, Response
import numpy as np
from PIL import Image

from app import app, db
from models import Scan, ChangeLog, ScanSession
from utils.image_processor import preprocess_image
from utils.change_detector import detect_changes
from utils.object_detector import detect_objects

logger = logging.getLogger(__name__)

@app.route('/')
def index():
    """Main page with camera interface for scanning spaces"""
    # Get existing baseline scans to show in the UI
    baseline_scans = Scan.query.filter_by(is_baseline=True).order_by(Scan.timestamp.desc()).all()
    return render_template('index.html', baseline_scans=baseline_scans)

@app.route('/history')
def history():
    """Page showing historical scans and detected changes"""
    # Get all scan sessions
    sessions = ScanSession.query.order_by(ScanSession.created_at.desc()).all()
    return render_template('history.html', sessions=sessions)

@app.route('/api/scan/save', methods=['POST'])
def save_scan():
    """API endpoint to save a new scan"""
    try:
        data = request.json
        
        # Decode base64 image
        image_data = base64.b64decode(data['image'].split(',')[1])
        
        # Create new scan record
        new_scan = Scan(
            name=data.get('name', f"Scan {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"),
            description=data.get('description', ''),
            image_data=image_data,
            is_baseline=data.get('is_baseline', False),
            location=data.get('location', 'Unknown')
        )
        
        db.session.add(new_scan)
        db.session.commit()
        
        # If this scan belongs to a session, associate it
        session_id = data.get('session_id')
        if session_id:
            session = ScanSession.query.get(session_id)
            if session:
                session.scans.append(new_scan)
                db.session.commit()
        
        return jsonify({
            'success': True,
            'scan_id': new_scan.id,
            'message': 'Scan saved successfully'
        })
    
    except Exception as e:
        logger.error(f"Error saving scan: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error saving scan: {str(e)}'
        }), 500

@app.route('/api/scan/compare', methods=['POST'])
def compare_scans():
    """API endpoint to compare a new scan with a baseline"""
    try:
        data = request.json
        
        # Get baseline scan
        baseline_id = data.get('baseline_id')
        if not baseline_id:
            return jsonify({
                'success': False,
                'message': 'Baseline scan ID is required'
            }), 400
            
        baseline_scan = Scan.query.get(baseline_id)
        if not baseline_scan:
            return jsonify({
                'success': False,
                'message': 'Baseline scan not found'
            }), 404
        
        # Decode current scan
        current_image_data = base64.b64decode(data['current_image'].split(',')[1])
        
        # Open images with PIL
        baseline_image = Image.open(io.BytesIO(baseline_scan.image_data))
        current_image = Image.open(io.BytesIO(current_image_data))
        
        # Preprocess images
        baseline_processed = preprocess_image(np.array(baseline_image))
        current_processed = preprocess_image(np.array(current_image))
        
        # Detect changes
        changes, change_mask, visualization = detect_changes(
            baseline_processed, 
            current_processed
        )
        
        # Detect objects in areas with changes
        objects_detected = detect_objects(current_processed, changes)
        
        # Save the new scan if requested
        new_scan_id = None
        if data.get('save_scan', False):
            new_scan = Scan(
                name=data.get('name', f"Comparison with {baseline_scan.name}"),
                description=data.get('description', ''),
                image_data=current_image_data,
                is_baseline=False,
                location=data.get('location', baseline_scan.location)
            )
            db.session.add(new_scan)
            db.session.commit()
            new_scan_id = new_scan.id
            
            # Save detected changes
            for i, change in enumerate(changes):
                change_log = ChangeLog(
                    scan_id=new_scan.id,
                    baseline_id=baseline_id,
                    change_type=change['type'],
                    object_type=objects_detected[i]['label'] if i < len(objects_detected) else 'unknown',
                    confidence=objects_detected[i]['confidence'] if i < len(objects_detected) else 0.0,
                    position_x=change['x'],
                    position_y=change['y'],
                    size_w=change['width'],
                    size_h=change['height']
                )
                db.session.add(change_log)
            
            db.session.commit()
        
        # Convert visualization to base64 for return
        visualization_buffer = io.BytesIO()
        visualization_image = Image.fromarray(visualization)
        visualization_image.save(visualization_buffer, format='PNG')
        visualization_base64 = base64.b64encode(visualization_buffer.getvalue()).decode('utf-8')
        
        return jsonify({
            'success': True,
            'scan_id': new_scan_id,
            'changes': changes,
            'objects': objects_detected,
            'visualization': f'data:image/png;base64,{visualization_base64}',
            'change_count': len(changes)
        })
        
    except Exception as e:
        logger.error(f"Error comparing scans: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error comparing scans: {str(e)}'
        }), 500

@app.route('/api/session/create', methods=['POST'])
def create_session():
    """API endpoint to create a new scanning session"""
    try:
        data = request.json
        
        # Create new session
        new_session = ScanSession(
            name=data.get('name', f"Session {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"),
            location=data.get('location', 'Unknown')
        )
        
        db.session.add(new_session)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'session_id': new_session.id,
            'message': 'Session created successfully'
        })
        
    except Exception as e:
        logger.error(f"Error creating session: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error creating session: {str(e)}'
        }), 500

@app.route('/api/scan/<int:scan_id>')
def get_scan(scan_id):
    """API endpoint to get a specific scan"""
    try:
        scan = Scan.query.get(scan_id)
        if not scan:
            return jsonify({
                'success': False,
                'message': 'Scan not found'
            }), 404
            
        # Convert image to base64
        image_base64 = base64.b64encode(scan.image_data).decode('utf-8')
        
        # Get related changes
        changes = ChangeLog.query.filter_by(scan_id=scan_id).all()
        changes_data = [{
            'id': change.id,
            'type': change.change_type,
            'object_type': change.object_type,
            'confidence': change.confidence,
            'position_x': change.position_x,
            'position_y': change.position_y,
            'size_w': change.size_w,
            'size_h': change.size_h
        } for change in changes]
        
        return jsonify({
            'success': True,
            'scan': {
                'id': scan.id,
                'name': scan.name,
                'description': scan.description,
                'timestamp': scan.timestamp.isoformat(),
                'is_baseline': scan.is_baseline,
                'location': scan.location,
                'image': f'data:image/jpeg;base64,{image_base64}'
            },
            'changes': changes_data
        })
        
    except Exception as e:
        logger.error(f"Error retrieving scan: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error retrieving scan: {str(e)}'
        }), 500

@app.route('/api/baseline-scans')
def get_baseline_scans():
    """API endpoint to get all baseline scans"""
    try:
        baselines = Scan.query.filter_by(is_baseline=True).order_by(Scan.timestamp.desc()).all()
        baselines_data = [{
            'id': baseline.id,
            'name': baseline.name,
            'timestamp': baseline.timestamp.isoformat(),
            'location': baseline.location
        } for baseline in baselines]
        
        return jsonify({
            'success': True,
            'baselines': baselines_data
        })
        
    except Exception as e:
        logger.error(f"Error retrieving baseline scans: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Error retrieving baseline scans: {str(e)}'
        }), 500
