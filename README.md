# Meus Canais

Feed com os vídeos mais recentes **só dos canais do YouTube que você escolher**.

## Rodar

```bash
npm install
npm run dev
```

Abra http://localhost:3000 e adicione canais pelo campo do topo. Aceita:

- link do canal: `https://www.youtube.com/@canal`
- `@handle`
- ID do canal: `UC...`
- link de qualquer vídeo do canal

A lista de canais, os vídeos marcados como vistos e os filtros ficam salvos no `localStorage` do navegador.

## Como os vídeos são buscados

`lib/youtube.js` tenta, em ordem, até uma funcionar:

1. **YouTube Data API v3**: só se existir `YOUTUBE_API_KEY`. Datas exatas, ~1 unidade de cota por canal (cota grátis: 10.000/dia).
2. **Feed RSS** (`/feeds/videos.xml`): sem chave, datas exatas. O YouTube às vezes deixa fora do ar (retorna 404).
3. **Página `/videos` do canal**: sem chave, já vem sem Shorts, traz duração e views; a data é aproximada ("há 3 dias").

O resultado de cada canal fica 10 min em cache no servidor; o botão **Atualizar** força uma busca nova.

### Usar a API oficial (opcional)

1. Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/), ative a **YouTube Data API v3** e gere uma chave de API.
2. Crie `.env.local` na raiz:

   ```
   YOUTUBE_API_KEY=sua_chave_aqui
   ```

3. Reinicie o `npm run dev`.

## Estrutura

```
app/page.js               interface (lista de canais, grade, player)
app/api/resolve/route.js  link/@handle -> { id, title, avatar }
app/api/feed/route.js     ids -> vídeos de todos os canais, ordenados por data
lib/youtube.js            acesso ao YouTube (API / RSS / página)
```
