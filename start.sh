#!/bin/bash

# Clean up stale locks/sockets if container restarted
rm -rf /tmp/pulse-* /var/run/pulse /root/.config/pulse 2>/dev/null || true

# Start PulseAudio daemon in the background (ignore root warning)
pulseaudio -D --exit-idle-time=-1 --system=false --disallow-exit
sleep 2

# Enable TCP native protocol for localhost so all processes can connect cleanly
pactl load-module module-native-protocol-tcp auth-anonymous=1 port=4713 2>/dev/null || true

# Load virtual null-sinks for multi-channel isolated audio capture (v1, v2, v3, v4)
for i in 1 2 3 4; do
    pactl load-module module-null-sink sink_name=v$i sink_properties=device.description="Virtual_Sink_$i" 2>/dev/null || true
    # Keep PulseAudio null-sink clock active 24/7 by streaming silence from /dev/zero
    pacat --playback --device=v$i --rate=44100 --channels=2 --format=s16le < /dev/zero &
done

pactl set-default-sink v1
pactl set-default-source v1.monitor
export PULSE_SERVER=127.0.0.1:4713

# Start X Virtual Framebuffers (Xvfb) for multi-channel isolated headless Chrome displays (:99, :100, :101, :102)
for disp in 99 100 101 102; do
    Xvfb :$disp -screen 0 1080x1920x24 -ac &
done
export DISPLAY=:99

# Start the Node.js Dashboard / Stream Manager
node server.js
