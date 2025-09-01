import { api } from '../api.js';
import { showToast } from '../utils/notifications.js';

export class PlaybooksComponent {
    constructor() {
        this.playbooks = [];
        this.selectedPlaybooks = new Set();
    }

    async render() {
        return `
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Playbooks</h3>
                    <div class="d-flex gap-2">
                        <button class="btn btn-primary" onclick="playbooksComponent.showCreateModal()">
                            <i class="fas fa-plus"></i> Create New
                        </button>
                        <button class="btn btn-secondary" onclick="playbooksComponent.showUploadModal()">
                            <i class="fas fa-upload"></i> Upload
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div id="playbookSelectionActions" class="selection-actions hidden">
                        <span class="selection-info">
                            <span id="selectedCount">0</span> playbook(s) selected
                        </span>
                        <button class="btn btn-success btn-sm" onclick="playbooksComponent.executeSelected()">
                            <i class="fas fa-play"></i> Execute Selected
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="playbooksComponent.deleteSelected()">
                            <i class="fas fa-trash"></i> Delete Selected
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="playbooksComponent.clearSelection()">
                            Clear Selection
                        </button>
                    </div>
                    <div class="table-responsive">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>
                                        <label class="checkbox">
                                            <input type="checkbox" onchange="playbooksComponent.toggleAllSelection(this)">
                                            <span class="checkmark"></span>
                                        </label>
                                    </th>
                                    <th>Name</th>
                                    <th>Size</th>
                                    <th>Modified</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="playbooksTableBody">
                                <tr>
                                    <td colspan="5" class="text-center">
                                        <div class="loading">
                                            <i class="fas fa-spinner fa-spin"></i>
                                            <span>Loading playbooks...</span>
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
        await this.loadPlaybooks();
        this.setupEventListeners();
    }

    async loadPlaybooks() {
        try {
            const response = await api.getPlaybooks();
            this.playbooks = response.data;
            this.renderPlaybooks();
        } catch (error) {
            showToast('Failed to load playbooks', 'error');
            console.error(error);
        }
    }

    renderPlaybooks() {
        const tbody = document.getElementById('playbooksTableBody');
        
        if (this.playbooks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted">
                        No playbooks found. Create or upload your first playbook.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.playbooks.map(playbook => `
            <tr>
                <td>
                    <label class="checkbox">
                        <input type="checkbox" value="${playbook.name}" 
                               onchange="playbooksComponent.toggleSelection('${playbook.name}', this)">
                        <span class="checkmark"></span>
                    </label>
                </td>
                <td>
                    <strong>${playbook.name}</strong>
                </td>
                <td>${this.formatFileSize(playbook.size)}</td>
                <td>${this.formatDate(playbook.modified)}</td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-secondary" onclick="playbooksComponent.editPlaybook('${playbook.name}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-success" onclick="playbooksComponent.executePlaybook('${playbook.name}')" title="Execute">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="playbooksComponent.deletePlaybook('${playbook.name}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    formatFileSize(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleString();
    }

    toggleSelection(playbookName, checkbox) {
        if (checkbox.checked) {
            this.selectedPlaybooks.add(playbookName);
        } else {
            this.selectedPlaybooks.delete(playbookName);
        }
        this.updateSelectionUI();
    }

    toggleAllSelection(checkbox) {
        const checkboxes = document.querySelectorAll('#playbooksTableBody input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = checkbox.checked;
            if (checkbox.checked) {
                this.selectedPlaybooks.add(cb.value);
            } else {
                this.selectedPlaybooks.delete(cb.value);
            }
        });
        this.updateSelectionUI();
    }

    updateSelectionUI() {
        const selectionActions = document.getElementById('playbookSelectionActions');
        const selectedCount = document.getElementById('selectedCount');
        
        if (this.selectedPlaybooks.size > 0) {
            selectionActions.classList.remove('hidden');
            selectedCount.textContent = this.selectedPlaybooks.size;
        } else {
            selectionActions.classList.add('hidden');
        }
    }

    clearSelection() {
        this.selectedPlaybooks.clear();
        const checkboxes = document.querySelectorAll('#playbooksTableBody input[type="checkbox"], thead input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
        this.updateSelectionUI();
    }

    showCreateModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Create New Playbook</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <form id="createPlaybookForm">
                    <div class="form-group">
                        <label for="playbookName">Playbook Name:</label>
                        <input type="text" id="playbookName" name="filename" class="form-control" 
                               placeholder="my-playbook.yml" required>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('createPlaybookForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const filename = formData.get('filename');

            try {
                await api.createPlaybook(filename);
                showToast('Playbook created successfully', 'success');
                modal.remove();
                await this.loadPlaybooks();
            } catch (error) {
                showToast(error.response?.data?.message || 'Failed to create playbook', 'error');
            }
        });
    }

    showUploadModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Upload Playbook</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="file-upload" id="fileUpload">
                    <input type="file" id="fileInput" accept=".yml,.yaml" multiple>
                    <div class="file-upload-icon">
                        <i class="fas fa-cloud-upload-alt"></i>
                    </div>
                    <p>Drop YAML files here or click to browse</p>
                    <p class="text-muted">Supports .yml and .yaml files</p>
                </div>
                <div id="uploadProgress" class="hidden">
                    <div class="progress">
                        <div class="progress-bar" id="progressBar"></div>
                    </div>
                    <p id="uploadStatus">Uploading...</p>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const fileUpload = document.getElementById('fileUpload');
        const fileInput = document.getElementById('fileInput');

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
            this.handleFileUpload(Array.from(e.dataTransfer.files), modal);
        });

        fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(Array.from(e.target.files), modal);
        });
    }

    async handleFileUpload(files, modal) {
        if (files.length === 0) return;

        const uploadProgress = document.getElementById('uploadProgress');
        const progressBar = document.getElementById('progressBar');
        const uploadStatus = document.getElementById('uploadStatus');

        uploadProgress.classList.remove('hidden');
        
        let uploaded = 0;
        for (const file of files) {
            try {
                uploadStatus.textContent = `Uploading ${file.name}...`;
                await api.uploadPlaybook(file);
                uploaded++;
                
                const progress = (uploaded / files.length) * 100;
                progressBar.style.width = `${progress}%`;
            } catch (error) {
                showToast(`Failed to upload ${file.name}: ${error.response?.data?.message}`, 'error');
            }
        }

        if (uploaded > 0) {
            showToast(`${uploaded} playbook(s) uploaded successfully`, 'success');
            await this.loadPlaybooks();
        }

        modal.remove();
    }

    async editPlaybook(filename) {
        try {
            const response = await api.getPlaybook(filename);
            const content = response.data.content;

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3 class="modal-title">Edit ${filename}</h3>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
                    </div>
                    <form id="editPlaybookForm">
                        <div class="form-group">
                            <label for="playbookContent">Content:</label>
                            <textarea id="playbookContent" name="content" class="form-control code-editor" 
                                      rows="20" required>${content}</textarea>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save</button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(modal);

            document.getElementById('editPlaybookForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const content = formData.get('content');

                try {
                    await api.updatePlaybook(filename, content);
                    showToast('Playbook updated successfully', 'success');
                    modal.remove();
                    await this.loadPlaybooks();
                } catch (error) {
                    showToast(error.response?.data?.message || 'Failed to update playbook', 'error');
                }
            });

        } catch (error) {
            showToast('Failed to load playbook content', 'error');
        }
    }

    async deletePlaybook(filename) {
        if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;

        try {
            await api.deletePlaybook(filename);
            showToast('Playbook deleted successfully', 'success');
            await this.loadPlaybooks();
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to delete playbook', 'error');
        }
    }

    async deleteSelected() {
        if (this.selectedPlaybooks.size === 0) return;
        
        if (!confirm(`Are you sure you want to delete ${this.selectedPlaybooks.size} playbook(s)?`)) return;

        let deleted = 0;
        for (const filename of this.selectedPlaybooks) {
            try {
                await api.deletePlaybook(filename);
                deleted++;
            } catch (error) {
                showToast(`Failed to delete ${filename}`, 'error');
            }
        }

        if (deleted > 0) {
            showToast(`${deleted} playbook(s) deleted successfully`, 'success');
            this.clearSelection();
            await this.loadPlaybooks();
        }
    }

    executePlaybook(filename) {
        // Trigger execution modal with this playbook selected
        window.app.showExecutionModal([filename]);
    }

    executeSelected() {
        if (this.selectedPlaybooks.size === 0) return;
        window.app.showExecutionModal(Array.from(this.selectedPlaybooks));
    }

    setupEventListeners() {
        // Context menu for playbooks
        document.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('#playbooksTableBody tr');
            if (row && this.playbooks.length > 0) {
                e.preventDefault();
                this.showContextMenu(e, row);
            }
        });
    }

    showContextMenu(e, row) {
        const cells = row.querySelectorAll('td');
        const playbookName = cells[1].textContent.trim();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;
        
        menu.innerHTML = `
            <div class="context-menu-item" onclick="playbooksComponent.editPlaybook('${playbookName}')">
                <i class="fas fa-edit"></i> Edit
            </div>
            <div class="context-menu-item" onclick="playbooksComponent.executePlaybook('${playbookName}')">
                <i class="fas fa-play"></i> Execute
            </div>
            <div class="context-menu-item danger" onclick="playbooksComponent.deletePlaybook('${playbookName}')">
                <i class="fas fa-trash"></i> Delete
            </div>
        `;

        document.body.appendChild(menu);

        // Remove menu on click elsewhere
        const removeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', removeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', removeMenu);
        }, 0);
    }
}

export const playbooksComponent = new PlaybooksComponent();
