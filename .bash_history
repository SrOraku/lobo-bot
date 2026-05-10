termux-setup-storage
pkg update && pkg upgrade -y
pkg install git gh nodejs -y
cd storage/shared/Downloads/lobo-bo
ls
cd storage/shared/Downloads/lobo-bot
cd /storage/emulated/0/Download/lobo-bot
ls
nano .gitignore
git init
git add .
git commit -m "feat: primeiro commit do Lobo Bot WhatsApp 🚀"
git branch -M main
git remote add origin https://github.com/SEUUSUARIO/lobo-bot.git
gh auth login
cd /storage/emulated/0/Download/lobo-bot-v
# 1. Instala tudo com a versão certa da Baileys (importante pro Bronxys)
npm install
# 1. Volta pra pasta certa do lobo-bot-v1
cd /storage/emulated/0/Download/lobo-bot-v
cd /storage/emulated/0/Download/lobo-bot-v1
pwd
ls
# 3. Instala tudo com a versão exata da Baileys que o Bronxys aceita
npm install
cd /storage/emulated/0/Download/lobo-bot-v1
zip -r ../lobo-bot-v1.zip .   -x "node_modules/*"   -x "sessions/*"   -x "auth_info_baileys/*"   -x "*.log"   -x "lobo.db*"   -x "__pycache__/*"   -x ".git/*"   -x ".env"   -x "npm-debug.log*"
# 1. Corrige o erro de segurança (dubious ownership)
git config --global --add safe.directory /storage/emulated/0/Download/lobo-bot
# 2. Corrige o link do repositório com seu usuário correto
git remote set-url origin https://github.com/SrOraku/lobo-bot.git
# 3. Verifica se está tudo certo
git remote -v
gh auth login
cd /storage/emulated/0/Download/lobo-bot
git push -u origin main
cd /storage/emulated/0/Download/lobo-bot
git branch -M main
git push -u origin main
cd /storage/emulated/0/Download/lobo-bot
git status
git add .
git commit -m "feat: primeiro commit do Lobo Bot WhatsApp 🚀"
git branch -M main
git push -u origin main
cd /storage/emulated/0/Download/lobo-bo
cd /storage/emulated/0/Download/lobo-bot
git config --global user.name "SrOraku"
git config --global user.email "s


git config --global user.email "nathanork9@gmail.com"
cd /storage/emulated/0/Download/lobo-bot
cd /storage/emulated/0/Download/lobo-bot
git config --global user.name "SrOraku"
git config --global user.email "nathanork9@gmail.com"
git add .
git commit -m "feat: primeiro commit do Lobo Bot WhatsApp 🚀"
git branch -M main
git push -u origin main
cd /storage/emulated/0/Download/lobo-bo
git remote add origin https://github.com/SrOraku/lobo-bot.git
git remote -v
git push -u origin main
cd /storage/emulated/0/Download/lobo-bot
git push -u origin mai
cd /storage/emulated/0/Download/lobo-bot
git push -u origin main
cd /storage/emulated/0/Download/lobo-bot
git status
cd /storage/emulated/0/Download/lobo-bot
git status
cd /storage/emulated/0/Download/lobo-bot
git status
cd "/storage/emulated/0/Download/lobo bot v3"
cd /storage/emulated/0/Download/lobo-bot-v3-fina
cd /storage/emulated/0/Download/lobo-bot-v3-final
git status
git add .
git commit -m "Atualização v3-final - melhorias e correções do Claude"
git push origin main
export GIT_DISCOVERY_ACROSS_FILESYSTEM=1
git config --global --add safe.directory /storage/emulated/0/Download/lobo-bot-v3-final
git init
git remote add origin https://github.com/SrOraku/lobo-bot.git
git branch -M main
git add .
git commit -m "Atualização v3-final - melhorias e correções do Claude Sonnet"
git push -u origin main --force
cd /storage/emulated/0/Download/lobo-bot-v1
rm -rf .git 2>/dev/null
git init
git branch -M main
git remote add origin https://github.com/SrOraku/lobo-bot.git
git add .
git commit -m "v1-final - bot pronto pro Bronxys"
git push -u origin main --forc
# 1. Atualiza tudo do Termux (importante)
pkg update && pkg upgrade -y
# 2. Entra na pasta atual e renomeia para lobo-bot-v1
cd \~
mv lobo-bot lobo-bot-v1
cd lobo-bot-v1
pwd
l
cd \~
mv lobo-bot lobo-bot-v1 2>/dev/null || echo "✅ Já estava renomeado ou pasta não existe"
cd lobo-bot-v1
pwd
ls
# 1. Sobe uma pasta e corrige a duplicação (super seguro)
cd ..
mv lobo-bot-v1/* . 2>/dev/null || true
rm -rf lobo-bot-v1
ls
pw
# 1. Confirma que tá tudo certo (só pra ter certeza)
pwd
ls
# 2. Atualiza o nome do bot pra ficar oficial (lobo-bot-v1)
nano package.json
# 1. Muda o nome do bot pra lobo-bot-v1
sed -i 's/"name": "lobo-bot"/"name": "lobo-bot-v1"/' package.json
# 2. Muda a versão pra 1.0.0-v1 (versão nova e oficial)
sed -i 's/"version": "3.0.0"/"version": "1.0.0-v1"/' package.json
# 3. Confere se mudou certinho (mostra as primeiras linhas)
cat package.json | head -n 15
npm install
npm update
# 1. Instala tudo com a versão certa da Baileys (importante pro Bronxys)
npm instal
