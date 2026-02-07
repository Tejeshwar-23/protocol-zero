FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Create volume directory for SQLite
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data
VOLUME /app/data

# Start command
CMD ["node", "server/index.js"]
