#!/bin/bash

echo "Setting up Ansible Portal..."

# Create required directories
mkdir -p data/{postgres,redis,playbooks,inventory,logs,nginx/logs}

# Set permissions
chmod -R 755 data/

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << EOF
POSTGRES_DB=ansible_portal
POSTGRES_USER=ansible_user
POSTGRES_PASSWORD=$(openssl rand -base64 32)
SECRET_KEY=$(openssl rand -base64 32)
FLASK_ENV=development
NODE_ENV=development
EOF
    echo ".env file created with random passwords"
fi

# Build and start services
echo "Building and starting services..."
docker compose build
docker compose up -d

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 10

# Check if services are running
echo "Checking service status..."
docker compose ps

echo ""
echo "Setup complete! The Ansible Portal should be available at:"
echo "http://localhost"
echo ""
echo "Default admin credentials will be: admin/admin123"
echo "Please change this after first login!"
