# syntax=docker/dockerfile:1
# Pinned to an exact Node + Alpine version AND its digest, so two builds months apart give the same base.
# To update: docker pull node:20-alpine, read `node -v` and /etc/alpine-release, then replace tag and digest together.
FROM node:20.20.2-alpine3.23@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
ENV DATA_DIR=/data PORT=3000
# 127.0.0.1, not localhost: inside Alpine "localhost" resolves to IPv6 (::1) first and the app listens on IPv4 only.
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -q --spider http://127.0.0.1:3000/healthz || exit 1
EXPOSE 3000
CMD ["node", "src/main.js"]
