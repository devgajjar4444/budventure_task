#!/bin/bash
# Fixes "permission denied" on /var/run/docker.sock (Snap Docker on Ubuntu).
# Run once: bash scripts/fix-docker-permissions.sh

set -e

echo "==> Checking Docker..."
if ! command -v docker &>/dev/null; then
  echo "Docker is not installed. Install with: sudo snap install docker"
  exit 1
fi

echo "==> Creating docker group (if missing)..."
sudo groupadd docker 2>/dev/null || true

echo "==> Adding user '$USER' to docker group..."
sudo usermod -aG docker "$USER"

echo "==> Fixing docker.sock permissions (Snap Docker uses root:root by default)..."
if [ -S /var/run/docker.sock ]; then
  sudo chgrp docker /var/run/docker.sock
  sudo chmod 660 /var/run/docker.sock
fi

echo "==> Restarting Snap Docker..."
sudo snap restart docker

echo ""
echo "Done! Log out and log back in, OR run:"
echo "  newgrp docker"
echo ""
echo "Then start the stack:"
echo "  cd ~/task_one && docker compose up --build -d"
echo "  bash scripts/test-api.sh"
