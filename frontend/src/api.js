import axios from 'axios';
import { Auth } from './auth.js';
import { showToast } from './utils/notifications.js';

// Create axios instance
export const API = axios.create({
    baseURL: '/api',
    timeout: 30000
});

// Request interceptor
API.interceptors.request.use(
    config => {
        const token = localStorage.getItem('authToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    error => {
        return Promise.reject(error);
    }
);

// Response interceptor
API.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            Auth.logout();
            showToast('Session expired. Please login again.', 'warning');
            window.location.reload();
        } else if (error.response?.status >= 500) {
            showToast('Server error occurred', 'error');
        } else if (error.code === 'ECONNABORTED') {
            showToast('Request timeout', 'warning');
        }
        return Promise.reject(error);
    }
);

// API methods
export const api = {
    // Auth
    login: (credentials) => API.post('/auth/login', credentials),
    register: (userData) => API.post('/auth/register', userData),
    getCurrentUser: () => API.get('/auth/me'),

    // Playbooks
    getPlaybooks: () => API.get('/playbooks'),
    uploadPlaybook: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return API.post('/playbooks', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    createPlaybook: (filename) => API.post('/playbooks/create', { filename }),
    getPlaybook: (filename) => API.get(`/playbooks/${filename}`),
    updatePlaybook: (filename, content) => API.put(`/playbooks/${filename}`, { content }),
    deletePlaybook: (filename) => API.delete(`/playbooks/${filename}`),

    // Nodes
    getNodes: () => API.get('/nodes'),
    createNode: (nodeData) => API.post('/nodes', nodeData),
    getNode: (id) => API.get(`/nodes/${id}`),
    updateNode: (id, nodeData) => API.put(`/nodes/${id}`, nodeData),
    deleteNode: (id) => API.delete(`/nodes/${id}`),
    pingNode: (id) => API.post(`/nodes/${id}/ping`),

    // Groups
    getGroups: () => API.get('/groups'),
    createGroup: (groupData) => API.post('/groups', groupData),
    getGroup: (id) => API.get(`/groups/${id}`),
    updateGroup: (id, groupData) => API.put(`/groups/${id}`, groupData),
    deleteGroup: (id) => API.delete(`/groups/${id}`),
    addNodesToGroup: (groupId, nodeIds) => API.post(`/groups/${groupId}/nodes`, { node_ids: nodeIds }),
    removeNodeFromGroup: (groupId, nodeId) => API.delete(`/groups/${groupId}/nodes/${nodeId}`),

    // Executions
    getExecutions: () => API.get('/executions'),
    createExecution: (executionData) => API.post('/executions', executionData),
    getExecution: (id) => API.get(`/executions/${id}`),
    cancelExecution: (id) => API.post(`/executions/${id}/cancel`),

    // Inventory
    getImports: () => API.get('/inventory/imports'),
    uploadInventory: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return API.post('/inventory/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    pasteInventory: (content, format) => API.post('/inventory/paste', { content, format }),
    executeImport: (importId) => API.post(`/inventory/imports/${importId}/execute`),
    rollbackImport: (importId) => API.post(`/inventory/imports/${importId}/rollback`)
};
