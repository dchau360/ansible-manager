import os
import yaml
import json
import tempfile
import threading
from datetime import datetime
from ansible_runner import run
from models import db, PlaybookExecution, Node, NodeGroup

class AnsibleRunner:
    def __init__(self, socketio):
        self.socketio = socketio
        
    def ping_node(self, node):
        """Test connectivity to a single node"""
        inventory = {
            'all': {
                'hosts': {
                    node.hostname: {
                        'ansible_host': node.hostname,
                        'ansible_user': node.username,
                        'ansible_port': node.port,
                        'ansible_ssh_common_args': '-o StrictHostKeyChecking=no'
                    }
                }
            }
        }
        
        with tempfile.TemporaryDirectory() as temp_dir:
            inventory_file = os.path.join(temp_dir, 'inventory.yml')
            with open(inventory_file, 'w') as f:
                yaml.dump(inventory, f)
            
            try:
                result = run(
                    module='ping',
                    inventory=inventory_file,
                    host_pattern=node.hostname,
                    quiet=True
                )
                
                if result.status == 'successful':
                    node.status = 'reachable'
                else:
                    node.status = 'unreachable'
                    
            except Exception as e:
                node.status = 'unreachable'
                
            node.last_checked = datetime.utcnow()
            db.session.commit()
            
        return node.status == 'reachable'
    
    def execute_playbooks(self, execution_id):
        """Execute playbooks in background thread"""
        def run_execution():
            execution = PlaybookExecution.query.get(execution_id)
            if not execution:
                return
            
            try:
                execution.status = 'running'
                db.session.commit()
                
                # Emit status update
                self.socketio.emit('execution_status', {
                    'execution_id': execution_id,
                    'status': 'running',
                    'message': 'Execution started'
                })
                
                # Build inventory
                inventory = self._build_inventory(execution.target_nodes, execution.target_groups)
                
                # Create temporary directory for execution
                with tempfile.TemporaryDirectory() as temp_dir:
                    inventory_file = os.path.join(temp_dir, 'inventory.yml')
                    with open(inventory_file, 'w') as f:
                        yaml.dump(inventory, f)
                    
                    # Execute each playbook
                    all_output = []
                    all_errors = []
                    
                    for playbook_name in execution.playbooks:
                        playbook_path = os.path.join('/app/playbooks', playbook_name)
                        
                        if not os.path.exists(playbook_path):
                            error_msg = f"Playbook {playbook_name} not found"
                            all_errors.append(error_msg)
                            continue
                        
                        # Emit progress update
                        self.socketio.emit('execution_progress', {
                            'execution_id': execution_id,
                            'current_playbook': playbook_name,
                            'message': f'Executing {playbook_name}'
                        })
                        
                        try:
                            result = run(
                                playbook=playbook_path,
                                inventory=inventory_file,
                                quiet=False
                            )
                            
                            # Collect output
                            if result.stdout:
                                all_output.append(f"=== {playbook_name} ===\n{result.stdout.read()}")
                            
                            if result.stderr:
                                all_errors.append(f"=== {playbook_name} ERRORS ===\n{result.stderr.read()}")
                                
                            if result.status != 'successful':
                                all_errors.append(f"Playbook {playbook_name} failed with status: {result.status}")
                                
                        except Exception as e:
                            error_msg = f"Error executing {playbook_name}: {str(e)}"
                            all_errors.append(error_msg)
                    
                    # Update execution results
                    execution.output = '\n\n'.join(all_output)
                    execution.error_output = '\n\n'.join(all_errors) if all_errors else None
                    execution.status = 'failed' if all_errors else 'completed'
                    execution.completed_at = datetime.utcnow()
                    
                    db.session.commit()
                    
                    # Emit completion status
                    self.socketio.emit('execution_complete', {
                        'execution_id': execution_id,
                        'status': execution.status,
                        'output': execution.output,
                        'errors': execution.error_output
                    })
                    
            except Exception as e:
                execution.status = 'failed'
                execution.error_output = str(e)
                execution.completed_at = datetime.utcnow()
                db.session.commit()
                
                self.socketio.emit('execution_complete', {
                    'execution_id': execution_id,
                    'status': 'failed',
                    'error': str(e)
                })
        
        # Start execution in background thread
        thread = threading.Thread(target=run_execution)
        thread.start()
    
    def _build_inventory(self, target_nodes, target_groups):
        """Build Ansible inventory from target nodes and groups"""
        inventory = {'all': {'hosts': {}, 'children': {}}}
        
        # Add individual nodes
        if target_nodes:
            nodes = Node.query.filter(Node.id.in_(target_nodes)).all()
            for node in nodes:
                inventory['all']['hosts'][node.hostname] = {
                    'ansible_host': node.hostname,
                    'ansible_user': node.username,
                    'ansible_port': node.port,
                    'ansible_ssh_common_args': '-o StrictHostKeyChecking=no'
                }
        
        # Add groups and their nodes
        if target_groups:
            groups = NodeGroup.query.filter(NodeGroup.id.in_(target_groups)).all()
            for group in groups:
                group_hosts = {}
                for node in group.nodes:
                    group_hosts[node.hostname] = {
                        'ansible_host': node.hostname,
                        'ansible_user': node.username,
                        'ansible_port': node.port,
                        'ansible_ssh_common_args': '-o StrictHostKeyChecking=no'
                    }
                
                inventory['all']['children'][group.name] = {
                    'hosts': group_hosts
                }
        
        return inventory
