import { api } from '../api.js';
import { showToast } from '../utils/notifications.js';
import { Socket } from '../utils/socket.js';

export class NodesComponent {
    constructor() {
        this.nodes = [];
        this.selectedNodes = new Set();
        this.groups = [];
    }

    async render() {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Nodes</h3>
                    <div class="d-flex gap-2">
                        <button class="btn btn-primary" onclick="nodesComponent.showCreateModal()">
                            <i class="fas fa-plus"></i> Add Node
                        </button>
                        <button class="btn btn-success" onclick="nodesComponent.pingSelected()">
                            <i class="fas fa-satellite-dish"></i> Ping Selected
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div id="nodeSelectionActions" class="selection-actions hidden">
                        <span class="selection-info">
                            <span id="selectedNodeCount">0</span> node(s) selected
                        </span>
                        <button class="btn btn-warning btn-sm" onclick="nodesComponent.addToGroupModal()">
                            <i class="fas fa-users"></i> Add to Group
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="nodesComponent.deleteSelected()">
                            <i class="fas fa-trash"></i> Delete Selected
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="nodesComponent.clearSelection()">
                            Clear Selection
                        </button>
                    </div>
                    <div class="table-responsive">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>
                                        <label class="checkbox">
                                            <input type="checkbox" onchange="nodesComponent.toggleAllSelection(this)">
                                            <span class="checkmark"></span>
                                        </label>
                                    </th>
                                    <th>Name</th>
                                    <th>Hostname</th>
                                    <th>Username</th>
                                    <th>Port</th>
                                    <th>Status</th>
                                    <th>Groups</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="nodesTableBody">
                                <tr>
                                    <td colspan="8" class="text-center">
                                        <div class="loading">
                                            <i class="fas fa-spinner fa-spin"></i>
                                            <span>Loading nodes...</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    async init() {
        await Promise.all([
            this.loadNodes(),
            this.loadGroups()
        ]);
        this.setupSocketListeners();
    }

    async loadNodes() {
        try {
            const response = await api.getNodes();
            this.nodes = response.data;
            this.renderNodes();
        } catch (error) {
            showToast('Failed to load nodes', 'error');
            console.error(error);
        }
    }

    async loadGroups() {
        try {
            const response = await api.getGroups();
            this.groups = response.data;
        } catch (error) {
            console.error('Failed to load groups:', error);
        }
    }

    renderNodes() {
        const tbody = document.getElementById('nodesTableBody');
        
        if (this.nodes.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-muted">
                        No nodes found. Add your first node to get started.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.nodes.map(node => `
            <tr>
                <td>
                    <label class="checkbox">
                        <input type="checkbox" value="${node.id}" 
                               onchange="nodesComponent.toggleSelection(${node.id}, this)">
                        <span class="checkmark"></span>
                    </label>
                </td>
                <td><strong>${node.name}</strong></td>
                <td>${node.hostname}</td>
                <td>${node.username}</td>
                <td>${node.port}</td>
                <td>
                    <span class="status ${node.status}" id="nodeStatus${node.id}">
                        ${node.status}
                    </span>
                </td>
                <td>
                    <span class="text-muted">
                        ${node.groups ? node.groups.join(', ') : 'None'}
                    </span>
                </td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-secondary" onclick="nodesComponent.editNode(${node.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-success" onclick="nodesComponent.pingNode(${node.id})" title="Ping">
                            <i class="fas fa-satellite-dish"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="nodesComponent.deleteNode(${node.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    setupSocketListeners() {
        Socket.on('node_ping_result', (data) => {
            const statusElement = document.getElementById(`nodeStatus${data.node_id}`);
            if (statusElement) {
                statusElement.textContent = data.status;
                statusElement.className = `status ${data.status}`;
            }
            
            // Update local data
            const node = this.nodes.find(n => n.id === data.node_id);
            if (node) {
                node.status = data.status;
            }
            
            const message = data.success ? 'Node is reachable' : 'Node is unreachable';
            const type = data.success ? 'success' : 'warning';
            showToast(message, type);
        });
    }

    toggleSelection(nodeId, checkbox) {
        if (checkbox.checked) {
            this.selectedNodes.add(nodeId);
        } else {
            this.selectedNodes.delete(nodeId);
        }
        this.updateSelectionUI();
    }

    toggleAllSelection(checkbox) {
        const checkboxes = document.querySelectorAll('#nodesTableBody input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = checkbox.checked;
            const nodeId = parseInt(cb.value);
            if (checkbox.checked) {
                this.selectedNodes.add(nodeId);
            } else {
                this.selectedNodes.delete(nodeId);
            }
        });
        this.updateSelectionUI();
    }

    updateSelectionUI() {
        const selectionActions = document.getElementById('nodeSelectionActions');
        const selectedCount = document.getElementById('selectedNodeCount');
        
        if (this.selectedNodes.size > 0) {
            selectionActions.classList.remove('hidden');
            selectedCount.textContent = this.selectedNodes.size;
        } else {
            selectionActions.classList.add('hidden');
        }
    }

    clearSelection() {
        this.selectedNodes.clear();
        const checkboxes = document.querySelectorAll('#nodesTableBody input[type="checkbox"], thead input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
        this.updateSelectionUI();
    }

    showCreateModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Add New Node</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <form id="createNodeForm">
                    <div class="form-group">
                        <label for="nodeName">Name:</label>
                        <input type="text" id="nodeName" name="name" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="nodeHostname">Hostname/IP:</label>
                        <input type="text" id="nodeHostname" name="hostname" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="nodeUsername">SSH Username:</label>
                        <input type="text" id="nodeUsername" name="username" class="form-control" value="root" required>
                    </div>
                    <div class="form-group">
                        <label for="nodePort">SSH Port:</label>
                        <input type="number" id="nodePort" name="port" class="form-control" value="22" required>
                    </div>
                    <div class="form-group">
                        <label for="nodeDescription">Description:</label>
                        <textarea id="nodeDescription" name="description" class="form-control" rows="3"></textarea>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Add Node</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('createNodeForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const nodeData = Object.fromEntries(formData);

            try {
                await api.createNode(nodeData);
                showToast('Node added successfully', 'success');
                modal.remove();
                await this.loadNodes();
            } catch (error) {
                showToast(error.response?.data?.message || 'Failed to add node', 'error');
            }
        });
    }

    async editNode(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Edit Node</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <form id="editNodeForm">
                    <div class="form-group">
                        <label for="editNodeName">Name:</label>
                        <input type="text" id="editNodeName" name="name" class="form-control" value="${node.name}" required>
                    </div>
                    <div class="form-group">
                        <label for="editNodeHostname">Hostname/IP:</label>
                        <input type="text" id="editNodeHostname" name="hostname" class="form-control" value="${node.hostname}" required>
                    </div>
                    <div class="form-group">
                        <label for="editNodeUsername">SSH Username:</label>
                        <input type="text" id="editNodeUsername" name="username" class="form-control" value="${node.username}" required>
                    </div>
                    <div class="form-group">
                        <label for="editNodePort">SSH Port:</label>
                        <input type="number" id="editNodePort" name="port" class="form-control" value="${node.port}" required>
                    </div>
                    <div class="form-group">
                        <label for="editNodeDescription">Description:</label>
                        <textarea id="editNodeDescription" name="description" class="form-control" rows="3">${node.description || ''}</textarea>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Update Node</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('editNodeForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const nodeData = Object.fromEntries(formData);

            try {
                await api.updateNode(nodeId, nodeData);
                showToast('Node updated successfully', 'success');
                modal.remove();
                await this.loadNodes();
            } catch (error) {
                showToast(error.response?.data?.message || 'Failed to update node', 'error');
            }
        });
    }

    async deleteNode(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node || !confirm(`Are you sure you want to delete node "${node.name}"?`)) return;

        try {
            await api.deleteNode(nodeId);
            showToast('Node deleted successfully', 'success');
            await this.loadNodes();
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to delete node', 'error');
        }
    }

    async deleteSelected() {
        if (this.selectedNodes.size === 0) return;
        
        if (!confirm(`Are you sure you want to delete ${this.selectedNodes.size} node(s)?`)) return;

        let deleted = 0;
        for (const nodeId of this.selectedNodes) {
            try {
                await api.deleteNode(nodeId);
                deleted++;
            } catch (error) {
                const node = this.nodes.find(n => n.id === nodeId);
                showToast(`Failed to delete ${node ? node.name : nodeId}`, 'error');
            }
        }

        if (deleted > 0) {
            showToast(`${deleted} node(s) deleted successfully`, 'success');
            this.clearSelection();
            await this.loadNodes();
        }
    }

    async pingNode(nodeId) {
        try {
            await api.pingNode(nodeId);
            showToast('Ping started', 'info');
        } catch (error) {
            showToast('Failed to start ping', 'error');
        }
    }

    async pingSelected() {
        if (this.selectedNodes.size === 0) {
            showToast('Please select nodes to ping', 'warning');
            return;
        }

        for (const nodeId of this.selectedNodes) {
            try {
                await api.pingNode(nodeId);
            } catch (error) {
                console.error(`Failed to ping node ${nodeId}:`, error);
            }
        }
        
        showToast(`Pinging ${this.selectedNodes.size} node(s)`, 'info');
    }

    addToGroupModal() {
        if (this.selectedNodes.size === 0) return;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Add Nodes to Group</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <form id="addToGroupForm">
                    <div class="form-group">
                        <label for="selectGroup">Select Group:</label>
                        <select id="selectGroup" name="groupId" class="form-control" required>
                            <option value="">Select a group...</option>
                            ${this.groups.map(group => 
                                `<option value="${group.id}">${group.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <p class="text-muted">
                        Adding ${this.selectedNodes.size} node(s) to the selected group.
                    </p>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Add to Group</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('addToGroupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const groupId = parseInt(formData.get('groupId'));

            try {
                await api.addNodesToGroup(groupId, Array.from(this.selectedNodes));
                showToast('Nodes added to group successfully', 'success');
                modal.remove();
                this.clearSelection();
                await this.loadNodes();
            } catch (error) {
                showToast(error.response?.data?.message || 'Failed to add nodes to group', 'error');
            }
        });
    }
}

export const nodesComponent = new NodesComponent();
