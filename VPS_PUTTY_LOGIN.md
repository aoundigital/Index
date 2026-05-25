# Acesso VPS Hostinger via PuTTY sem senha

Este documento registra o caminho correto para acessar a VPS `195.200.5.36` usando chave SSH no PuTTY. Use este fluxo para evitar bloqueios por tentativas falhadas de senha.

## Dados fixos

- Host: `195.200.5.36`
- Porta: `22`
- Usuario: `root`
- Tipo: `SSH`
- Host key esperada: `SHA256:AKHkGS4qIVWQb5Lt7Xs61coZlO66EbjURa/Uy8MCrMo`
- Chave PuTTY local: `E:\Documentos\CODEX\index\tmp\index_vps_ed25519.ppk`

## Login manual pelo PuTTY

1. Abra o PuTTY.
2. Em `Session`, preencha:
   - `Host Name`: `195.200.5.36`
   - `Port`: `22`
   - `Connection type`: `SSH`
3. Va em `Connection > SSH > Auth > Credentials`.
4. Em `Private key file for authentication`, selecione:

```text
E:\Documentos\CODEX\index\tmp\index_vps_ed25519.ppk
```

5. Volte em `Session`.
6. Em `Saved Sessions`, salve como:

```text
Hostinger VPS Key
```

7. Clique em `Open`.
8. Quando pedir `login as:`, digite:

```text
root
```

9. A mensagem esperada e:

```text
Authenticating with public key "codex-index-deploy"
root@srv547591:~#
```

## Login automatizado pelo Plink

Use este comando no PowerShell:

```powershell
& 'C:\Program Files\PuTTY\plink.exe' `
  -ssh `
  -noagent `
  -batch `
  -hostkey 'SHA256:AKHkGS4qIVWQb5Lt7Xs61coZlO66EbjURa/Uy8MCrMo' `
  -i 'E:\Documentos\CODEX\index\tmp\index_vps_ed25519.ppk' `
  root@195.200.5.36 `
  'whoami && hostname && uptime'
```

## Upload automatizado pelo PSCP

```powershell
& 'C:\Program Files\PuTTY\pscp.exe' `
  -batch `
  -hostkey 'SHA256:AKHkGS4qIVWQb5Lt7Xs61coZlO66EbjURa/Uy8MCrMo' `
  -i 'E:\Documentos\CODEX\index\tmp\index_vps_ed25519.ppk' `
  'arquivo-local.txt' `
  'root@195.200.5.36:/tmp/arquivo-local.txt'
```

## Se aparecer alerta de host key

Aceite somente se o fingerprint exibido for:

```text
SHA256:AKHkGS4qIVWQb5Lt7Xs61coZlO66EbjURa/Uy8MCrMo
```

No PuTTY, clique em `Accept`.

## Se bloquear por muitas tentativas

Entre pelo Terminal web da Hostinger e rode:

```bash
fail2ban-client status sshd
for ip in $(fail2ban-client status sshd | sed -n 's/.*Banned IP list:[[:space:]]*//p'); do
  fail2ban-client set sshd unbanip "$ip"
done
fail2ban-client status sshd
```

O resultado correto deve mostrar:

```text
Currently banned: 0
Banned IP list:
```

## Regra importante

Evite login por senha. Use sempre a chave `.ppk` no PuTTY/Plink. Isso evita erro de caractere especial, senha desatualizada e bloqueio pelo `fail2ban`.

## Aplicacao Index

- Dominio: `https://index.servidor.wiki.br`
- Pasta na VPS: `/docker/gsc-indexer`
- Compose: `/docker/gsc-indexer/docker-compose.yml`
- Credenciais do app na VPS: `/root/index-app-credentials.txt`

Comandos uteis:

```bash
cd /docker/gsc-indexer
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 mysql
docker compose up -d --build
```
