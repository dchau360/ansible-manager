import { io } from 'socket.io-client';
import { showToast } from './notifications.js';

class SocketManager {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
    }

    connect() {
        if (this.socket?.connected) return;

        this.socket = io('/', {
            transports: ['websocket', 'polling'],
            upgrade: true
        });

        this.socket.on('connect', () => {
            console.log('Socket connected');
            showToast('Real-time connection established', 'success');
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            showToast('Real-time connection lost', 'warning');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            showToast('Failed to establish real-time connection', 'error');
        });

        // Set up event listeners
        this.listeners.forEach((callback, event) => {
            this.socket.on(event, callback);
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    on(event, callback) {
        this.listeners.set(event, callback);
        if (this.socket) {
            this.socket.on(event, callback);
        }
    }

    off(event) {
        this.listeners.delete(event);
        if (this.socket) {
            this.socket.off(event);
        }
    }

    emit(event, data) {
        if (this.socket?.connected) {
            this.socket.emit(event, data);
        }
    }
}

export const Socket = new SocketManager();
