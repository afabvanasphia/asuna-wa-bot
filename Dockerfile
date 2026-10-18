FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code & assets
COPY tsconfig.json ./
COPY assets/ ./assets/
COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build

EXPOSE 3000

# Start bot
CMD ["npm", "start"]
