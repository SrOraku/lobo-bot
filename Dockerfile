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

COPY . .

RUN mkdir -p sessions data logs plugins

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
