FROM node:18-bookworm-slim

# Install OS dependencies for Headless Chrome, Xvfb, FFmpeg and PulseAudio
RUN apt-get update && apt-get install -y \
    ffmpeg \
    xvfb \
    chromium \
    pulseaudio \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app

# Ensure data directory exists and has right permissions for persistent storage
RUN mkdir -p /app/data && chmod 777 /app/data
ENV DATA_DIR="/app/data"

# Default Login Key (Can be overridden in Coolify ENV variables)
ENV LOGIN_KEY="admin"

# Install Node.js dependencies (Production only to save space)
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy project files
COPY . .

# Build React Game automatically and clean up node_modules to save huge storage space
WORKDIR /app/react-game
RUN npm install && npm run build && rm -rf node_modules && npm cache clean --force
WORKDIR /app

# Make the startup script executable
RUN chmod +x start.sh

# Expose the dashboard port
EXPOSE 3000

# Container healthcheck for Coolify and Docker
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/health || exit 1

# Start Xvfb, PulseAudio, and Node server
CMD ["./start.sh"]
