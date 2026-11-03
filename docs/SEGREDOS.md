# Segredos: o que fazer (leia antes de publicar)

O repositório é **público**. Até 03/11/2026 os arquivos `.env` e `.env.local`
estavam versionados com valores reais:

| Variável | O que permite fazer | Onde estava |
| --- | --- | --- |
| `DATABASE_URL` | ler/escrever **todo** o banco (login, lançamentos) | `.env` |
| `BTY_LLM_SERVER_API_KEY` | consumir a IA na sua conta/cota | `.env` |
| `HAPPYSEEDS_KEY` | acessar a plataforma | `.env` |
| `SESSION_SECRET` | **forjar** cookie de sessão e entrar como qualquer usuário | `.env.local` |

Eles foram removidos do versionamento, mas **continuam no histórico do Git** —
remover o arquivo não apaga o passado. Portanto, trate os valores como
**comprometidos** e rotacione.

## 1. Rotacionar (quem pode, troca)

- **`SESSION_SECRET`** — você mesmo: gere outro e troque.
  ```bash
  openssl rand -hex 32
  ```
  Efeito: todos precisam entrar de novo (as sessões antigas param de valer).
- **`DATABASE_URL`** — senha do Postgres. Se o banco é da plataforma HappySeeds,
  peça a troca no painel/suporte; depois ajuste a URL.
- **`BTY_LLM_SERVER_API_KEY` / `HAPPYSEEDS_KEY`** — chaves da plataforma: peça
  rotação no suporte do HappySeeds.

## 2. Cadastrar no host (Vercel) — antes de publicar

Projeto → **Settings → Environment Variables** → adicione em
*Production*, *Preview* e *Development*:

```
DATABASE_URL
SESSION_SECRET
BTY_LLM_SERVER_API_KEY
REACTUS_BASE_URL          (https://reactus-api.happyseeds.ai)
HAPPYSEEDS_PROJECT_ID
HAPPYSEEDS_KEY
```

Não precisa criar `USER_LLM_BASE_URL` / `USER_LLM_API_KEY`: deixá-las ausentes é
o que ativa o fallback automático do FinBot.

> A partir de agora o app **não lê mais** `.env` do repositório (ele nem existe
> lá). Quem manda é o painel do host. Se as variáveis não estiverem cadastradas,
> o deploy sobe, mas o login e os lançamentos quebram por falta de `DATABASE_URL`.

## 3. Rodar no seu PC

```bash
cp .env.example .env
# edite .env com os valores reais (os mesmos do painel do host)
pnpm install
pnpm dev            # http://localhost:13000
```

`.env` e `.env.local` estão no `.gitignore`: `git status` não deve listá-los.
Se aparecerem, rode `git rm --cached .env .env.local`.

## 4. Verificar que não sobrou nada

```bash
git ls-files | grep -E '^\.env'          # deve listar só .env.example
git log --all --oneline -- .env          # mostra o histórico antigo (esperado)
```

Limpadores opcionais de histórico (só se quiser apagar o passado de verdade —
exige force-push e reescreve os commits):

```bash
# git-filter-repo é o recomendado (instale antes)
git filter-repo --invert-paths --path .env --path .env.local
git remote add origin https://github.com/SEU-USUARIO/controle-financeiro.git
git push --force --all && git push --force --tags
```

Só faça isso **depois** de rotacionar as chaves: antes disso, o histórico é o
menor dos problemas.
