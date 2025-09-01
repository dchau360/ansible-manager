import { api } from '../api.js';
import { showToast } from '../utils/notifications.js';

export class InventoryComponent {
    constructor() {
        this.imports = [];
        this.currentPreview = null;
    }

    async render() {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Inventory Import</h3>
                    <div class="d-flex gap-2">
                        <button class="btn btn-primary" onclick="inventoryComponent.showUploadModal()">
                            <i class="fas fa-upload"></i> Upload File
                        </button>
                        <button class="btn btn-secondary" onclick="inventoryComponent.showPasteModal()">
                            <i class="fas fa-paste"></i> Paste Content
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="tabs">
                        <button class="tab active" onclick="inventoryComponent.showTab('imports')">
                            Import History
                        </button>
                        <button class="tab" onclick="inventoryComponent.showTab('preview')" id="previewTab" disabled>
                            Preview
                        </button>
                    </div>
                    
                    <div id="importsTab" class="tab-content active">
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Filename</th>
                                        <th>Format</th>
                                        <th>Nodes</th>
                                        <th>Groups</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="importsTableBody">
                                    <tr>
                                        <td colspan="7" class="text-center">
                                            <div class="loading">
                                                <i class="fas fa-spinner fa-spin"></i>
                                                <span>Loading import history...</span>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div id="previewTab" class="tab-content">
                        <div id="previewContent">
                            <p class="text-muted text-center">No preview available</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async init() {
        await this.loadImports();
    }

    async loadImports() {
        try {
            const response = await api.getImports();
            this.imports = response.data;
            this.renderImports();
        } catch (error) {
            showToast('Failed to load import history', 'error');
            console.error(error);
        }
    }

    renderImports() {
        const tbody = document.getElementById('importsTableBody');
        
        if (this.imports.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">
                        No imports found. Upload your first inventory file.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.imports.map(imp => `
            <tr>
                <td><strong>${imp.filename}</strong></td>
                <td>
                    <span class="badge">${imp.format.toUpperCase()}</span>
                </td>
                <td>${imp.total_nodes}</td>
                <td>${imp.total_groups}</td>
                <td>
                    <span class="status ${imp.status}">${imp.status}</span>
                </td>
                <td>${this.formatDate(imp.created_at)}</td>
                <td>
                    <div class="d-flex gap-2">
                        ${imp.status === 'pending' ? `
                            <button class="btn btn-sm btn-success" onclick="inventoryComponent.executeImport(${imp.id})" title="Execute Import">
                                <i class="fas fa-play"></i>
                            </button>
                        ` : ''}
                        ${imp.status === 'completed' ? `
                            <button class="btn btn-sm btn-warning" onclick="inventoryComponent.rollbackImport(${imp.id})" title="Rollback">
                                <i class="fas fa-undo"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-sm btn-secondary" onclick="inventoryComponent.viewImport(${imp.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleString();
    }

    showTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        event.target.classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}Tab`).classList.add('active');
    }

    showUploadModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Upload Inventory File</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="file-upload" id="inventoryFileUpload">
                    <input type="file" id="inventoryFileInput" accept=".yml,.yaml,.ini,.json">
                    <div class="file-upload-icon">
                        <i class="fas fa-file-upload"></i>
                    </div>
                    <p>Drop inventory file here or click to browse</p>
                    <p class="text-muted">Supports YAML (.yml, .yaml), INI (.ini), and JSON (.json) formats</p>
                </div>
                <div id="inventoryUploadProgress" class="hidden">
                    <div class="progress">
                        <div class="progress-bar" id="inventoryProgressBar"></div>
                    </div>
                    <p id="inventoryUploadStatus">Uploading...</p>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const fileUpload = document.getElementById('inventoryFileUpload');
        const fileInput = document.getElementById('inventoryFileInput');

        fileUpload.addEventListener('click', () => fileInput.click());
        fileUpload.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUpload.classList.add('dragover');
        });
        fileUpload.addEventListener('dragleave', () => {
            fileUpload.classList.remove('dragover');
        });
        fileUpload.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUpload.classList.remove('dragover');
            this.handleInventoryUpload(e.dataTransfer.files[0], modal);
        });

        fileInput.addEventListener('change', (e) => {
            this.handleInventoryUpload(e.target.files[0], modal);
        });
    }

    async handleInventoryUpload(file, modal) {
        if (!file) return;

        const uploadProgress = document.getElementById('inventoryUploadProgress');
        const uploadStatus = document.getElementById('inventoryUploadStatus');

        uploadProgress.classList.remove('hidden');
        uploadStatus.textContent = 'Uploading and parsing...';

        try {
            const response = await api.uploadInventory(file);
            const data = response.data;

            showToast('Inventory file uploaded successfully', 'success');
            
            // Show preview
            this.currentPreview = data;
            this.showPreview(data);
            modal.remove();
            await this.loadImports();

        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to upload inventory file', 'error');
            uploadProgress.classList.add('hidden');
        }
    }

    showPasteModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 class="modal-title">Paste Inventory Content</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <form id="pasteInventoryForm">
                    <div class="form-group">
                        <label for="inventoryFormat">Format:</label>
                        <select id="inventoryFormat" name="format" class="form-control" required>
                            <option value="yaml">YAML</option>
                            <option value="ini">INI</option>
                            <option value="json">JSON</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="inventoryContent">Content:</label>
                        <textarea id="inventoryContent" name="content" class="form-control code-editor" 
                                  rows="15" placeholder="Paste your inventory content here..." required></textarea>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Parse & Preview</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('pasteInventoryForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const content = formData.get('content');
            const format = formData.get('format');

            try {
                const response = await api.pasteInventory(content, format);
                const data = response.data;

                showToast('Inventory content parsed successfully', 'success');
                
                // Show preview
                this.currentPreview = data;
                this.showPreview(data);
                modal.remove();
                await this.loadImports();

            } catch (error) {
                showToast(error.response?.data?.message || 'Failed to parse inventory content', 'error');
            }
        });
    }

    showPreview(data) {
        const previewContent = document.getElementById('previewContent');
        const previewTab = document.getElementById('previewTab');
        
        // Enable and activate preview tab
        previewTab.disabled = false;
        previewTab.click();

        previewContent.innerHTML = `
            <div class="preview-header">
                <h4>Import Preview</h4>
                <div class="preview-stats">
                    <span class="badge">${data.preview.total_nodes} Nodes</span>
                    <span class="badge">${data.preview.total_groups} Groups</span>
                </div>
            </div>
            
            <div class="preview-sections">
                <div class="preview-section">
                    <h5>Nodes (${data.preview.nodes.length})</h5>
                    ${data.preview.nodes.length > 0 ? `
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Hostname</th>
                                        <th>Username</th>
                                        <th>Port</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.preview.nodes.map(node => `
                                        <tr>
                                            <td>${node.name}</td>
                                            <td>${node.hostname}</td>
                                            <td>${node.username}</td>
                                            <td>${node.port}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : '<p class="text-muted">No nodes found</p>'}
                </div>
                
                <div class="preview-section">
                    <h5>Groups (${Object.keys(data.preview.groups).length})</h5>
                    ${Object.keys(data.preview.groups).length > 0 ? `
                        <div class="groups-preview">
                            ${Object.entries(data.preview.groups).map(([groupName, groupData]) => `
                                <div class="group-preview">
                                    <strong>${groupName}</strong>
                                    <span class="text-muted">(${groupData.nodes.length} nodes)</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<p class="text-muted">No groups found</p>'}
                </div>
            </div>
            
            <div class="preview-actions">
                <button class="btn btn-success" onclick="inventoryComponent.executeImport(${data.import_id})">
                    <i class="fas fa-check"></i> Execute Import
                </button>
                <button class="btn btn-secondary" onclick="inventoryComponent.showTab('imports')">
                    Cancel
                </button>
            </div>
        `;
    }

    async executeImport(importId) {
        if (!confirm('Are you sure you want to execute this import? This will create new nodes and groups.')) return;

        try {
            const response = await api.executeImport(importId);
            showToast(response.data.message, 'success');
            await this.loadImports();
            
            // Clear preview if this was the current preview
            if (this.currentPreview && this.currentPreview.import_id === importId) {
                this.currentPreview = null;
                document.getElementById('previewTab').disabled = true;
                document.getElementById('previewContent').innerHTML = '<p class="text-muted text-center">No preview available</p>';
                this.showTab('imports');
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to execute import', 'error');
        }
    }

    async rollbackImport(importId) {
        if (!confirm('Are you sure you want to rollback this import? This will delete all nodes and groups created by this import.')) return;

        try {
            const response = await api.rollbackImport(importId);
            showToast(response.data.message, 'success');
            await this.loadImports();
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to rollback import', 'error');
        }
    }

    viewImport(importId) {
        const imp = this.imports.find(i => i.id === importId);
        if (!imp) return;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 class="modal-title">Import Details: ${imp.filename}</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="import-details">
                        <div class="detail-row">
                            <label>Status:</label>
                            <span class="status ${imp.status}">${imp.status}</span>
                        </div>
                        <div class="detail-row">
                            <label>Format:</label>
                            <span>${imp.format.toUpperCase()}</span>
                        </div>
                        <div class="detail-row">
                            <label>Created:</label>
                            <span>${this.formatDate(imp.created_at)}</span>
                        </div>
                        ${imp.imported_at ? `
                            <div class="detail-row">
                                <label>Imported:</label>
                                <span>${this.formatDate(imp.imported_at)}</span>
                            </div>
                        ` : ''}
                        ${imp.rolled_back_at ? `
                            <div class="detail-row">
                                <label>Rolled Back:</label>
                                <span>${this.formatDate(imp.rolled_back_at)}</span>
                            </div>
                        ` : ''}
                        <div class="detail-row">
                            <label>Nodes Created:</label>
                            <span>${imp.total_nodes}</span>
                        </div>
                        <div class="detail-row">
                            <label>Groups Created:</label>
                            <span>${imp.total_groups}</span>
                        </div>
                        ${imp.error_message ? `
                            <div class="detail-row">
                                <label>Error:</label>
                                <div class="error-message">${imp.error_message}</div>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    ${imp.status === 'pending' ? `
                        <button class="btn btn-success" onclick="inventoryComponent.executeImport(${imp.id}); this.closest('.modal').remove();">
                            Execute Import
                        </button>
                    ` : ''}
                    ${imp.status === 'completed' ? `
                        <button class="btn btn-warning" onclick="inventoryComponent.rollbackImport(${imp.id}); this.closest('.modal').remove();">
                            Rollback Import
                        </button>
                    ` : ''}
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }
}

export const inventoryComponent = new InventoryComponent();

// Add CSS for inventory component
const inventoryStyles = document.createElement('style');
inventoryStyles.textContent = `
    .preview-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 1px solid #dee2e6;
    }
    
    .preview-stats {
        display: flex;
        gap: 10px;
    }
    
    .preview-sections {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 20px;
    }
    
    .preview-section {
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 15px;
    }
    
    .preview-section h5 {
        margin: 0 0 15px 0;
        color: #495057;
    }
    
    .groups-preview {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    .group-preview {
        padding: 8px;
        background: #f8f9fa;
        border-radius: 4px;
        border: 1px solid #e9ecef;
    }
    
    .preview-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
        padding-top: 20px;
        border-top: 1px solid #dee2e6;
    }
    
    .import-details {
        display: grid;
        gap: 15px;
    }
    
    .detail-row {
        display: grid;
        grid-template-columns: 150px 1fr;
        gap: 15px;
        align-items: start;
    }
    
    .detail-row label {
        font-weight: 600;
        color: #495057;
    }
    
    .error-message {
        color: #721c24;
        background: #f8d7da;
        border: 1px solid #f5c6cb;
        border-radius: 4px;
        padding: 10px;
        font-family: monospace;
        font-size: 12px;
    }
    
    @media (max-width: 768px) {
        .preview-sections {
            grid-template-columns: 1fr;
        }
        
        .detail-row {
            grid-template-columns: 1fr;
            gap: 5px;
        }
    }
`;
document.head.appendChild(inventoryStyles);
