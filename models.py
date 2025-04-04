from datetime import datetime
from app import db

class Scan(db.Model):
    """Model for storing scan data"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255))
    image_data = db.Column(db.LargeBinary, nullable=False)  # Store base64 encoded image
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    is_baseline = db.Column(db.Boolean, default=False)
    location = db.Column(db.String(100))
    
    # Relationship with ChangeLogs, using scan_id as the foreign key
    changes = db.relationship('ChangeLog', 
                             foreign_keys='ChangeLog.scan_id',
                             backref='scan', 
                             lazy=True)

    def __repr__(self):
        return f'<Scan {self.name}>'

class ChangeLog(db.Model):
    """Model for storing detected changes"""
    id = db.Column(db.Integer, primary_key=True)
    scan_id = db.Column(db.Integer, db.ForeignKey('scan.id'), nullable=False)
    baseline_id = db.Column(db.Integer, db.ForeignKey('scan.id'), nullable=False)
    change_type = db.Column(db.String(20), nullable=False)  # "added", "removed", "moved"
    object_type = db.Column(db.String(50))  # Identified object type
    confidence = db.Column(db.Float)  # Confidence score for object detection
    position_x = db.Column(db.Integer)  # X coordinate of change
    position_y = db.Column(db.Integer)  # Y coordinate of change
    size_w = db.Column(db.Integer)  # Width of the changed region
    size_h = db.Column(db.Integer)  # Height of the changed region
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Reference to baseline scan
    baseline = db.relationship('Scan', foreign_keys=[baseline_id], backref='compared_changes')
    
    def __repr__(self):
        return f'<ChangeLog {self.id} - {self.change_type}>'

class ScanSession(db.Model):
    """Model for grouping scans in a session"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    location = db.Column(db.String(100))
    
    # Relationship with Scans
    scans = db.relationship('Scan', secondary='session_scan', backref='sessions')
    
    def __repr__(self):
        return f'<ScanSession {self.name}>'

# Association table for many-to-many relationship between sessions and scans
session_scan = db.Table('session_scan',
    db.Column('session_id', db.Integer, db.ForeignKey('scan_session.id'), primary_key=True),
    db.Column('scan_id', db.Integer, db.ForeignKey('scan.id'), primary_key=True)
)
