FROM node:20-slim

# Install Python + yt-dlp + ffmpeg
RUN apt-get update && apt-get install -y \
    python3 python3-pip ffmpeg curl \
    && pip3 install yt-dlp --break-system-packages \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
