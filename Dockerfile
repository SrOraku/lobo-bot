# ============================================================
# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — Dockerfile
# Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺
# ============================================================

FROM node:22-alpine

# Dependências nativas para better-sqlite3 e sharp
RUN apk add --no-cache git python3 make g++ ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --chown=node:node . .

RUN mkdir -p sessions data logs plugins storage/alcateia updates && chown -R node:node /app

ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
USER node

CMD ["node", "src/index.js"]
