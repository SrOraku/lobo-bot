# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — Guia de Deploy

🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

**Dev:** 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺
**Contato:** +5543920030769

---

## 🐦 Pterodactyl

1. Crie um servidor Node.js no painel
2. Configure o startup como: `node src/index.js`
3. Faça upload do ZIP ou conecte via GitHub
4. No painel, adicione as variáveis de ambiente:

```
BOT_OWNER=5543920030769
PREFIX=!
LOG_LEVEL=info
NODE_ENV=production
```

5. No terminal do Pterodactyl, rode:
```bash
npm install
```

6. Inicie o servidor — o código de pareamento aparecerá no console

---

## 🐙 GitHub → Pterodactyl

```bash
# Na sua máquina
git init
git add .
git commit -m "🌹 Lobo-Bot v3.0"
git branch -M main
git remote add origin https://github.com/SrOraku/lobo-bot.git
git push -u origin main
```

No Pterodactyl, conecte o repositório GitHub e rode `npm install`.

---

## 📱 Termux

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs git python make clang

cd ~ && unzip lobo-bot.zip -d lobo-bot && cd Lobo-bot-v1
npm install
cp .env.example .env && nano .env

# Rodar em background
pkg install tmux
tmux new -s lobo
npm start
# Sair sem fechar: Ctrl+B → D
# Voltar: tmux attach -t lobo
```

---

## 🖥️ VPS / PM2

```bash
npm install -g pm2
npm install
cp .env.example .env && nano .env
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

---

## ❗ Erros comuns

| Erro | Solução |
|------|---------|
| `MODULE_NOT_FOUND` | Execute `npm install` primeiro |
| `better-sqlite3` falha no build | `npm install --build-from-source better-sqlite3` |
| `sharp` falha | `npm install --ignore-scripts sharp` |
| Código de pareamento expira | Reinicie o bot para gerar novo código |
| Sessão perdida | Delete `sessions/` e reinicie |
