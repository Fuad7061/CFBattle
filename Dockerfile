FROM node:18-bookworm-slim

# Install OS dependencies for Headless Chrome, Xvfb, FFmpeg and PulseAudio
RUN apt-get update && apt-get install -y \
    ffmpeg \
    xvfb \
    chromium \
    pulseaudio \
    && rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /app

# Ensure data directory exists and has right permissions for persistent storage
RUN mkdir -p /app/data && chmod 777 /app/data
ENV DATA_DIR="/app/data"

# Default Login Key (Can be overridden in Coolify ENV variables)
ENV LOGIN_KEY="admin"

# Install Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy project files
COPY . .

# Make the startup script executable
RUN chmod +x start.sh

# Expose the dashboard port
EXPOSE 3000

# Start Xvfb, PulseAudio, and Node server
CMD ["./start.sh"]
