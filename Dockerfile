# ============================================================
# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶ᚠ̴🐺̑⟟̾ — Dockerfile
# Dev: 🌹♆̽Ø᩺Ɍͬ₳Ꮶび♆̶❒᭄꥓〭 🐺
# ============================================================

FROM node:20-alpine

# Dependências nativas para better-sqlite3 e sharp
RUN apk add --no-cache python3 make g++ ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p sessions data logs plugins

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
