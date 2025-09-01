import { api } from '../api.js';
import { showToast } from '../utils/notifications.js';

export class GroupsComponent {
    constructor() {
        this.groups = [];
        this.nodes = [];
        this.selectedGroups = new Set();
    }

    async render() {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Node Groups</h3>
                    <div class="d-flex gap-2">
                        <button class="btn btn-primary" onclick="groupsComponent.showCreateModal()">
                            <i class="fas fa-plus"></i> Create Group
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div id="groupSelectionActions" class="selection-actions hidden">
                        <span class="selection-info">
                            <span id="selectedGroupCount">0</span> group(s) selected
                        </span>
                        <button class="btn btn-danger btn-sm" onclick="groupsComponent.deleteSelected()">
                            <i class="fas fa-trash"></i> Delete Selected
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="groupsComponent.clearSelection()">
                            Clear Selection
                        </button>
                    </div>
                    <div class="table-responsive">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>
                                        <label class="checkbox">
                                            <input type="checkbox" onchange="groupsComponent.toggleAllSelection(this)">
                                            <span class="checkmark"></span>
                                        </label>
                                    </th>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Node Count</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="groupsTableBody">
                                <tr>
                                    <td colspan="6" class="text-center">
                                        <div class="loading">
                                            <i class="fas fa-spinner fa-spin"></i>
                                            <span>Loading groups...</span>
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
            this.loadGroups(),
            this.loadNodes()
        ]);
    }

    async loadGroups() {
        try {
            const response = await api.getGroups();
            this.groups = response.data;
            this.renderGroups();
        } catch (error) {
            showToast('Failed to load groups', 'error');
            console.error(error);
        }
    }

    async loadNodes() {
        try {
            const response = await api.getNodes();
            this.nodes = response.data;
        } catch (error) {
            console.error('Failed to load nodes:', error);
        }
    }

    renderGroups() {
        const tbody = document.getElementById('groupsTableBody');
        
        if (this.groups.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">
                        No groups found. Create your first group to organize nodes.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.groups.map(group => `
            <tr>
                <td>
                    <label class="checkbox">
                        <input type="checkbox" value="${group.id}" 
                               onchange="groupsComponent.toggleSelection(${group.id}, this)">
                        <span class="checkmark"></span>
                    </label>
                </td>
                <td><strong>${group.name}</strong></td>
                <td class="text-muted">${group.description || 'No description'}</td>
                <td>
                    <span class="badge">${group.node_count} nodes</span>
                </td>
                <td>${this.formatDate(group.created_at)}</td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-secondary" onclick="groupsComponent.viewGroup(${group.id})" title="View Nodes">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="groupsComponent.editGroup(${group.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="groupsComponent.manageNodes(${group.id})" title="Manage Nodes">
                            <i class="fas fa-users"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="groupsComponent.deleteGroup(${group.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString();
    }

    toggleSelection(groupId, checkbox) {
        if (checkbox.checked) {
            this.selectedGroups.add(groupId);
        } else {
            this.selectedGroups.delete(groupId);
        }
        this.updateSelectionUI();
    }

    toggleAllSelection(checkbox) {
        const checkboxes = document.querySelectorAll('#groupsTableBody input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = checkbox.checked;
            const groupId = parseInt(cb.value);
            if (checkbox.checked) {
                this.selectedGroups.add(groupId);
            } else {
                this.selectedGroups.delete(groupId);
            }
        });
        this.updateSelectionUI();
    }

    updateSelectionUI() {
        const selectionActions = document.getElementById('groupSelectionActions');
        const selectedCount = document.getElementById('selectedGroupCount');
        
        if (this.selectedGroups.size > 0) {
            selectionActions.classList.remove('hidden');
            selectedCount.textContent = this.selectedGroups.size;
        } else {
            selectionActions.classList.add('hidden');
        }
    }

    clearSelection() {
        this.selectedGroups.clear();
        const checkboxes = document.querySelectorAll('#groupsTableBody input[type="checkbox"], thead input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
        this.updateSelectionUI();
    }

    showCreateModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Create New Group</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <form id="createGroupForm">
                    <div class="form-group">
                        <label for="groupName">Group Name:</label>
                        <input type="text" id="groupName" name="name" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label for="groupDescription">Description:</label>
                        <textarea id="groupDescription" name="description" class="form-control" rows="3"></textarea>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create Group</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('createGroupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const groupData = Object.fromEntries(formData);

            try {
                await api.createGroup(groupData);
                showToast('Group created successfully', 'success');
                modal.remove();
                await this.loadGroups();
            } catch (error) {
                showToast(error.response?.data?.message || 'Failed to create group', 'error');
            }
        });
    }

    async editGroup(groupId) {
        const group = this.groups.find(g => g.id === groupId);
        if (!group) return;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Edit Group</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <form id="editGroupForm">
                    <div class="form-group">
                        <label for="editGroupName">Group Name:</label>
                        <input type="text" id="editGroupName" name="name" class="form-control" value="${group.name}" required>
                    </div>
                    <div class="form-group">
                        <label for="editGroupDescription">Description:</label>
                        <textarea id="editGroupDescription" name="description" class="form-control" rows="3">${group.description || ''}</textarea>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Update Group</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('editGroupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const groupData = Object.fromEntries(formData);

            try {
                await api.updateGroup(groupId, groupData);
                showToast('Group updated successfully', 'success');
                modal.remove();
                await this.loadGroups();
            } catch (error) {
                showToast(error.response?.data?.message || 'Failed to update group', 'error');
            }
        });
    }

    async deleteGroup(groupId) {
        const group = this.groups.find(g => g.id === groupId);
        if (!group || !confirm(`Are you sure you want to delete group "${group.name}"?`)) return;

        try {
            await api.deleteGroup(groupId);
            showToast('Group deleted successfully', 'success');
            await this.loadGroups();
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to delete group', 'error');
        }
    }

    async deleteSelected() {
        if (this.selectedGroups.size === 0) return;
        
        if (!confirm(`Are you sure you want to delete ${this.selectedGroups.size} group(s)?`)) return;

        let deleted = 0;
        for (const groupId of this.selectedGroups) {
            try {
                await api.deleteGroup(groupId);
                deleted++;
            } catch (error) {
                const group = this.groups.find(g => g.id === groupId);
                showToast(`Failed to delete ${group ? group.name : groupId}`, 'error');
            }
        }

        if (deleted > 0) {
            showToast(`${deleted} group(s) deleted successfully`, 'success');
            this.clearSelection();
            await this.loadGroups();
        }
    }

    async viewGroup(groupId) {
        const group = this.groups.find(g => g.id === groupId);
        if (!group) return;

        try {
            const response = await api.getGroup(groupId);
            const groupData = response.data;

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3 class="modal-title">Group: ${groupData.name}</h3>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Description:</label>
                            <p class="text-muted">${groupData.description || 'No description'}</p>
                        </div>
                        <div class="form-group">
                            <label>Nodes in this group (${groupData.nodes.length}):</label>
                            ${groupData.nodes.length > 0 ? `
                                <div class="table-responsive">
                                    <table class="table">
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Hostname</th>
                                                <th>Username</th>
                                                <th>Port</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${groupData.nodes.map(node => `
                                                <tr>
                                                    <td><strong>${node.name}</strong></td>
                                                    <td>${node.hostname}</td>
                                                    <td>${node.username}</td>
                                                    <td>${node.port}</td>
                                                    <td><span class="status ${node.status}">${node.status}</span></td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : '<p class="text-muted">No nodes in this group</p>'}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="groupsComponent.manageNodes(${groupId}); this.closest('.modal').remove();">
                            Manage Nodes
                        </button>
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        } catch (error) {
            showToast('Failed to load group details', 'error');
        }
    }

    async manageNodes(groupId) {
        const group = this.groups.find(g => g.id === groupId);
        if (!group) return;

        try {
            const response = await api.getGroup(groupId);
            const groupData = response.data;

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3 class="modal-title">Manage Nodes - ${groupData.name}</h3>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div>
                                <h4>Available Nodes</h4>
                                <div id="availableNodes" class="node-list">
                                    ${this.renderAvailableNodes(groupData.nodes)}
                                </div>
                                <button class="btn btn-primary btn-sm mt-2" onclick="groupsComponent.addSelectedNodes(${groupId})">
                                    <i class="fas fa-arrow-right"></i> Add Selected
                                </button>
                            </div>
                            <div>
                                <h4>Group Members</h4>
                                <div id="groupNodes" class="node-list">
                                    ${this.renderGroupNodes(groupData.nodes)}
                                </div>
                                <button class="btn btn-danger btn-sm mt-2" onclick="groupsComponent.removeSelectedNodes(${groupId})">
                                    <i class="fas fa-arrow-left"></i> Remove Selected
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Done</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        } catch (error) {
            showToast('Failed to load group details', 'error');
        }
    }

    renderAvailableNodes(groupNodes) {
        const groupNodeIds = new Set(groupNodes.map(n => n.id));
        const availableNodes = this.nodes.filter(node => !groupNodeIds.has(node.id));

        if (availableNodes.length === 0) {
            return '<p class="text-muted">All nodes are already in this group</p>';
        }

        return availableNodes.map(node => `
            <div class="node-item">
                <label class="checkbox">
                    <input type="checkbox" value="${node.id}" class="available-node-checkbox">
                    <span class="checkmark"></span>
                </label>
                <span><strong>${node.name}</strong> (${node.hostname})</span>
            </div>
        `).join('');
    }

    renderGroupNodes(groupNodes) {
        if (groupNodes.length === 0) {
            return '<p class="text-muted">No nodes in this group</p>';
        }

        return groupNodes.map(node => `
            <div class="node-item">
                <label class="checkbox">
                    <input type="checkbox" value="${node.id}" class="group-node-checkbox">
                    <span class="checkmark"></span>
                </label>
                <span><strong>${node.name}</strong> (${node.hostname})</span>
            </div>
        `).join('');
    }

    async addSelectedNodes(groupId) {
        const checkboxes = document.querySelectorAll('.available-node-checkbox:checked');
        const nodeIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

        if (nodeIds.length === 0) {
            showToast('Please select nodes to add', 'warning');
            return;
        }

        try {
            await api.addNodesToGroup(groupId, nodeIds);
            showToast(`${nodeIds.length} node(s) added to group`, 'success');
            
            // Close modal and refresh
            document.querySelector('.modal').remove();
            await this.loadGroups();
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to add nodes to group', 'error');
        }
    }

    async removeSelectedNodes(groupId) {
        const checkboxes = document.querySelectorAll('.group-node-checkbox:checked');
        const nodeIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

        if (nodeIds.length === 0) {
            showToast('Please select nodes to remove', 'warning');
            return;
        }

        if (!confirm(`Remove ${nodeIds.length} node(s) from this group?`)) return;

        try {
            for (const nodeId of nodeIds) {
                await api.removeNodeFromGroup(groupId, nodeId);
            }
            showToast(`${nodeIds.length} node(s) removed from group`, 'success');
            
            // Close modal and refresh
            document.querySelector('.modal').remove();
            await this.loadGroups();
        } catch (error) {
            showToast('Failed to remove nodes from group', 'error');
        }
    }
}

export const groupsComponent = new GroupsComponent();

// Add CSS for node management
const groupStyles = document.createElement('style');
groupStyles.textContent = `
    .node-list {
        border: 1px solid #dee2e6;
        border-radius: 4px;
        max-height: 300px;
        overflow-y: auto;
        padding: 10px;
        background: #f8f9fa;
    }
    
    .node-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px;
        margin-bottom: 5px;
        background: white;
        border-radius: 4px;
        border: 1px solid #e9ecef;
    }
    
    .node-item:last-child {
        margin-bottom: 0;
    }
    
    .badge {
        background: #007bff;
        color: white;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
    }
`;
document.head.appendChild(groupStyles);
