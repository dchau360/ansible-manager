import './style.css';
import { Auth } from './auth.js';
import { Socket } from './utils/socket.js';
import { showToast } from './utils/notifications.js';

// Import components
import { playbooksComponent } from './components/playbooks.js';
import { nodesComponent } from './components/nodes.js';
import { groupsComponent } from './components/groups.js';
import { inventoryComponent } from './components/inventory.js';
import { executionsComponent } from './components/executions.js';

class AnsiblePortalApp {
    constructor() {
        this.currentComponent = null;
        this.components = {
            playbooks: playbooksComponent,
            nodes: nodesComponent,
            groups: groupsComponent,
            inventory: inventoryComponent,
            executions: executionsComponent
        };
        
        // Make app globally available for component interactions
        window.app = this;
    }

    async init() {
        // Initialize auth
        Auth.initializeAuth();
        
        // Check authentication
        if (!Auth.isAuthenticated()) {
            this.showLoginModal();
            return;
        }

        // Setup auth change listener
        Auth.onAuthChange((event) => {
            if (event === 'logout') {
                this.showLoginModal();
            }
        });

        // Initialize the app
        await this.initializeApp();
    }

    async initializeApp() {
        // Hide loading
        document.getElementById('loading').style.display = 'none';
        
        // Setup main layout
        this.setupLayout();
        
        // Connect to WebSocket
        Socket.connect();
        
        // Load default component
        await this.showComponent('playbooks');
        
        // Show welcome message
        const user = Auth.getCurrentUser();
        showToast(`Welcome back, ${user.username}!`, 'success');
    }

