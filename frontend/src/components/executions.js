import { api } from '../api.js';
import { showToast } from '../utils/notifications.js';
import { Socket } from '../utils/socket.js';

export class ExecutionsComponent {
    constructor() {
        this.executions = [];
        this.currentExecution = null;
    }

    async render() {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Execution History</h3>
                    <div class="d-flex gap-2">
                        <button class="btn btn-primary" onclick="executionsComponent.showExecutionModal()">
                            <i class="fas fa-play"></i> New Execution
                        </button>
                        <button class="btn btn-secondary" onclick="executionsComponent.loadExecutions()">
                            <i class="fas fa-refresh"></i> Refresh
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Playbooks</th>
                                    <th>Targets</th>
                                    <th>Status</th>
                                    <th>Started</th>
                                    <th>Duration</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="executionsTableBody">
                                <tr>
                                    <td colspan="7" class="text-center">
                                        <div class="loading">
                                            <i class="fas fa-spinner fa-spin"></i>
                                            <span>Loading executions...</span>
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
        await this.loadExecutions();
        this.setupSocketListeners();
    }

    async loadExecutions() {
        try {
            const response = await api.getExecutions();
            this.executions = response.data;
            this.renderExecutions();
        } catch (error) {
            showToast('Failed to load executions', 'error');
            console.error(error);
        }
    }

