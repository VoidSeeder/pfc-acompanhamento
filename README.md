# Acompanhamento do TCC

Página única que lista, em linguagem simples, as últimas atualizações do
[texto da monografia](https://github.com/VoidSeeder/PFC-Monography) e dos
[códigos](https://github.com/VoidSeeder/cfd_on_gpu), além dos registros de
decisões e estudos do trabalho, guardados em um Gist.

Disponível em <https://voidseeder.github.io/pfc-acompanhamento/>.

A página consulta a API pública do GitHub ao abrir e a cada cinco minutos; não há
servidor nem etapa de build. Para testar localmente:

```bash
python3 -m http.server
```

## App no celular

No Chrome do Android a página pode ser instalada como app pelo botão "Instalar no
celular". O `sw.js` guarda a página para ela abrir sem internet.

Ao mudar o `manifest.webmanifest` ou os ícones, troque o nome do cache em `sw.js`
(`CACHE`) para os aparelhos buscarem os arquivos de novo.

Os PNG de `icones/` são gerados a partir dos SVG e ficam versionados:

```bash
npx --yes @resvg/resvg-js-cli --no-system-font --fit-width 192 icones/icone.svg icones/icone-192.png
npx --yes @resvg/resvg-js-cli --no-system-font --fit-width 512 icones/icone.svg icones/icone-512.png
npx --yes @resvg/resvg-js-cli --no-system-font --fit-width 512 icones/icone-maskable.svg icones/icone-maskable-512.png
```
