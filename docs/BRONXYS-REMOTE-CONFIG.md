# Configuração remota segura da API Bronxys

O runtime agora tenta carregar a chave Bronxys no início, antes de registrar os comandos. A consulta remota é opcional e não altera a compatibilidade com instalações antigas.

## Variáveis privadas do bot

Configure na hospedagem (nunca no GitHub):

- `BRONXYS_CONFIG_URL`: URL HTTPS de uma função protegida.
- `BRONXYS_CONFIG_TOKEN`: token Bearer exclusivo desta instalação.

O endpoint deve responder em até 8 segundos com JSON `{"apiKey":"CHAVE" }`. Redirecionamentos são recusados. A resposta é mantida somente em memória. A chave local em `BRONXYS_API_KEY` ou `data/bronxys-api-key` continua como fallback quando a consulta remota falhar.

## Contrato do endpoint

- Método: GET
- Header: `Authorization: Bearer <BRONXYS_CONFIG_TOKEN>`
- Transporte: HTTPS obrigatório
- Resposta 200: `{"apiKey":"<chave Bronxys>" }`
- Qualquer outra resposta é tratada como indisponibilidade; segredos e corpo da resposta não são registrados em log.

O endpoint deve comparar o token em segredo, limitar chamadas, permitir apenas a instalação autorizada e obter a chave Bronxys de armazenamento secreto do servidor. Não retorne a chave para o painel web nem grave-a em tabela pública.

## Integração Base44 / Supabase

O painel administrativo deve atualizar o segredo no backend protegido, não escrever a chave em uma tabela acessível ao navegador. Uma Supabase Edge Function pode expor esse contrato usando os secrets `BRONXYS_API_KEY` e `BRONXYS_CONFIG_TOKEN`. Configure os dois como secrets do projeto; não os coloque em variáveis `VITE_*`, no código do painel, nem no repositório.

## Ativação

Depois de publicar a função e configurar as duas variáveis privadas na hospedagem do bot, reinicie o processo uma vez. O bot carregará a chave automaticamente. `!apibronxys status` informa a origem sem revelar a chave; `!apibronxys chave SUA_CHAVE` continua disponível como alternativa local.

## Limite desta alteração

O código do cliente foi preparado no repositório, mas a função remota, os secrets do Supabase e a tela Base44 ainda precisam ser implantados/configurados no workspace do usuário. Nenhuma chave real foi copiada, criada ou publicada nesta alteração.
