# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
ENV DATA_DIR=/data PORT=3000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -q --spider http://localhost:3000/healthz || exit 1
EXPOSE 3000
CMD ["node", "src/main.js"]
