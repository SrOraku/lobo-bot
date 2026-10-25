# 🌹 Lobo Bot Control Center 🐺

Esta integração transforma o Control Center no **control plane central** das instalações do Lobo Bot.

O banco PostgreSQL/Supabase da central deve ser a fonte de verdade para:

- servidores/grupos registrados;
- instalações;
- autorização administrativa;
- licenças;
- bloqueios e suspensões;
- versão do bot;
- heartbeat / último acesso;
- métricas agregadas de comandos;
- auditoria administrativa.

O SQLite local do bot continua responsável por dados operacionais que não precisam ser centralizados imediatamente, como economia/RPG, configurações locais e cache. Essa separação permite migrar dados gradualmente sem quebrar o bot.

## Configuração

Defina no `.env` da instalação:

```env
CONTROL_CENTER_URL=https://SEU-BACKEND
CONTROL_CENTER_ENROLLMENT_TOKEN=TOKEN-DE-ENROLLMENT
CONTROL_CENTER_FAIL_MODE=closed
CONTROL_CENTER_HEARTBEAT_MS=60000
CONTROL_CENTER_VALIDATE_TTL_MS=60000
CONTROL_CENTER_GRACE_MS=300000
CONTROL_CENTER_TIMEOUT_MS=8000
```

Se `CONTROL_CENTER_URL` ou `CONTROL_CENTER_ENROLLMENT_TOKEN` estiver vazio, a integração permanece desativada e o comportamento anterior do bot é preservado.

Nunca publique o token real no GitHub.

## Registro automático

Quando o WhatsApp conecta, o plugin `plugins/control-center.js` tenta descobrir os grupos em que a instalação participa e registra cada grupo automaticamente.

O registro envia somente metadados necessários ao gerenciamento:

- plataforma `whatsapp`;
- JID externo do grupo;
- nome do grupo;
- proprietário quando fornecido legitimamente pela plataforma;
- quantidade aproximada de participantes;
- identificador local da instância;
- versão do bot;
- runtime/ambiente;
- timestamp.

Nenhum conteúdo de mensagem é enviado.

## Contrato esperado da API

### `POST /api/installations/register`

Autenticação:

```http
Authorization: Bearer <CONTROL_CENTER_ENROLLMENT_TOKEN>
```

Exemplo de payload:

```json
{
  "platform": "whatsapp",
  "server": {
    "externalId": "120363000000000000@g.us",
    "name": "Grupo",
    "ownerExternalId": null,
    "memberCount": 42
  },
  "instance": {
    "clientInstanceId": "uuid",
    "botVersion": "1.0.0",
    "runtime": "node-v22.x",
    "environment": "production"
  },
  "timestamp": "2026-10-25T00:00:00.000Z"
}
```

Resposta recomendada:

```json
{
  "ok": true,
  "data": {
    "installation": {
      "id": "uuid"
    },
    "credential": {
      "token": "segredo-mostrado-uma-unica-vez"
    },
    "authorization": {
      "allowed": true,
      "status": "authorized",
      "reason": null,
      "permissions": []
    },
    "license": {
      "status": "active"
    }
  }
}
```

A central deve persistir **somente o hash seguro** da credencial da instalação. O segredo retornado é armazenado localmente pelo bot em `data/control-center.json`, que já fica fora do Git.

### `POST /api/installations/validate`

Usa a credencial exclusiva da instalação:

```http
Authorization: Bearer <installation-token>
```

Payload:

```json
{
  "installationId": "uuid",
  "serverId": "120363000000000000@g.us",
  "botVersion": "1.0.0",
  "timestamp": "2026-10-25T00:00:00.000Z"
}
```

A resposta deve retornar `authorization.allowed`, `authorization.status`, motivo seguro e licença atual.

### `POST /api/installations/heartbeat`

Também usa a credencial exclusiva da instalação e atualiza `last_seen` / `last_heartbeat` no backend.

O heartbeat deve retornar o estado de autorização mais recente. Assim, bloqueio, suspensão, licença expirada e versão bloqueada chegam ao bot sem reinicialização.

### `POST /api/installations/events`

Recebe métricas agregadas e sem conteúdo privado, por exemplo:

```json
{
  "installationId": "uuid",
  "serverId": "120363000000000000@g.us",
  "type": "command",
  "name": "menu",
  "result": "attempt",
  "timestamp": "2026-10-25T00:00:00.000Z"
}
```

Não enviar argumentos nem texto das mensagens.

## Kill switch

O kill switch é exclusivamente lógico.

Quando a API retorna `allowed: false`, o bot deixa de processar funcionalidades protegidas naquele grupo. Ele **não** desliga o computador, servidor, processo ou dispositivo de terceiros.

O estado é revalidado periodicamente e também atualizado por heartbeat.

## Segurança

- credencial de enrollment somente em variável de ambiente;
- credencial individual por instalação;
- credencial individual armazenada localmente fora do Git;
- backend armazena hash, não o token completo;
- nenhum segredo administrativo no frontend;
- tokens completos nunca devem entrar em logs;
- usar HTTPS em produção;
- aplicar rate limiting e validação server-side;
- considerar timestamp/nonce em operações sensíveis;
- rotacionar/revogar credenciais pela central.

## Política de falha

`CONTROL_CENTER_FAIL_MODE=closed` mantém o modelo mais rígido: após a janela `CONTROL_CENTER_GRACE_MS`, uma instalação sem conseguir validar é tratada como não autorizada.

`CONTROL_CENTER_FAIL_MODE=open` mantém o bot disponível quando a central estiver fora do ar, mas reduz a força do controle remoto.

## Fluxo final

```text
WhatsApp conecta
      ↓
Control Center registra grupo automaticamente
      ↓
Central emite credencial da instalação
      ↓
Bot valida licença/autorização
      ↓
Heartbeat periódico
      ↓
Dashboard atualiza online/offline e versão
      ↓
Administrador bloqueia/suspende/revoga
      ↓
Próxima validação/heartbeat recebe allowed=false
      ↓
Lobo Bot para funcionalidades protegidas naquele grupo
      ↓
Ação fica registrada na auditoria da central
```
