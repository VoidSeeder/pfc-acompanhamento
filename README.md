# Acompanhamento do TCC

Página única que lista, em linguagem simples, as últimas atualizações do
[texto da monografia](https://github.com/VoidSeeder/PFC-Monography) e dos
[códigos](https://github.com/VoidSeeder/cfd_on_gpu), além dos registros de
decisões e estudos do trabalho, guardados em um Gist.

Disponível em <https://voidseeder.github.io/pfc-acompanhamento/>.

A página consulta a API pública do GitHub ao abrir e a cada cinco minutos; não há
etapa de build. Sem login, o GitHub aceita 60 consultas por hora por endereço IP, e
cada atualização da página gasta duas. Quando uma fonte falha (limite esgotado ou
GitHub fora do ar), a página usa a cópia guardada pelo Worker de avisos (veja
abaixo) e diz no aviso de que horas é essa cópia. Para testar localmente:

```bash
python3 -m http.server
```

## App no celular

No Chrome do Android a página pode ser instalada como app pelo botão "Instalar no
celular". O `sw.js` guarda a página para ela abrir sem internet, e a última lista
carregada fica salva no aparelho (`localStorage`).

Ao mudar o `manifest.webmanifest` ou os ícones, troque o nome do cache em `sw.js`
(`CACHE`) para os aparelhos buscarem os arquivos de novo.

Os PNG de `icones/` são gerados a partir dos SVG e ficam versionados:

```bash
npx --yes @resvg/resvg-js-cli --no-system-font --fit-width 192 icones/icone.svg icones/icone-192.png
npx --yes @resvg/resvg-js-cli --no-system-font --fit-width 512 icones/icone.svg icones/icone-512.png
npx --yes @resvg/resvg-js-cli --no-system-font --fit-width 512 icones/icone-maskable.svg icones/icone-maskable-512.png
```

## Avisos de novidades

Quem instala o app pode tocar em "Avisar-me das novidades" para receber uma
notificação quando sair atualização. Os avisos são enviados por um Cloudflare
Worker (pasta `worker/`), que consulta as mesmas fontes a cada cinco minutos e
manda um Web Push para os aparelhos inscritos. A cada verificação ele também
guarda a última lista de cada fonte, servida em `GET /lista`; é a reserva que a
página usa quando o GitHub não responde. Com o Worker fora do ar, os avisos param
e a página volta a depender só do GitHub.

Worker em produção: <https://tcc-avisos.tcc-avisos.workers.dev>

A lista de fontes existe em dois lugares, `index.html` e `worker/src/fontes.js`;
ao mudar uma, mude a outra.

```bash
cd worker
npm install
npm test          # testes (Vitest)
npm run dev       # Worker local em http://localhost:8787
npm run deploy    # publica na Cloudflare
```

Para disparar a verificação no Worker local:

```bash
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```

Configuração:

- `worker/wrangler.toml`: `VAPID_PUBLIC_KEY` (a mesma de `AVISOS_CHAVE_PUBLICA`
  no `index.html`), `VAPID_SUBJECT` e `ORIGEM_PERMITIDA`.
- Segredos na Cloudflare (`npx wrangler secret put NOME`): `VAPID_PRIVATE_KEY` e
  `GITHUB_TOKEN` (token de acesso fino, somente leitura de repositórios
  públicos).
- `worker/.dev.vars` (fora do Git): os mesmos segredos para uso local. Guarde uma
  cópia da `VAPID_PRIVATE_KEY`: se ela se perder, todos precisam ativar os avisos
  de novo.

Limites conhecidos, todos do plano gratuito da Cloudflare: até 200 inscrições
guardadas e cerca de 47 envios por verificação (50 subrequisições por execução,
três delas gastas nas consultas). A verificação grava o estado no KV a cada cinco
minutos (288 das 1.000 gravações diárias); o resto fica para as inscrições. Se o token do GitHub vencer, o Worker passa a
consultar sem token e registra o erro no log (`npx wrangler tail`).
