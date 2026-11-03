# LOBO-BOT LICENSE HUB

## Escopo e separação

O LICENSE HUB é um painel web separado do processo WhatsApp do Lobo-bot. Este repositório contém apenas o cliente de licença que o bot executa e a especificação do contrato da API. A interface administrativa deve ser publicada no projeto web (por exemplo, Base44) e a API deve ser hospedada em serviço HTTPS confiável.

## Proprietário e acesso

- Único administrador autorizado: `Nathanork9@gmail.com`.
- A autorização administrativa deve ser verificada no backend em cada operação administrativa.
- Não criar cadastro público de administradores, convite de administradores nem promoção de clientes a administradores.
- Não basta esconder menus ou botões: bloquear a operação também na API.
- Clientes autenticados só podem consultar os próprios dados e licenças.
- O e-mail informado deve ser verificado pelo provedor de autenticação; nunca confiar em e-mail enviado pelo navegador.
- Caso o provedor de login não entregue e-mail verificado, negar acesso administrativo.

## Painel esperado

1. Dashboard: quantidade de clientes, licenças ativas, suspensas e expiradas, instalações e pagamentos registrados.
2. Clientes: criar/editar/bloquear cliente, contato e histórico.
3. Licenças: emitir chave única, associar cliente, produto/plano, validade, limite de instalações, ativar, suspender, revogar e renovar.
4. Pagamentos: registrar pagamento, valor, moeda, método, referência, estado pendente/aprovado/recusado e histórico. A aprovação manual não deve ser confundida com confirmação automática de gateway.
5. Instalações: listar instâncias vinculadas, último contato, estado, identificação e revogar instância.
6. Auditoria: registrar autor, ação, entidade, horário e resultado para cada alteração administrativa.
7. API: endpoint de validação para o bot, autenticação, limites de requisição e respostas padronizadas.

## Modelo de dados sugerido

- users: id, auth_subject, email, email_verified, role (customer/admin), created_at, status.
- customers: id, user_id, name, contact, notes, created_at.
- products: id, code, name, description, active.
- plans: id, product_id, name, duration_days, max_instances, active.
- licenses: id, customer_id, product_id, plan_id, key_hash, status, starts_at, expires_at, max_instances, created_at, updated_at.
- installations: id, license_id, instance_id, label, status, first_seen_at, last_seen_at, revoked_at.
- payments: id, customer_id, license_id, amount_minor, currency, method, reference, status, recorded_at, approved_at.
- audit_logs: id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at.

Guardar hash da chave de licença, não a chave em texto puro. Mostrar a chave completa somente uma vez na emissão. Não guardar dados de cartão.

## API de validação

`POST /v1/licenses/validate`

Request JSON:
```json
{
  "instanceId": "identificador-gerado-na-instalação",
  "licenseKey": "CHAVE-ENTREGUE-AO-CLIENTE",
  "nonce": "uuid-gerado-para-esta-consulta"
}
```

Resposta válida (HTTP 200):
```json
{
  "valid": true,
  "status": "active",
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "cacheTtlSeconds": 300,
  "nonce": "mesmo-uuid-da-requisição"
}
```

Estados de licença aceitos pelo cliente: `active` e `trial`. Suspensa, revogada, expirada, desconhecida ou inválida devem retornar `valid:false` e status inequívoco. A API deve validar o hash da chave, validade, estado, limite e vínculo da instalação. O nonce deve ser devolvido sem alteração para vincular resposta à consulta.

A API também deve oferecer autenticação de usuário para o portal do cliente e autenticação de proprietário para rotas administrativas. As rotas de administração precisam validar a identidade do provedor de login no servidor e comparar o e-mail verificado com `Nathanork9@gmail.com`.

## Configuração do bot

Copie as variáveis abaixo para o ambiente privado da hospedagem. Não preencha valores reais neste arquivo nem comite chaves:

- `LICENSE_ENABLED=false` (ativar somente após API publicada e testada).
- `LICENSE_API_URL=https://seu-dominio-da-api`.
- `LICENSE_INSTANCE_ID=` identificador único e persistente da instalação.
- `LICENSE_KEY=` chave fornecida ao cliente.
- `LICENSE_CACHE_SECRET=` segredo aleatório com alta entropia, único por instalação.
- `LICENSE_CACHE_MAX_AGE_MS=21600000`.
- `LICENSE_TIMEOUT_MS=5000`.

Com `LICENSE_ENABLED=false`, o comportamento existente do bot permanece inalterado. O cliente de licença foi criado isolado, sem interceptar ainda o bootstrap. A ativação em produção deve ocorrer apenas depois que a API e a autenticação da instalação forem concluídas e testadas.

## Importante

Este contrato não significa que o painel Base44 já foi criado, que a API já está hospedada ou que pagamentos estão conectados a um gateway. Essas partes dependem de configuração e credenciais do serviço externo.
