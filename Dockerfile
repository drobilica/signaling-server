# Use the official Node.js LTS (Long Term Support) image
FROM node:lts-alpine

RUN npm install -g pnpm


# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy manifests and install deps
COPY package.json pnpm-lock.yaml ./
ENV NODE_ENV=production
RUN chown -R node:node /usr/src/app

RUN pnpm install --frozen-lockfile --prod

# Copy application source
COPY server.mjs ./

# Expose port
ARG PORT=8808
ENV PORT=${PORT}
EXPOSE ${PORT}

# Run as non-root
USER node

# Define the command to run your app
CMD [ "npm", "start" ]

