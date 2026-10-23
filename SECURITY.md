# Segurança da instalação

## Correção v1.0.1

Diretórios pessoais anteriormente versionados foram retirados da árvore atual: `.ssh`, `.config`, `.npm`, `.cache`, `.termux`, `.bash_history`, `.gitconfig` e `SpamWa`. Os arquivos locais não são apagados pela retirada do índice. Seus conteúdos não foram inspecionados nesta revisão. A existência de credenciais utilizáveis não foi confirmada; por precaução, credenciais que tenham estado nesses caminhos precisam ser substituídas.

**Esta correção não apaga o histórico Git.** Quem acessa commits antigos ainda pode recuperar arquivos publicados. Tornar o repositório privado ou apagar um arquivo em novo commit não revoga credenciais já copiadas.

## Ações na conta, antes da limpeza do histórico

1. Revogue tokens que tenham estado na configuração do GitHub CLI e gere substitutos apenas quando necessários. Revise tokens pessoais, autorizações de aplicativos e sessões da conta GitHub.
2. Remova chaves SSH expostas das contas GitHub e dos servidores onde estavam autorizadas; gere novas. Não basta mudar a senha da chave privada.
3. Troque outras senhas ou chaves que possam ter aparecido no histórico do terminal ou em configurações publicadas.
4. Ative autenticação de dois fatores e revise o histórico de segurança da conta.

Faça essas ações nas páginas oficiais das respectivas contas. Nunca envie tokens, senhas, chaves privadas ou arquivos de sessão em issues ou no chat.

## Limpeza de histórico — procedimento preparado, não executado

Essa operação reescreve commits e pode afetar todos os colaboradores, branches, tags e instalações com clones antigos. Primeiro coordene uma pausa nos pushes e faça uma cópia privada do repositório, protegida e fora de qualquer pasta publicada. Instale `git-filter-repo` seguindo sua documentação oficial. Em um clone novo destinado somente à limpeza:

```bash
git clone --mirror https://github.com/SrOraku/lobo-bot.git lobo-bot-history-clean.git
cd lobo-bot-history-clean.git
git filter-repo --invert-paths \
  --path .ssh/ --path .config/ --path .npm/ --path .cache/ \
  --path .termux/ --path .bash_history --path .gitconfig --path SpamWa
```

Revise os nomes dos arquivos remanescentes e todas as referências; nomes alternativos e arquivos renomeados também precisam entrar no filtro. Não publique um dump de conteúdo para conferir. O filtro pode remover o remote `origin` como proteção. **O envio forçado do histórico não foi autorizado nem executado nesta revisão**; confirme o impacto antes de publicar branches e tags reescritas. Depois, peça novos clones aos colaboradores e consulte o suporte GitHub sobre referências de pull requests e conteúdo sensível em cache. Clones e forks de terceiros não são eliminados pela reescrita.

## Docker

`.dockerignore` exclui credenciais, Git, sessões, dados, backups e diretórios pessoais do contexto. O contêiner executa como usuário `node` (UID 1000). O Compose lê `.env` em tempo de execução, sem incluí-lo na imagem, conecta Redis pela rede interna e usa `America/Sao_Paulo` para horários locais. Cooldowns baseados em duração não mudam com o fuso.

Os volumes continuam apontando para as pastas existentes, preservando os dados. Antes de iniciar, o administrador do servidor deve garantir que UID 1000 possa escrever em `sessions`, `data`, `storage/alcateia`, `logs`, `plugins` e `updates`. Não use permissões globais `777`. Ajuste propriedade somente dessas pastas da instalação, após backup; não altere a propriedade do sistema inteiro. Imagens e contêineres antigos podem conter arquivos copiados antes desta correção e precisam ser reconstruídos e descartados com cuidado.

## Identidade e atualização

O dono e contato públicos foram mantidos conforme determinação do proprietário do bot. Quem fizer um fork precisa configurar `BOT_OWNER` e revisar `BOT_OWNERS` antes de conectar. Publicar o número de contato não é equivalente a publicar um token; essa configuração concede autoridade na instalação e deve ser compreendida por quem a reutiliza.

O atualizador ainda usa `main`, validando o snapshot e preparando backup antes da troca. Isso não protege contra comprometimento da conta mantenedora. Proteja a conta e as permissões de escrita. Migração para releases assinadas exige definir o processo de publicação e a raiz de confiança; um checksum publicado pela mesma conta, sozinho, não resolve esse risco.

A CI executa testes, sintaxe e diagnóstico em Node 22/24. Verificação de sintaxe não substitui ESLint ou uma auditoria de segurança. A configuração Compose foi validada com o exemplo de ambiente. O build da imagem e a conexão real do WhatsApp não foram executados nesta revisão.
