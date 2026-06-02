FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server.js ./
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=3847
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

# 建置時從網路抓取 365 天讀經計劃（無需把 JSON 放進 GitHub）
RUN mkdir -p /app/data && node scripts/fetch-reading-plan.js

EXPOSE 3847

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3847/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