    renderExecutions() {
        const tbody = document.getElementById('executionsTableBody');
        
        if (this.executions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">
                        No executions found. Start your first playbook execution.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.executions.map(execution => `
            <tr id="execution-${execution.id}">
                <td><strong>#${execution.id}</strong></td>
                <td>
                    <div class="playbook-list">
                        ${execution.playbooks.map(pb => `<span class="badge">${pb}</span>`).join('')}
                    </div>
                </td>
                <td>
                    <div class="target-info">
                        ${execution.target_nodes ? `<span class="text-muted">${execution.target_nodes.length} nodes</span>` : ''}
                        ${execution.target_groups ? `<span class="text-muted">${execution.target_groups.length} groups</span>` : ''}
                    </div>
                </td>
                <td>
                    <span class="status ${execution.status}" id="executionStatus-${execution.id}">
                        ${execution.status}
                    </span>
                </td>
                <td>${this.formatDate(execution.started_at)}</td>
                <td>
                    <span id="executionDuration-${execution.id}">
                        ${execution.duration || (execution.status === 'running' ? 'Running...' : '-')}
                    </span>
                </td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-secondary" onclick="executionsComponent.viewExecution(${execution.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${execution.status === 'running' ? `
                            <button class="btn btn-sm btn-danger" onclick="executionsComponent.cancelExecution(${execution.id})" title="Cancel">
                                <i class="fas fa-stop"></i>
                            </button>
                        ` : ''}
                        ${execution.status === 'completed' && execution.output ? `
                            <button class="btn btn-sm btn-success" onclick="executionsComponent.showOutput(${execution.id})" title="View Output">
                                <i class="fas fa-terminal"></i>
                            </button>
                        ` : ''}
                        ${execution.error_output ? `
                            <button class="btn btn-sm btn-warning" onclick="executionsComponent.showErrors(${execution.id})" title="View Errors">
                                <i class="fas fa-exclamation-triangle"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    }

    setupSocketListeners() {
        Socket.on('execution_status', (data) => {
            this.updateExecutionStatus(data.execution_id, data.status);
            showToast(data.message, data.status === 'running' ? 'info' : 'success');
        });

        Socket.on('execution_progress', (data) => {
            showToast(`Executing: ${data.current_playbook}`, 'info');
        });

        Socket.on('execution_complete', (data) => {
            this.updateExecutionStatus(data.execution_id, data.status);
            const message = data.status === 'completed' ? 'Execution completed successfully' : 'Execution failed';
            const type = data.status === 'completed' ? 'success' : 'error';
            showToast(message, type);
            
            // Reload to get updated data
            this.loadExecutions();
        });

        Socket.on('execution_cancelled', (data) => {
            this.updateExecutionStatus(data.execution_id, 'cancelled');
            showToast('Execution cancelled', 'warning');
            this.loadExecutions();
        });
    }

    updateExecutionStatus(executionId, status) {
        const statusElement = document.getElementById(`executionStatus-${executionId}`);
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `status ${status}`;
        }
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleString();
    }

    async showExecutionModal(selectedPlaybooks = [], selectedNodes = [], selectedGroups = []) {
        try {
            // Load available playbooks, nodes, and groups
            const [playbooksResponse, nodesResponse, groupsResponse] = await Promise.all([
                api.getPlaybooks(),
                api.getNodes(),
                api.getGroups()
            ]);

            const playbooks = playbooksResponse.data;
            const nodes = nodesResponse.data;
            const groups = groupsResponse.data;

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3 class="modal-title">Execute Playbooks</h3>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                    </div>
                    <form id="executionForm">
                        <div class="form-group">
                            <label>Select Playbooks:</label>
                            <div class="playbooks-selection">
                                ${playbooks.map(playbook => `
                                    <label class="checkbox">
                                        <input type="checkbox" name="playbooks" value="${playbook.name}" 
                                               ${selectedPlaybooks.includes(playbook.name) ? 'checked' : ''}>
                                        <span class="checkmark"></span>
                                        <span>${playbook.name}</span>
                                    </label>
                                `).join('')}
                            </div>
                            ${playbooks.length === 0 ? '<p class="text-muted">No playbooks available</p>' : ''}
                        </div>

                        <div class="form-group">
                            <label>Select Target Nodes:</label>
                            <div class="nodes-selection">
                                ${nodes.map(node => `
                                    <label class="checkbox">
                                        <input type="checkbox" name="nodes" value="${node.id}" 
                                               ${selectedNodes.includes(node.id) ? 'checked' : ''}>
                                        <span class="checkmark"></span>
                                        <span><strong>${node.name}</strong> (${node.hostname})</span>
                                    </label>
                                `).join('')}
                            </div>
                            ${nodes.length === 0 ? '<p class="text-muted">No nodes available</p>' : ''}
                        </div>

                        <div class="form-group">
                            <label>Select Target Groups:</label>
                            <div class="groups-selection">
                                ${groups.map(group => `
                                    <label class="checkbox">
                                        <input type="checkbox" name="groups" value="${group.id}" 
                                               ${selectedGroups.includes(group.id) ? 'checked' : ''}>
                                        <span class="checkmark"></span>
                                        <span><strong>${group.name}</strong> (${group.node_count} nodes)</span>
                                    </label>
                                `).join('')}
                            </div>
                            ${groups.length === 0 ? '<p class="text-muted">No groups available</p>' : ''}
                        </div>

                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                            <button type="submit" class="btn btn-success">
                                <i class="fas fa-play"></i> Execute
                            </button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(modal);

            document.getElementById('executionForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const formData = new FormData(e.target);
                const playbooks = formData.getAll('playbooks');
                const nodeIds = formData.getAll('nodes').map(id => parseInt(id));
                const groupIds = formData.getAll('groups').map(id => parseInt(id));

                if (playbooks.length === 0) {
                    showToast('Please select at least one playbook', 'warning');
                    return;
                }

                if (nodeIds.length === 0 && groupIds.length === 0) {
                    showToast('Please select at least one target node or group', 'warning');
                    return;
                }

                try {
                    const executionData = {
                        playbooks,
                        target_nodes: nodeIds.length > 0 ? nodeIds : null,
                        target_groups: groupIds.length > 0 ? groupIds : null
                    };

                    await api.createExecution(executionData);
                    showToast('Execution started successfully', 'success');
                    modal.remove();
                    await this.loadExecutions();
                } catch (error) {
                    showToast(error.response?.data?.message || 'Failed to start execution', 'error');
                }
            });

        } catch (error) {
            showToast('Failed to load execution data', 'error');
        }
    }

