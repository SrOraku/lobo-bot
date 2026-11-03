# Prompt de construção do LOBO-BOT LICENSE HUB no Base44

Crie um aplicativo web chamado **LOBO-BOT LICENSE HUB**, com interface administrativa profissional, responsiva e em português do Brasil. Não altere o nome, escopo ou identidade do produto.

## Regra inviolável de proprietário

O único administrador é o usuário com e-mail verificado exatamente igual a `Nathanork9@gmail.com`. Essa regra deve ser aplicada em backend/server functions e em todas as consultas e mutações, não apenas na interface. Negar acesso administrativo se o e-mail não estiver verificado. Não criar cadastro, convite ou promoção pública de administradores. Nenhum outro usuário pode visualizar dados globais nem executar ações administrativas.

Clientes podem entrar no portal e ver apenas o próprio perfil, licenças, instalações e pagamentos associados à sua própria conta. Aplicar isolamento de dados no backend para todas as entidades.

## Páginas

- Login e recuperação de acesso pelo provedor de autenticação.
- Dashboard administrativo com cartões: clientes totais, licenças ativas, suspensas, expiradas, instalações vinculadas e pagamentos registrados.
- Clientes: listar, pesquisar, criar, editar, bloquear/desbloquear e abrir histórico.
- Licenças: emitir chave forte e única, selecionar cliente, produto/plano, data de início, validade e máximo de instalações; ativar, suspender, revogar e renovar; exibir estado e histórico.
- Pagamentos: registrar e acompanhar pendente, aprovado ou recusado; valor, moeda, método, referência e data; aprovação manual explicitamente identificada como manual. Não declarar integração automática com gateway sem configurar e validar um.
- Instalações: listar instâncias por licença, último contato, identificador, status e ação de revogar instalação.
- Auditoria: registrar quem fez cada ação, quando, qual registro foi alterado e o resultado.
- Portal do cliente: mostrar somente suas licenças, status, validade, instalação e pagamentos.

## Dados

Criar entidades para Users, Customers, Products, Plans, Licenses, Installations, Payments e AuditLogs. Licenses deve armazenar somente hash da chave, status, início, expiração, limite e vínculo ao cliente/produto/plano. Mostrar a chave integral apenas no momento da emissão; não armazená-la em texto puro. Payments não deve guardar números de cartão ou códigos de segurança.

## Segurança e backend

- Usar autenticação oficial da plataforma.
- Validar a identidade no servidor em cada rota e função.
- Verificar email_verified e comparar email normalizado com `Nathanork9@gmail.com` para o papel admin.
- Bloquear toda operação administrativa no servidor para qualquer outro usuário.
- Bloquear acesso de cliente a registros de outro cliente com regras de dados/queries no backend.
- Nunca aceitar role=admin, customer_id ou permissões enviados pelo navegador como autoridade.
- Nunca expor segredos de API no código do navegador.
- Adicionar limites de requisição, validação de entrada e logs de auditoria.
- Se uma capacidade de segurança não estiver disponível na plataforma, não simular proteção; documentar a limitação e não publicar como sistema seguro.

## API para o Lobo-bot

Criar endpoint HTTPS `POST /v1/licenses/validate` que recebe `instanceId`, `licenseKey` e `nonce`. Guardar hash da chave e comparar de forma segura. Validar status, validade, vínculo da instalação e limite máximo de instâncias. Resposta de sucesso:
```json
{ "valid": true, "status": "active", "expiresAt": "ISO-8601 ou null", "cacheTtlSeconds": 300, "nonce": "nonce recebido" }
```
Para chave inválida, licença suspensa/revogada/expirada ou limite atingido, responder `valid:false` com status específico. A API deve registrar last_seen da instalação e impedir que uma mesma chave exceda max_instances. Proteger o endpoint com limitação por IP e por instância e não registrar chaves em logs.

## Visual

Design moderno, escuro, elegante, com identidade visual LOBO-BOT, acentos verde neon metálico, hierarquia clara, sidebar administrativa, tabelas pesquisáveis, filtros por status, confirmações para operações destrutivas e layouts responsivos. Não criar conteúdo ou módulos que não estejam listados neste escopo.
