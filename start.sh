#!/bin/bash

# Start PulseAudio in the background (ignore root warning)
pulseaudio -D --exit-idle-time=-1
sleep 2

# Load a null sink so Chrome has an audio output device
pactl load-module module-null-sink sink_name=v1
pactl set-default-sink v1
pactl set-default-source v1.monitor

# Start X Virtual Framebuffer (Xvfb) for the headless Chrome display
Xvfb :99 -screen 0 1080x1920x24 -ac &
export DISPLAY=:99

# Start the Node.js Dashboard / Stream Manager
node server.js
