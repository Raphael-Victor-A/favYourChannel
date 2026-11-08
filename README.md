# Meus Canais

Feed com os vídeos mais recentes **só dos canais do YouTube que você escolher**, com login para salvar seus canais na conta e acessar de qualquer dispositivo.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000 e adicione canais pelo campo do topo. Aceita link do canal (`youtube.com/@canal`), `@handle`, ID (`UC...`) ou link de qualquer vídeo do canal.

As variáveis de ambiente ficam em `.env.local` (não vai para o GitHub). Sem nenhuma variável o app já funciona, salvando os canais só no navegador.

| Variável | Para quê |
| --- | --- |
| `YOUTUBE_API_KEY` | API oficial do YouTube: datas exatas, duração, views, sem Shorts |
| `NEXT_PUBLIC_SUPABASE_URL` | Login e canais salvos na conta |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Login e canais salvos na conta |
| `NEXT_PUBLIC_AUTH_GOOGLE=true` | Mostra o botão "Continuar com Google" |

## Login e canais na conta (Supabase)

1. Crie uma conta e um projeto grátis em [supabase.com](https://supabase.com).
2. No projeto, abra **SQL Editor → New query**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Isso cria a tabela `channels` com segurança por usuário (cada um só vê os próprios canais).
3. Em **Project Settings → API Keys** copie a *Publishable key*, e em **Project Settings → Data API** copie a *Project URL*. Coloque no `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
   ```

4. Em **Authentication → URL Configuration**:
   - **Site URL**: o endereço do site (ex.: `https://favyourchannel.vercel.app`, ou `http://localhost:3000` enquanto testa)
   - **Redirect URLs**: adicione `http://localhost:3000` e o endereço do site

   Esses endereços são usados nos links de confirmação de e-mail e de "esqueci a senha".
5. Reinicie o `npm run dev` (variáveis `NEXT_PUBLIC_` só são lidas na inicialização).

Ao entrar pela primeira vez, os canais que estavam salvos no navegador são enviados automaticamente para a conta.

### Login com Google (opcional)

1. No [Google Cloud Console](https://console.cloud.google.com/) → **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth** (tipo *Aplicativo da Web*).
   Em *URIs de redirecionamento autorizados* coloque `https://xxxxxxxx.supabase.co/auth/v1/callback`.
2. No Supabase → **Authentication → Sign In / Providers → Google**: ative e cole o *Client ID* e o *Client Secret*.
3. Adicione `NEXT_PUBLIC_AUTH_GOOGLE=true` nas variáveis.

## Como os vídeos são buscados

`lib/youtube.js` tenta, em ordem, até uma funcionar:

1. **YouTube Data API v3** (se houver `YOUTUBE_API_KEY`): usa a playlist só de vídeos longos do canal (sem Shorts), datas exatas, duração e views. ~2 unidades de cota por canal (cota grátis: 10.000/dia).
2. **Feed RSS** (`/feeds/videos.xml`): sem chave; o YouTube às vezes deixa fora do ar.
3. **Página `/videos` do canal**: sem chave, data aproximada. Costuma ser bloqueada em servidores na nuvem, por isso use a chave em produção.

O resultado de cada canal fica 10 min em cache no servidor; o botão **Atualizar** força uma busca nova.

## Publicar na Vercel

1. Envie o código para o GitHub.
2. Em [vercel.com](https://vercel.com) → **Add New → Project** → escolha o repositório.
3. Em **Environment Variables** cadastre as mesmas variáveis do `.env.local`.
4. **Deploy**. Depois, coloque o endereço gerado no Supabase (passo 4 acima).

> Proteja a chave do YouTube: no Google Cloud Console → Credenciais → sua chave → *Restrições de API* → limite à **YouTube Data API v3**.

## Estrutura

```
app/page.js               interface (lista de canais, grade, player, conta)
components/AuthModal.js   entrar / criar conta / esqueci a senha / Google
lib/useAuth.js            sessão do usuário
lib/useChannels.js        canais: navegador (sem login) ou Supabase (com login)
lib/supabase.js           cliente do Supabase
app/api/resolve/route.js  link/@handle -> { id, title, avatar }
app/api/feed/route.js     ids -> vídeos de todos os canais, ordenados por data
lib/youtube.js            acesso ao YouTube (API / RSS / página)
supabase/schema.sql       tabela e regras de segurança
```
