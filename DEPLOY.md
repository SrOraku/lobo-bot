# 🌹ᵇᵒᵗঔৣ‌ʟᴏʙᴏ⟠̾♆̶🐺̑ — Guia de Deploy

🌹𝕹ã𝖔 𝖒𝖊𝖝𝖆 𝖈𝖔𝖒 𝖚𝖒 𝖑𝖔𝖇𝖔 𝖆𝖘𝖘𝖎𝖒 𝖓ã𝖔 𝖕𝖊𝖗𝖆 𝖓𝖔𝖘𝖘𝖆 𝖎𝖗á🐺

**Dev:** 🌹♆̽Ø᩺Ɍͬ₳Ꮶび᭄🐺
**Contato:** +5543920030769

---

## 🐦 Pterodactyl

1. Crie um servidor com Node.js 22 atualizado (mínimo 22.12; validado em 22.23.3)
2. Configure o startup como: `node src/index.js`
3. Faça upload do projeto completo ou conecte via GitHub. `package.json`, `package-lock.json` e a pasta `src/` precisam estar juntos na raiz do servidor, normalmente `/home/container`.
4. No painel, adicione as variáveis de ambiente:

```
BOT_OWNER=5543920030769
PREFIX=!
LOG_LEVEL=info
NODE_ENV=production
```

5. Inicie o servidor. Caso faltem dependências, o próprio `src/index.js` executa a instalação antes de carregar o bot. Aguarde a primeira instalação terminar. Se tiver acesso a um terminal de sistema, também pode instalar previamente:
```bash
npm ci --omit=dev --no-audit --no-fund
```

6. Após instalar, o código de pareamento aparecerá no console. Nos próximos inícios os pacotes existentes são reutilizados. Não digite comandos de sistema no console de um processo Node em execução.

Se já houve `MODULE_NOT_FOUND` na linha que carrega `dotenv`, atualize os arquivos pelo GitHub ou ZIP, mantenha o startup `node src/index.js` e reinicie. Preserve `.env`, `sessions/`, `data/` e `storage/alcateia/` da instalação existente.

Para verificar apenas as dependências, sem conectar ao WhatsApp nem alterar os dados: `npm run check:startup`.

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

No Pterodactyl, conecte o repositório GitHub e inicie com `node src/index.js`. A instalação automática resolve os pacotes ausentes.

---

## 📱 Termux

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs git python make clang

cd ~ && unzip Lobo-bot-v1.zip && cd Lobo-bot-v1
npm ci
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
npm ci
cp .env.example .env && nano .env
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

---

## ❗ Erros comuns

| Erro | Solução |
|------|---------|
| `MODULE_NOT_FOUND` | Atualize `src/bootstrap.js`, `src/index.js`, `package.json` e `package-lock.json`, depois reinicie com Node 22 |
| `better-sqlite3` falha no build | `npm install --build-from-source better-sqlite3` |
| `sharp` falha | Reinstale com `npm ci --include=optional` |
| Código de pareamento expira | Reinicie o bot para gerar novo código |
| Sessão perdida | Delete `sessions/` e reinicie |
