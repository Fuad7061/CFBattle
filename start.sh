#!/bin/bash

# Clean up stale locks/sockets if container restarted
rm -rf /tmp/pulse-* /var/run/pulse /root/.config/pulse 2>/dev/null || true

# Start PulseAudio daemon in the background (ignore root warning)
pulseaudio -D --exit-idle-time=-1 --system=false --disallow-exit
sleep 2

# Enable TCP native protocol for localhost so all processes can connect cleanly
pactl load-module module-native-protocol-tcp auth-anonymous=1 port=4713 2>/dev/null || true

# Load a virtual null-sink for audio capture
pactl load-module module-null-sink sink_name=v1 sink_properties=device.description="Virtual_Sink"
pactl set-default-sink v1
pactl set-default-source v1.monitor

export PULSE_SERVER=127.0.0.1:4713

# Keep PulseAudio null-sink clock active 24/7 by streaming silence from /dev/zero
# This guarantees v1.monitor ALWAYS outputs continuous 44.1kHz audio to FFmpeg,
# preventing the "audio bitrate (0)" error and eliminating video muxing lag!
pacat --playback --device=v1 --rate=44100 --channels=2 --format=s16le < /dev/zero &

# Start X Virtual Framebuffer (Xvfb) for the headless Chrome display
Xvfb :99 -screen 0 1080x1920x24 -ac &
export DISPLAY=:99

# Start the Node.js Dashboard / Stream Manager
node server.js
