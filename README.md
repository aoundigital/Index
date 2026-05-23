# GSC Batch Indexer

Aplicativo para verificar indexacao de URLs em lote usando a URL Inspection API do Google Search Console.

## Principais recursos

- Envio de listas com URLs de varios sites.
- Resolucao automatica da propriedade GSC por URL.
- Modo recomendado para muitos sites: `sc-domain` do dominio raiz.
- Mapeamentos manuais para excecoes por dominio/subdominio.
- Historico de lotes, CSV e tabela HTML copiavel.
- Persistencia local em JSON ou MySQL via `DATABASE_URL`/`MYSQL_URL`.

## Rodar localmente

1. Instale dependencias:
   `npm install`
2. Copie `.env.example` para `.env` e ajuste usuario/senha, se quiser.
3. Rode:
   `npm run dev`
4. Acesse:
   `http://localhost:3000`

Credenciais padrao:

- Usuario: `admin@empresa.com`
- Senha: `gsc-secure-2026`

## Multi-site no Search Console

Para verificar mais de 100 sites com a mesma conta de servico, adicione o e-mail da conta de servico como usuario com permissao Total/Full (ou proprietario delegado, se necessario) nas propriedades do Search Console de todos os sites.

No painel, em Configuracoes API, use:

- `Automatico: sc-domain do dominio raiz`, quando seus sites usam propriedades de dominio.
- `Automatico: sc-domain do host completo/subdominio`, quando cada subdominio tem propriedade propria.
- `Automatico: propriedade URL-prefix`, quando as propriedades foram cadastradas como `https://site.com/`.
- `Usar somente a propriedade fixa`, para o comportamento antigo.

Use mapeamentos manuais quando algum dominio fugir da regra:

```txt
esportes.dicas.inf.br=sc-domain:dicas.inf.br
siteprivado.provisorio.ws=https://siteprivado.provisorio.ws/
```

## MySQL na VPS

Defina uma variavel de ambiente:

```txt
DATABASE_URL=mysql://usuario:senha@localhost:3306/nome_do_banco
```

O app cria automaticamente a tabela `gsc_indexer_store` no primeiro start. Sem `DATABASE_URL` ou `MYSQL_URL`, ele continua usando `data_config.json` e `data_batches.json` localmente.
