FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
COPY data/reading-plan-365.json ./data/reading-plan-365.json

ENV NODE_ENV=production
ENV PORT=3847
ENV HOST=0.0.0.0
ENV DATA_DIR=/data

RUN mkdir -p /data && cp ./data/reading-plan-365.json /data/reading-plan-365.json

EXPOSE 3847

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3847/api/health || exit 1

CMD ["node", "server.js"]
