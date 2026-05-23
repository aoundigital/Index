# Deploy VPS - GSC Batch Indexer

Dominio: `index.servidor.wiki.br`

IP esperado: `195.200.5.36`

Pasta recomendada na VPS:

```bash
/docker/gsc-indexer
```

## Arquitetura

- App Node/React em container Docker.
- MySQL 8.4 em container proprio.
- Persistencia em volume Docker `mysql_data`.
- Proxy HTTPS pelo Traefik existente na rede externa `n8n_default`.
- App exposto apenas pelo Traefik, sem publicar porta direta do container.

## Arquivos de deploy

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.env.example`

## Variaveis da VPS

Criar `/docker/gsc-indexer/.env` com:

```env
SECURITY_USERNAME=admin@empresa.com
SECURITY_PASSWORD=GERAR_SENHA_FORTE

MYSQL_DATABASE=gsc_indexer
MYSQL_USER=gsc_indexer
MYSQL_PASSWORD=GERAR_SENHA_FORTE
MYSQL_ROOT_PASSWORD=GERAR_SENHA_FORTE
MYSQL_CONNECTION_LIMIT=5
```

Permissao:

```bash
chmod 600 /docker/gsc-indexer/.env
```

## Comandos de deploy

```bash
mkdir -p /docker/gsc-indexer
cd /docker/gsc-indexer
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 mysql
```

## Validacao

DNS:

```bash
getent hosts index.servidor.wiki.br
```

Container:

```bash
docker compose ps
docker compose exec app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>console.log(r.status)).catch(e=>{console.error(e);process.exit(1)})"
```

HTTPS:

```bash
curl -I https://index.servidor.wiki.br
curl -s https://index.servidor.wiki.br/healthz
```

Banco:

```bash
docker compose exec mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SHOW DATABASES;"
docker compose exec mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" gsc_indexer -e "SHOW TABLES;"
```

## Checklist de seguranca

- Nao commitar `.env`, `data_config.json` ou `data_batches.json`.
- Usar senha forte em `SECURITY_PASSWORD`.
- Manter `index.servidor.wiki.br` somente em HTTPS.
- Verificar que `/api/config` responde `401` sem login.
- Verificar que `/api/batches` responde `401` sem login.
- Verificar headers:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
- Confirmar que o MySQL nao publica porta externa.
- Confirmar que apenas o container `app` entra na rede `n8n_default`.
- Confirmar que os containers existentes do N8N e AdmPBNs continuam saudaveis.

## Observacao sobre credenciais GSC

O app usa uma conta de servico central. Para funcionar com sites de varias contas do Search Console, adicione o e-mail da conta de servico como usuario com permissao Total/Full em cada propriedade GSC.
