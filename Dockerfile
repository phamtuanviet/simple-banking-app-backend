# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:18-alpine

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy built application from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the application port (can be overridden by .env)
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/main"]