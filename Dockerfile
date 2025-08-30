# Multi-stage build for optimized image size
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Production stage
FROM node:20-alpine

# Install runtime dependencies
# Adding tools that might be needed for system diagnostics
RUN apk add --no-cache \
    bash \
    curl \
    net-tools \
    procps \
    iputils \
    busybox-extras \
    tcpdump \
    strace \
    lsof \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy node modules from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application files
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs src/ ./src/
COPY --chown=nodejs:nodejs public/ ./public/
COPY --chown=nodejs:nodejs utils/ ./utils/
COPY --chown=nodejs:nodejs *.md ./
COPY --chown=nodejs:nodejs *.sh ./
COPY --chown=nodejs:nodejs windows-client.ps1 ./
COPY --chown=nodejs:nodejs .eslintrc.js ./
COPY --chown=nodejs:nodejs eslint.config.js ./

# Create directories for logs and data
RUN mkdir -p /app/logs /app/data /data/local/tmp && \
    chown -R nodejs:nodejs /app/logs /app/data && \
    chmod 777 /data/local/tmp || true

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    API_KEY=diagnostic-api-key-2024

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})" || exit 1

# Switch to non-root user
USER nodejs

# Start the application
CMD ["node", "src/server.js"]