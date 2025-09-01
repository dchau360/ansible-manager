import { API } from './api.js';
import { showToast } from './utils/notifications.js';

class AuthManager {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
        this.callbacks = [];
    }

    isAuthenticated() {
        return !!this.token && !!this.user;
    }

    async login(username, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.access_token;
                this.user = data.user;
                localStorage.setItem('authToken', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));
                
                // Set default authorization header
                API.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
                
                this.notifyCallbacks('login');
                return { success: true };
            } else {
                return { success: false, message: data.message };
            }
        } catch (error) {
            return { success: false, message: 'Network error' };
        }
    }

    async register(userData) {
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.access_token;
                this.user = data.user;
                localStorage.setItem('authToken', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));
                
                API.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
                
                this.notifyCallbacks('register');
                return { success: true };
            } else {
                return { success: false, message: data.message };
            }
        } catch (error) {
            return { success: false, message: 'Network error' };
        }
    }

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        delete API.defaults.headers.common['Authorization'];
        this.notifyCallbacks('logout');
    }

    onAuthChange(callback) {
        this.callbacks.push(callback);
    }

    notifyCallbacks(event) {
        this.callbacks.forEach(callback => callback(event, this.user));
    }

    initializeAuth() {
        if (this.token) {
            API.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
        }
    }

    getCurrentUser() {
        return this.user;
    }

    isAdmin() {
        return this.user && this.user.is_admin;
    }
}

export const Auth = new AuthManager();