    async viewExecution(executionId) {
        try {
            const response = await api.getExecution(executionId);
            const execution = response.data;

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3 class="modal-title">Execution #${execution.id}</h3>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="execution-details">
                            <div class="detail-section">
                                <h4>Execution Details</h4>
                                <div class="detail-grid">
                                    <div class="detail-row">
                                        <label>Status:</label>
                                        <span class="status ${execution.status}">${execution.status}</span>
                                    </div>
                                    <div class="detail-row">
                                        <label>Started:</label>
                                        <span>${this.formatDate(execution.started_at)}</span>
                                    </div>
                                    ${execution.completed_at ? `
                                        <div class="detail-row">
                                            <label>Completed:</label>
                                            <span>${this.formatDate(execution.completed_at)}</span>
                                        </div>
                                    ` : ''}
                                    ${execution.duration ? `
                                        <div class="detail-row">
                                            <label>Duration:</label>
                                            <span>${execution.duration}</span>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>

                            <div class="detail-section">
                                <h4>Playbooks</h4>
                                <div class="playbook-tags">
                                    ${execution.playbooks.map(pb => `<span class="badge">${pb}</span>`).join('')}
                                </div>
                            </div>

                            ${execution.target_nodes ? `
                                <div class="detail-section">
                                    <h4>Target Nodes</h4>
                                    <p>${execution.target_nodes.length} nodes selected</p>
                                </div>
                            ` : ''}

                            ${execution.target_groups ? `
                                <div class="detail-section">
                                    <h4>Target Groups</h4>
                                    <p>${execution.target_groups.length} groups selected</p>
                                </div>
                            ` : ''}

                            ${execution.output ? `
                                <div class="detail-section">
                                    <h4>Output</h4>
                                    <pre class="execution-output">${execution.output}</pre>
                                </div>
                            ` : ''}

                            ${execution.error_output ? `
                                <div class="detail-section">
                                    <h4>Errors</h4>
                                    <pre class="execution-errors">${execution.error_output}</pre>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="modal-footer">
                        ${execution.status === 'running' ? `
                            <button class="btn btn-danger" onclick="executionsComponent.cancelExecution(${execution.id}); this.closest('.modal').remove();">
                                <i class="fas fa-stop"></i> Cancel Execution
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        } catch (error) {
            showToast('Failed to load execution details', 'error');
        }
    }

    async cancelExecution(executionId) {
        if (!confirm('Are you sure you want to cancel this execution?')) return;

        try {
            await api.cancelExecution(executionId);
            showToast('Execution cancelled', 'success');
            await this.loadExecutions();
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to cancel execution', 'error');
        }
    }

    async showOutput(executionId) {
        try {
            const response = await api.getExecution(executionId);
            const execution = response.data;

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3 class="modal-title">Execution Output #${execution.id}</h3>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <pre class="execution-output">${execution.output || 'No output available'}</pre>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        } catch (error) {
            showToast('Failed to load execution output', 'error');
        }
    }

    async showErrors(executionId) {
        try {
            const response = await api.getExecution(executionId);
            const execution = response.data;

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3 class="modal-title">Execution Errors #${execution.id}</h3>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <pre class="execution-errors">${execution.error_output || 'No errors recorded'}</pre>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        } catch (error) {
            showToast('Failed to load execution errors', 'error');
        }
    }
}

export const executionsComponent = new ExecutionsComponent();

// Add CSS for execution component
const executionStyles = document.createElement('style');
executionStyles.textContent = `
    .playbook-list {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
    }
    
    .target-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    
    .playbooks-selection,
    .nodes-selection,
    .groups-selection {
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 10px;
        background: #f8f9fa;
    }
    
    .playbooks-selection label,
    .nodes-selection label,
    .groups-selection label {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
        margin: 0;
        cursor: pointer;
    }
    
    .execution-details {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }
    
    .detail-section {
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 15px;
    }
    
    .detail-section h4 {
        margin: 0 0 15px 0;
        color: #495057;
        border-bottom: 1px solid #dee2e6;
        padding-bottom: 8px;
    }
    
    .detail-grid {
        display: grid;
        gap: 10px;
    }
    
    .detail-row {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 15px;
        align-items: center;
    }
    
    .detail-row label {
        font-weight: 600;
        color: #495057;
        margin: 0;
    }
    
    .playbook-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    
    .execution-output,
    .execution-errors {
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 15px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 12px;
        line-height: 1.4;
        max-height: 400px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
    }
    
    .execution-errors {
        background: #fff5f5;
        border-color: #fed7d7;
        color: #c53030;
    }
    
    @media (max-width: 768px) {
        .detail-row {
            grid-template-columns: 1fr;
            gap: 5px;
        }
    }
`;
document.head.appendChild(executionStyles);
