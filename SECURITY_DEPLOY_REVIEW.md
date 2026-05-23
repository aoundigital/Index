# Security Review - GSC Batch Indexer

Escopo: revisao antes do deploy em `index.servidor.wiki.br`.

## Corrigido antes do deploy

- APIs internas agora exigem sessao autenticada.
- Login cria cookie `HttpOnly` com `SameSite=Lax`.
- Tokens de sessao expiram em 12 horas.
- Login tem limitacao simples de tentativas por IP.
- Headers de seguranca basicos adicionados:
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
- `express.json` limitado a `250kb`.
- `x-powered-by` desabilitado.
- Docker nao inclui:
  - `.env`
  - `data_config.json`
  - `data_batches.json`
  - `node_modules`
  - `dist`
  - logs temporarios
- Compose nao publica MySQL externamente.

## Pontos a validar na VPS

- `/api/config` sem login deve retornar `401`.
- `/api/batches` sem login deve retornar `401`.
- Login deve funcionar somente com `SECURITY_USERNAME` e `SECURITY_PASSWORD` fortes da VPS.
- Cookie deve ser marcado como `Secure` quando acessado por HTTPS.
- Traefik deve emitir certificado valido para `index.servidor.wiki.br`.
- MySQL deve ficar restrito a rede interna do Compose.

## Riscos residuais aceitos

- Chave privada da conta de servico GSC fica armazenada no banco da aplicacao para permitir execucao automatica. O banco fica interno ao Docker e sem porta publica.
- Usuario administrativo unico. Para multiusuario real, implementar tabela de usuarios, hash de senha e auditoria por usuario.
- Sem backup automatizado do banco neste primeiro deploy. Recomendado adicionar rotina de dump do MySQL depois da publicacao.
