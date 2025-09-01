from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import json

db = SQLAlchemy()

# Association table for many-to-many relationship between nodes and groups
node_group_members = db.Table('node_group_members',
    db.Column('node_id', db.Integer, db.ForeignKey('node.id'), primary_key=True),
    db.Column('group_id', db.Integer, db.ForeignKey('node_group.id'), primary_key=True)
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'is_admin': self.is_admin,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }

class Node(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    hostname = db.Column(db.String(255), nullable=False)
    username = db.Column(db.String(100), nullable=False)
    port = db.Column(db.Integer, default=22)
    description = db.Column(db.Text)
    status = db.Column(db.String(20), default='unknown')  # reachable, unreachable, unknown
    last_checked = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Many-to-many relationship with groups
    groups = db.relationship('NodeGroup', secondary=node_group_members, 
                           back_populates='nodes', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'hostname': self.hostname,
            'username': self.username,
            'port': self.port,
            'description': self.description,
            'status': self.status,
            'last_checked': self.last_checked.isoformat() if self.last_checked else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'groups': [g.name for g in self.groups]
        }

class NodeGroup(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Many-to-many relationship with nodes
    nodes = db.relationship('Node', secondary=node_group_members, 
                          back_populates='groups', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'node_count': self.nodes.count(),
            'nodes': [n.to_dict() for n in self.nodes]
        }

class PlaybookExecution(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    playbooks = db.Column(db.JSON, nullable=False)  # List of playbook names
    target_nodes = db.Column(db.JSON, nullable=True)  # List of node IDs
    target_groups = db.Column(db.JSON, nullable=True)  # List of group IDs
    status = db.Column(db.String(20), default='pending')  # pending, running, completed, failed, cancelled
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    output = db.Column(db.Text)
    error_output = db.Column(db.Text)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    
    user = db.relationship('User', backref='executions')

    def to_dict(self):
        return {
            'id': self.id,
            'playbooks': self.playbooks,
            'target_nodes': self.target_nodes,
            'target_groups': self.target_groups,
            'status': self.status,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'output': self.output,
            'error_output': self.error_output,
            'duration': self._get_duration()
        }
    
    def _get_duration(self):
        if self.completed_at and self.started_at:
            delta = self.completed_at - self.started_at
            return str(delta)
        return None

class InventoryImport(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    format = db.Column(db.String(20), nullable=False)  # yaml, ini, json, paste
    total_nodes = db.Column(db.Integer, default=0)
    total_groups = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='pending')  # pending, completed, failed, rolled_back
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    imported_at = db.Column(db.DateTime)
    rolled_back_at = db.Column(db.DateTime)
    created_nodes = db.Column(db.JSON)  # List of created node IDs
    created_groups = db.Column(db.JSON)  # List of created group IDs
    error_message = db.Column(db.Text)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    
    user = db.relationship('User', backref='imports')

    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'format': self.format,
            'total_nodes': self.total_nodes,
            'total_groups': self.total_groups,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'imported_at': self.imported_at.isoformat() if self.imported_at else None,
            'rolled_back_at': self.rolled_back_at.isoformat() if self.rolled_back_at else None,
            'created_nodes': self.created_nodes,
            'created_groups': self.created_groups,
            'error_message': self.error_message
        }
