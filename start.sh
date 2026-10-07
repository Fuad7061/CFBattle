#!/bin/bash

# Start PulseAudio in the background
pulseaudio -D --exit-idle-time=-1
# Load a virtual audio sink so Chrome has an audio output device
pacmd load-module module-virtual-sink sink_name=v1
pacmd set-default-sink v1
pacmd set-default-source v1.monitor

# Start X Virtual Framebuffer (Xvfb) for the headless Chrome display
Xvfb :99 -screen 0 720x1280x24 -ac &
export DISPLAY=:99

# Start the Node.js Dashboard / Stream Manager
node server.js