    setupLayout() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="main-container">
                <nav class="sidebar">
                    <div class="sidebar-header">
                        <h2>Ansible Portal</h2>
                    </div>
                    <ul class="nav-menu">
                        <li class="nav-item">
                            <a href="#" class="nav-link active" data-component="playbooks">
                                <i class="fas fa-scroll"></i>
                                Playbooks
                            </a>
                        </li>
                        <li class="nav-item">
                            <a href="#" class="nav-link" data-component="nodes">
                                <i class="fas fa-server"></i>
                                Nodes
                            </a>
                        </li>
                        <li class="nav-item">
                            <a href="#" class="nav-link" data-component="groups">
                                <i class="fas fa-users"></i>
                                Groups
                            </a>
                        </li>
                        <li class="nav-item">
                            <a href="#" class="nav-link" data-component="inventory">
                                <i class="fas fa-file-import"></i>
                                Inventory
                            </a>
                        </li>
                        <li class="nav-item">
                            <a href="#" class="nav-link" data-component="executions">
                                <i class="fas fa-history"></i>
                                Executions
                            </a>
                        </li>
                    </ul>
                    <div class="sidebar-footer">
                        <div class="user-info">
                            <i class="fas fa-user"></i>
                            <span>${Auth.getCurrentUser().username}</span>
                        </div>
                        <button class="btn btn-secondary btn-sm" onclick="app.logout()">
                            <i class="fas fa-sign-out-alt"></i>
                            Logout
                        </button>
                    </div>
                </nav>
                <div class="content">
                    <div class="header">
                        <div>
                            <h1 id="pageTitle">Playbooks</h1>
                            <p class="text-muted" id="pageDescription">Manage your Ansible playbooks</p>
                        </div>
                        <div class="header-actions">
                            <button class="btn btn-secondary" onclick="app.refreshCurrentComponent()">
                                <i class="fas fa-refresh"></i>
                            </button>
                        </div>
                    </div>
                    <div id="componentContainer">
                        <!-- Component content will be loaded here -->
                    </div>
                </div>
            </div>
        `;

        // Setup navigation
        this.setupNavigation();
    }

    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const component = link.dataset.component;
                await this.showComponent(component);
                
                // Update active nav
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });
    }

    async showComponent(componentName) {
        const component = this.components[componentName];
        if (!component) return;

        this.currentComponent = component;
        
        // Update page info
        const titles = {
            playbooks: { title: 'Playbooks', description: 'Manage your Ansible playbooks' },
            nodes: { title: 'Nodes', description: 'Manage target servers and hosts' },
            groups: { title: 'Groups', description: 'Organize nodes into groups' },
            inventory: { title: 'Inventory Import', description: 'Import inventory files and manage imports' },
            executions: { title: 'Executions', description: 'View playbook execution history and status' }
        };

        const pageInfo = titles[componentName];
        document.getElementById('pageTitle').textContent = pageInfo.title;
        document.getElementById('pageDescription').textContent = pageInfo.description;

        // Render component
        const container = document.getElementById('componentContainer');
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><span>Loading...</span></div>';
        
        try {
            const html = await component.render();
            container.innerHTML = html;
            
            if (component.init) {
                await component.init();
            }
        } catch (error) {
            console.error(`Error loading ${componentName} component:`, error);
            container.innerHTML = '<div class="text-center text-muted">Error loading component</div>';
            showToast(`Error loading ${componentName} component`, 'error');
        }
    }

    async refreshCurrentComponent() {
        if (this.currentComponent && this.currentComponent.loadData) {
            await this.currentComponent.loadData();
            showToast('Data refreshed', 'success');
        }
    }

    showLoginModal() {
        // Disconnect socket if connected
        Socket.disconnect();
        
        // Show login modal
        const loginModal = document.getElementById('loginModal');
        loginModal.classList.remove('hidden');

        // Setup login form
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const username = formData.get('username');
            const password = formData.get('password');

            const result = await Auth.login(username, password);
            if (result.success) {
                loginModal.classList.add('hidden');
                await this.initializeApp();
            } else {
                if (result.message.includes('Registration disabled')) {
                    // No admin users exist, show registration
                    document.getElementById('firstTimeSetup').classList.remove('hidden');
                } else {
                    showToast(result.message, 'error');
                }
            }
        });

        // Setup registration form (first-time setup)
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const userData = Object.fromEntries(formData);

            const result = await Auth.register(userData);
            if (result.success) {
                loginModal.classList.add('hidden');
                await this.initializeApp();
                showToast('Admin account created successfully!', 'success');
            } else {
                showToast(result.message, 'error');
            }
        });

        // Try to determine if this is first-time setup
        this.checkFirstTimeSetup();
    }

    async checkFirstTimeSetup() {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: '', password: '' })
            });
            
            const data = await response.json();
            if (data.message && data.message.includes('Registration disabled')) {
                // Normal login, registration disabled
                document.getElementById('firstTimeSetup').classList.add('hidden');
            }
        } catch (error) {
            // Assume first-time setup needed
            document.getElementById('firstTimeSetup').classList.remove('hidden');
        }
    }

    logout() {
        if (confirm('Are you sure you want to logout?')) {
            Auth.logout();
            showToast('Logged out successfully', 'success');
        }
    }

    // Helper method for components to show execution modal
    showExecutionModal(selectedPlaybooks = [], selectedNodes = [], selectedGroups = []) {
        executionsComponent.showExecutionModal(selectedPlaybooks, selectedNodes, selectedGroups);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new AnsiblePortalApp();
    app.init();
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('An unexpected error occurred', 'error');
});

// Add additional CSS for the main app layout
const appStyles = document.createElement('style');
appStyles.textContent = `
    .sidebar-header {
        padding: 20px;
        border-bottom: 1px solid #34495e;
        margin-bottom: 20px;
    }
    
    .sidebar-header h2 {
        margin: 0;
        font-size: 1.5rem;
        color: #ecf0f1;
    }
    
    .sidebar-footer {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 20px;
        border-top: 1px solid #34495e;
        background: #2c3e50;
    }
    
    .user-info {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #bdc3c7;
        margin-bottom: 10px;
        font-size: 14px;
    }
    
    .header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    #pageDescription {
        margin: 0;
        font-size: 14px;
    }
    
    @media (max-width: 768px) {
        .sidebar {
            z-index: 1000;
        }
        
        .sidebar-footer {
            position: relative;
        }
        
        .content {
            padding: 10px;
        }
        
        .header {
            flex-direction: column;
            align-items: flex-start;
            gap: 15px;
        }
    }
`;
document.head.appendChild(appStyles);
