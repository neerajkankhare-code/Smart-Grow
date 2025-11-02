# Use official Node LTS slim image
FROM node:20-slim

# Install sharp dependencies
RUN apt-get update && apt-get install -y \
    libc6 \
    libvips \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
