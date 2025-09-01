import os
import yaml
import json
import configparser
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge

from config import config
from models import db, User, Node, NodeGroup, PlaybookExecution, InventoryImport
from ansible_runner import AnsibleRunner
from auth import token_required, admin_required

def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # Initialize extensions
    db.init_app(app)
    CORS(app, origins="*")
    jwt = JWTManager(app)
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')
    
    # Initialize Ansible runner
    ansible_runner = AnsibleRunner(socketio)
    
    # Create tables and default admin user
    with app.app_context():
        db.create_all()
        
        # Create default admin user if no users exist
        if User.query.count() == 0:
            admin_user = User(
                username='admin',
                email='admin@localhost',
                is_admin=True
            )
            admin_user.set_password('admin123')  # Change this in production
            db.session.add(admin_user)
            db.session.commit()
            print("Default admin user created: admin/admin123")
    
    # Helper functions
    def allowed_file(filename):
        return '.' in filename and \
               filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']
    
    # Authentication routes
    @app.route('/api/auth/login', methods=['POST'])
    def login():
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'message': 'Username and password required'}), 400
        
        user = User.query.filter_by(username=username).first()
        
        if user and user.check_password(password):
            user.last_login = datetime.utcnow()
            db.session.commit()
            
            access_token = create_access_token(identity=user.id)
            return jsonify({
                'access_token': access_token,
                'user': user.to_dict()
            })
        
        return jsonify({'message': 'Invalid credentials'}), 401
    
    @app.route('/api/auth/register', methods=['POST'])
    def register():
        # Only allow registration if no admin users exist (first-time setup)
        if User.query.filter_by(is_admin=True).count() > 0:
            return jsonify({'message': 'Registration disabled'}), 403
        
        data = request.get_json()
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        
        if not all([username, email, password]):
            return jsonify({'message': 'All fields required'}), 400
        
        if User.query.filter_by(username=username).first():
            return jsonify({'message': 'Username already exists'}), 400
        
        if User.query.filter_by(email=email).first():
            return jsonify({'message': 'Email already exists'}), 400
        
        user = User(username=username, email=email, is_admin=True)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        
        access_token = create_access_token(identity=user.id)
        return jsonify({
            'access_token': access_token,
            'user': user.to_dict()
        })
    
    @app.route('/api/auth/me')
    @token_required
    def get_current_user(current_user):
        return jsonify(current_user.to_dict())
    
    # Playbook routes
    @app.route('/api/playbooks', methods=['GET'])
    @token_required
    def list_playbooks(current_user):
        playbooks_dir = app.config['UPLOAD_FOLDER']
        if not os.path.exists(playbooks_dir):
            os.makedirs(playbooks_dir)
        
        playbooks = []
        for filename in os.listdir(playbooks_dir):
            if filename.endswith(('.yml', '.yaml')):
                file_path = os.path.join(playbooks_dir, filename)
                stat = os.stat(file_path)
                playbooks.append({
                    'name': filename,
                    'size': stat.st_size,
                    'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
        
        return jsonify(playbooks)
    
    @app.route('/api/playbooks', methods=['POST'])
    @token_required
    def upload_playbook(current_user):
        if 'file' not in request.files:
            return jsonify({'message': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'message': 'No file selected'}), 400
        
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            
            # Ensure directory exists
            os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
            
            try:
                file.save(file_path)
                
                # Validate YAML
                with open(file_path, 'r') as f:
                    yaml.safe_load(f)
                
                return jsonify({'message': 'Playbook uploaded successfully', 'filename': filename})
            
            except yaml.YAMLError as e:
                os.remove(file_path)
                return jsonify({'message': f'Invalid YAML: {str(e)}'}), 400
            except Exception as e:
                if os.path.exists(file_path):
                    os.remove(file_path)
                return jsonify({'message': f'Upload failed: {str(e)}'}), 500
        
        return jsonify({'message': 'Invalid file type'}), 400
    
    @app.route('/api/playbooks/<filename>')
    @token_required
    def get_playbook(current_user, filename):
        try:
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
            with open(file_path, 'r') as f:
                content = f.read()
            return jsonify({'content': content})
        except FileNotFoundError:
            return jsonify({'message': 'Playbook not found'}), 404
        except Exception as e:
            return jsonify({'message': str(e)}), 500
    
    @app.route('/api/playbooks/<filename>', methods=['PUT'])
    @token_required
    def update_playbook(current_user, filename):
        data = request.get_json()
        content = data.get('content')
        
        if not content:
            return jsonify({'message': 'Content is required'}), 400
        
        try:
            # Validate YAML
            yaml.safe_load(content)
            
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
            with open(file_path, 'w') as f:
                f.write(content)
            
            return jsonify({'message': 'Playbook updated successfully'})
        
        except yaml.YAMLError as e:
            return jsonify({'message': f'Invalid YAML: {str(e)}'}), 400
        except Exception as e:
            return jsonify({'message': str(e)}), 500
    
    @app.route('/api/playbooks/<filename>', methods=['DELETE'])
    @token_required
    def delete_playbook(current_user, filename):
        try:
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
            os.remove(file_path)
            return jsonify({'message': 'Playbook deleted successfully'})
        except FileNotFoundError:
            return jsonify({'message': 'Playbook not found'}), 404
        except Exception as e:
            return jsonify({'message': str(e)}), 500
    
    @app.route('/api/playbooks/create', methods=['POST'])
    @token_required
    def create_playbook(current_user):
        data = request.get_json()
        filename = data.get('filename')
        
        if not filename:
            return jsonify({'message': 'Filename is required'}), 400
        
        if not filename.endswith(('.yml', '.yaml')):
            filename += '.yml'
        
        filename = secure_filename(filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        if os.path.exists(file_path):
            return jsonify({'message': 'File already exists'}), 400
        
        # Default playbook template
        template = '''---
- name: Example Playbook
  hosts: all
  become: yes
  tasks:
    - name: Ensure system is up to date
      package:
        name: "*"
        state: latest
      when: ansible_os_family == "RedHat"
    
    - name: Update apt cache
      apt:
        update_cache: yes
      when: ansible_os_family == "Debian"
'''
        
        try:
            os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
            with open(file_path, 'w') as f:
                f.write(template)
            
            return jsonify({'message': 'Playbook created successfully', 'filename': filename})
        except Exception as e:
            return jsonify({'message': str(e)}), 500
    
    # Node routes
    @app.route('/api/nodes', methods=['GET'])
    @token_required
    def list_nodes(current_user):
        nodes = Node.query.all()
        return jsonify([node.to_dict() for node in nodes])
    
    @app.route('/api/nodes', methods=['POST'])
    @token_required
    def create_node(current_user):
        data = request.get_json()
        
        required_fields = ['name', 'hostname', 'username']
        if not all(field in data for field in required_fields):
            return jsonify({'message': 'Name, hostname, and username are required'}), 400
        
        node = Node(
            name=data['name'],
            hostname=data['hostname'],
            username=data['username'],
            port=data.get('port', 22),
            description=data.get('description', '')
        )
        
        db.session.add(node)
        db.session.commit()
        
        return jsonify(node.to_dict()), 201
    
    @app.route('/api/nodes/<int:node_id>', methods=['GET'])
    @token_required
    def get_node(current_user, node_id):
        node = Node.query.get_or_404(node_id)
        return jsonify(node.to_dict())
    
    @app.route('/api/nodes/<int:node_id>', methods=['PUT'])
    @token_required
    def update_node(current_user, node_id):
        node = Node.query.get_or_404(node_id)
        data = request.get_json()
        
        node.name = data.get('name', node.name)
        node.hostname = data.get('hostname', node.hostname)
        node.username = data.get('username', node.username)
        node.port = data.get('port', node.port)
        node.description = data.get('description', node.description)
        node.updated_at = datetime.utcnow()
        
        db.session.commit()
        return jsonify(node.to_dict())
    
    @app.route('/api/nodes/<int:node_id>', methods=['DELETE'])
    @token_required
    def delete_node(current_user, node_id):
        node = Node.query.get_or_404(node_id)
        db.session.delete(node)
        db.session.commit()
        return jsonify({'message': 'Node deleted successfully'})
    
    @app.route('/api/nodes/<int:node_id>/ping', methods=['POST'])
    @token_required
    def ping_node(current_user, node_id):
        node = Node.query.get_or_404(node_id)
        
        def ping_and_emit():
            success = ansible_runner.ping_node(node)
            socketio.emit('node_ping_result', {
                'node_id': node_id,
                'status': node.status,
                'success': success
            })
        
        import threading
        thread = threading.Thread(target=ping_and_emit)
        thread.start()
        
        return jsonify({'message': 'Ping started', 'node_id': node_id})
    
    # Group routes
    @app.route('/api/groups', methods=['GET'])
    @token_required
    def list_groups(current_user):
        groups = NodeGroup.query.all()
        return jsonify([group.to_dict() for group in groups])
    
    @app.route('/api/groups', methods=['POST'])
    @token_required
    def create_group(current_user):
        data = request.get_json()
        
        if not data.get('name'):
            return jsonify({'message': 'Group name is required'}), 400
        
        if NodeGroup.query.filter_by(name=data['name']).first():
            return jsonify({'message': 'Group name already exists'}), 400
        
        group = NodeGroup(
            name=data['name'],
            description=data.get('description', '')
        )
        
        db.session.add(group)
        db.session.commit()
        
        return jsonify(group.to_dict()), 201
    
    @app.route('/api/groups/<int:group_id>', methods=['GET'])
    @token_required
    def get_group(current_user, group_id):
        group = NodeGroup.query.get_or_404(group_id)
        return jsonify(group.to_dict())
    
    @app.route('/api/groups/<int:group_id>', methods=['PUT'])
    @token_required
    def update_group(current_user, group_id):
        group = NodeGroup.query.get_or_404(group_id)
        data = request.get_json()
        
        # Check if name is being changed and if it conflicts
        if data.get('name') != group.name:
            if NodeGroup.query.filter_by(name=data['name']).first():
                return jsonify({'message': 'Group name already exists'}), 400
        
        group.name = data.get('name', group.name)
        group.description = data.get('description', group.description)
        group.updated_at = datetime.utcnow()
        
        db.session.commit()
        return jsonify(group.to_dict())
    
    @app.route('/api/groups/<int:group_id>', methods=['DELETE'])
    @token_required
    def delete_group(current_user, group_id):
        group = NodeGroup.query.get_or_404(group_id)
        db.session.delete(group)
        db.session.commit()
        return jsonify({'message': 'Group deleted successfully'})
    
    @app.route('/api/groups/<int:group_id>/nodes', methods=['POST'])
    @token_required
    def add_nodes_to_group(current_user, group_id):
        group = NodeGroup.query.get_or_404(group_id)
        data = request.get_json()
        node_ids = data.get('node_ids', [])
        
        for node_id in node_ids:
            node = Node.query.get(node_id)
            if node and node not in group.nodes:
                group.nodes.append(node)
        
        db.session.commit()
        return jsonify(group.to_dict())
    
    @app.route('/api/groups/<int:group_id>/nodes/<int:node_id>', methods=['DELETE'])
    @token_required
    def remove_node_from_group(current_user, group_id, node_id):
        group = NodeGroup.query.get_or_404(group_id)
        node = Node.query.get_or_404(node_id)
        
        if node in group.nodes:
            group.nodes.remove(node)
            db.session.commit()
        
        return jsonify(group.to_dict())
    
    # Execution routes
    @app.route('/api/executions', methods=['GET'])
    @token_required
    def list_executions(current_user):
        executions = PlaybookExecution.query.order_by(PlaybookExecution.started_at.desc()).all()
        return jsonify([execution.to_dict() for execution in executions])
    
    @app.route('/api/executions', methods=['POST'])
    @token_required
    def create_execution(current_user):
        data = request.get_json()
        
        playbooks = data.get('playbooks', [])
        target_nodes = data.get('target_nodes', [])
        target_groups = data.get('target_groups', [])
        
        if not playbooks:
            return jsonify({'message': 'At least one playbook is required'}), 400
        
        if not target_nodes and not target_groups:
            return jsonify({'message': 'At least one target node or group is required'}), 400
        
        execution = PlaybookExecution(
            playbooks=playbooks,
            target_nodes=target_nodes if target_nodes else None,
            target_groups=target_groups if target_groups else None,
            user_id=current_user.id
        )
        
        db.session.add(execution)
        db.session.commit()
        
        # Start execution in background
        ansible_runner.execute_playbooks(execution.id)
        
        return jsonify(execution.to_dict()), 201
    
    @app.route('/api/executions/<int:execution_id>')
    @token_required
    def get_execution(current_user, execution_id):
        execution = PlaybookExecution.query.get_or_404(execution_id)
        return jsonify(execution.to_dict())
    
    @app.route('/api/executions/<int:execution_id>/cancel', methods=['POST'])
    @token_required
    def cancel_execution(current_user, execution_id):
        execution = PlaybookExecution.query.get_or_404(execution_id)
        
        if execution.status in ['pending', 'running']:
            execution.status = 'cancelled'
            execution.completed_at = datetime.utcnow()
            db.session.commit()
            
            socketio.emit('execution_cancelled', {'execution_id': execution_id})
        
        return jsonify(execution.to_dict())
    
    # Inventory import routes
    @app.route('/api/inventory/imports', methods=['GET'])
    @token_required
    def list_imports(current_user):
        imports = InventoryImport.query.order_by(InventoryImport.created_at.desc()).all()
        return jsonify([imp.to_dict() for imp in imports])
    
    @app.route('/api/inventory/upload', methods=['POST'])
    @token_required
    def upload_inventory(current_user):
        if 'file' not in request.files:
            return jsonify({'message': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'message': 'No file selected'}), 400
        
        filename = secure_filename(file.filename)
        file_extension = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
        
        if file_extension not in ['yml', 'yaml', 'ini', 'json']:
            return jsonify({'message': 'Unsupported file format'}), 400
        
        # Save file
        inventory_dir = app.config['INVENTORY_FOLDER']
        os.makedirs(inventory_dir, exist_ok=True)
        
        file_path = os.path.join(inventory_dir, f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}")
        file.save(file_path)
        
        # Create import record
        inventory_import = InventoryImport(
            filename=filename,
            file_path=file_path,
            format=file_extension,
            user_id=current_user.id
        )
        
        db.session.add(inventory_import)
        db.session.commit()
        
        # Parse and preview
        try:
            preview = parse_inventory_file(file_path, file_extension)
            return jsonify({
                'import_id': inventory_import.id,
                'preview': preview
            })
        except Exception as e:
            inventory_import.status = 'failed'
            inventory_import.error_message = str(e)
            db.session.commit()
            return jsonify({'message': f'Failed to parse inventory: {str(e)}'}), 400
    
    @app.route('/api/inventory/paste', methods=['POST'])
    @token_required
    def paste_inventory(current_user):
        data = request.get_json()
        content = data.get('content', '')
        format_type = data.get('format', 'yaml')
        
        if not content.strip():
            return jsonify({'message': 'Content is required'}), 400
        
        # Save content to file
        inventory_dir = app.config['INVENTORY_FOLDER']
        os.makedirs(inventory_dir, exist_ok=True)
        
        filename = f"pasted_inventory_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{format_type}"
        file_path = os.path.join(inventory_dir, filename)
        
        with open(file_path, 'w') as f:
            f.write(content)
        
        # Create import record
        inventory_import = InventoryImport(
            filename=filename,
            file_path=file_path,
            format=format_type,
            user_id=current_user.id
        )
        
        db.session.add(inventory_import)
        db.session.commit()
        
        # Parse and preview
        try:
            preview = parse_inventory_file(file_path, format_type)
            return jsonify({
                'import_id': inventory_import.id,
                'preview': preview
            })
        except Exception as e:
            inventory_import.status = 'failed'
            inventory_import.error_message = str(e)
            db.session.commit()
            return jsonify({'message': f'Failed to parse inventory: {str(e)}'}), 400
    
    @app.route('/api/inventory/imports/<int:import_id>/execute', methods=['POST'])
    @token_required
    def execute_import(current_user, import_id):
        inventory_import = InventoryImport.query.get_or_404(import_id)
        
        if inventory_import.status != 'pending':
            return jsonify({'message': 'Import already processed'}), 400
        
        try:
            # Parse inventory file
            nodes_data, groups_data = parse_inventory_for_import(inventory_import.file_path, inventory_import.format)
            
            created_nodes = []
            created_groups = []
            
            # Create groups first
            for group_name, group_info in groups_data.items():
                existing_group = NodeGroup.query.filter_by(name=group_name).first()
                if not existing_group:
                    group = NodeGroup(
                        name=group_name,
                        description=f'Imported from {inventory_import.filename}'
                    )
                    db.session.add(group)
                    db.session.flush()  # Get the ID
                    created_groups.append(group.id)
            
            # Create nodes
            for node_info in nodes_data:
                existing_node = Node.query.filter_by(hostname=node_info['hostname']).first()
                if not existing_node:
                    node = Node(
                        name=node_info['name'],
                        hostname=node_info['hostname'],
                        username=node_info.get('username', 'root'),
                        port=node_info.get('port', 22),
                        description=f'Imported from {inventory_import.filename}'
                    )
                    db.session.add(node)
                    db.session.flush()  # Get the ID
                    created_nodes.append(node.id)
                    
                    # Add to groups
                    for group_name in node_info.get('groups', []):
                        group = NodeGroup.query.filter_by(name=group_name).first()
                        if group:
                            group.nodes.append(node)
            
            # Update import record
            inventory_import.status = 'completed'
            inventory_import.imported_at = datetime.utcnow()
            inventory_import.total_nodes = len(created_nodes)
            inventory_import.total_groups = len(created_groups)
            inventory_import.created_nodes = created_nodes
            inventory_import.created_groups = created_groups
            
            db.session.commit()
            
            return jsonify({
                'message': 'Import completed successfully',
                'created_nodes': len(created_nodes),
                'created_groups': len(created_groups)
            })
        
        except Exception as e:
            inventory_import.status = 'failed'
            inventory_import.error_message = str(e)
            db.session.commit()
            return jsonify({'message': f'Import failed: {str(e)}'}), 500
    
    @app.route('/api/inventory/imports/<int:import_id>/rollback', methods=['POST'])
    @token_required
    def rollback_import(current_user, import_id):
        inventory_import = InventoryImport.query.get_or_404(import_id)
        
        if inventory_import.status != 'completed':
            return jsonify({'message': 'Can only rollback completed imports'}), 400
        
        try:
            # Delete created nodes
            if inventory_import.created_nodes:
                Node.query.filter(Node.id.in_(inventory_import.created_nodes)).delete(synchronize_session=False)
            
            # Delete created groups
            if inventory_import.created_groups:
                NodeGroup.query.filter(NodeGroup.id.in_(inventory_import.created_groups)).delete(synchronize_session=False)
            
            inventory_import.status = 'rolled_back'
            inventory_import.rolled_back_at = datetime.utcnow()
            
            db.session.commit()
            
            return jsonify({'message': 'Import rolled back successfully'})
        
        except Exception as e:
            return jsonify({'message': f'Rollback failed: {str(e)}'}), 500
    
    def parse_inventory_file(file_path, file_format):
        """Parse inventory file and return preview data"""
        with open(file_path, 'r') as f:
            content = f.read()
        
        nodes = []
        groups = {}
        
        try:
            if file_format in ['yml', 'yaml']:
                data = yaml.safe_load(content)
                nodes, groups = parse_yaml_inventory(data)
            elif file_format == 'ini':
                nodes, groups = parse_ini_inventory(content)
            elif file_format == 'json':
                data = json.loads(content)
                nodes, groups = parse_json_inventory(data)
        except Exception as e:
            raise Exception(f"Failed to parse {file_format} format: {str(e)}")
        
        return {
            'nodes': nodes,
            'groups': groups,
            'total_nodes': len(nodes),
            'total_groups': len(groups)
        }
    
    def parse_inventory_for_import(file_path, file_format):
        """Parse inventory file for actual import"""
        with open(file_path, 'r') as f:
            content = f.read()
        
        if file_format in ['yml', 'yaml']:
            data = yaml.safe_load(content)
            return parse_yaml_inventory_for_db(data)
        elif file_format == 'ini':
            return parse_ini_inventory_for_db(content)
        elif file_format == 'json':
            data = json.loads(content)
            return parse_json_inventory_for_db(data)
    
    def parse_yaml_inventory(data):
        """Parse YAML inventory for preview"""
        nodes = []
        groups = {}
        
        if 'all' in data and 'hosts' in data['all']:
            for host_name, host_vars in data['all']['hosts'].items():
                nodes.append({
                    'name': host_name,
                    'hostname': host_vars.get('ansible_host', host_name),
                    'username': host_vars.get('ansible_user', 'root'),
                    'port': host_vars.get('ansible_port', 22)
                })
        
        if 'all' in data and 'children' in data['all']:
            for group_name, group_data in data['all']['children'].items():
                groups[group_name] = {
                    'name': group_name,
                    'nodes': list(group_data.get('hosts', {}).keys())
                }
        
        return nodes, groups
    
    def parse_yaml_inventory_for_db(data):
        """Parse YAML inventory for database import"""
        nodes_data = []
        groups_data = {}
        
        # Parse all hosts
        if 'all' in data and 'hosts' in data['all']:
            for host_name, host_vars in data['all']['hosts'].items():
                nodes_data.append({
                    'name': host_name,
                    'hostname': host_vars.get('ansible_host', host_name),
                    'username': host_vars.get('ansible_user', 'root'),
                    'port': host_vars.get('ansible_port', 22),
                    'groups': []
                })
        
        # Parse groups
        if 'all' in data and 'children' in data['all']:
            for group_name, group_data in data['all']['children'].items():
                groups_data[group_name] = {'hosts': []}
                
                if 'hosts' in group_data:
                    for host_name, host_vars in group_data['hosts'].items():
                        # Add host to nodes if not already exists
                        existing_node = next((n for n in nodes_data if n['name'] == host_name), None)
                        if existing_node:
                            existing_node['groups'].append(group_name)
                        else:
                            nodes_data.append({
                                'name': host_name,
                                'hostname': host_vars.get('ansible_host', host_name),
                                'username': host_vars.get('ansible_user', 'root'),
                                'port': host_vars.get('ansible_port', 22),
                                'groups': [group_name]
                            })
        
        return nodes_data, groups_data
    
    def parse_ini_inventory(content):
        """Parse INI inventory for preview"""
        config = configparser.ConfigParser(allow_no_value=True)
        config.read_string(content)
        
        nodes = []
        groups = {}
        
        for section_name in config.sections():
            if section_name == 'all':
                for host_name in config[section_name]:
                    nodes.append({
                        'name': host_name,
                        'hostname': host_name,
                        'username': 'root',
                        'port': 22
                    })
            else:
                groups[section_name] = {
                    'name': section_name,
                    'nodes': list(config[section_name].keys())
                }
        
        return nodes, groups
    
    def parse_ini_inventory_for_db(content):
        """Parse INI inventory for database import"""
        config = configparser.ConfigParser(allow_no_value=True)
        config.read_string(content)
        
        nodes_data = []
        groups_data = {}
        
        for section_name in config.sections():
            if section_name == 'all':
                for host_name in config[section_name]:
                    nodes_data.append({
                        'name': host_name,
                        'hostname': host_name,
                        'username': 'root',
                        'port': 22,
                        'groups': []
                    })
            else:
                groups_data[section_name] = {'hosts': []}
                for host_name in config[section_name]:
                    existing_node = next((n for n in nodes_data if n['name'] == host_name), None)
                    if existing_node:
                        existing_node['groups'].append(section_name)
                    else:
                        nodes_data.append({
                            'name': host_name,
                            'hostname': host_name,
                            'username': 'root',
                            'port': 22,
                            'groups': [section_name]
                        })
        
        return nodes_data, groups_data
    
    def parse_json_inventory(data):
        """Parse JSON inventory for preview"""
        nodes = []
        groups = {}
        
        # Handle Ansible dynamic inventory format
        for key, value in data.items():
            if key == '_meta':
                continue
            elif isinstance(value, dict) and 'hosts' in value:
                # Group
                groups[key] = {
                    'name': key,
                    'nodes': value['hosts']
                }
            elif isinstance(value, list):
                # Simple group with host list
                groups[key] = {
                    'name': key,
                    'nodes': value
                }
        
        # Extract unique hosts
        all_hosts = set()
        for group_data in groups.values():
            all_hosts.update(group_data['nodes'])
        
        for host in all_hosts:
            nodes.append({
                'name': host,
                'hostname': host,
                'username': 'root',
                'port': 22
            })
        
        return nodes, groups
    
    def parse_json_inventory_for_db(data):
        """Parse JSON inventory for database import"""
        nodes_data = []
        groups_data = {}
        
        # Handle Ansible dynamic inventory format
        for key, value in data.items():
            if key == '_meta':
                continue
            elif isinstance(value, dict) and 'hosts' in value:
                # Group
                groups_data[key] = {'hosts': value['hosts']}
            elif isinstance(value, list):
                # Simple group with host list
                groups_data[key] = {'hosts': value}
        
        # Extract unique hosts and assign to groups
        all_hosts = {}
        for group_name, group_data in groups_data.items():
            for host in group_data['hosts']:
                if host not in all_hosts:
                    all_hosts[host] = {'groups': []}
                all_hosts[host]['groups'].append(group_name)
        
        for host_name, host_info in all_hosts.items():
            nodes_data.append({
                'name': host_name,
                'hostname': host_name,
                'username': 'root',
                'port': 22,
                'groups': host_info['groups']
            })
        
        return nodes_data, groups_data
    
    # Socket events
    @socketio.on('connect')
    def handle_connect():
        print('Client connected')
    
    @socketio.on('disconnect')
    def handle_disconnect():
        print('Client disconnected')
    
    # Error handlers
    @app.errorhandler(RequestEntityTooLarge)
    def handle_file_too_large(e):
        return jsonify({'message': 'File too large'}), 413
    
    @app.errorhandler(404)
    def handle_not_found(e):
        return jsonify({'message': 'Resource not found'}), 404
    
    @app.errorhandler(500)
    def handle_server_error(e):
        return jsonify({'message': 'Internal server error'}), 500
    
    return app, socketio

if __name__ == '__main__':
    app, socketio = create_app()
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
