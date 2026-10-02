// Service worker do Acompanhamento do TCC.
// Ao mudar o manifest ou os ícones, troque o nome do cache para os aparelhos buscarem de novo.
var CACHE = 'tcc-v1';
var PAGINA = './';
var ARQUIVOS = [
  PAGINA,
  'manifest.webmanifest',
  'icones/icone-192.png',
  'icones/icone-512.png',
  'icones/icone-maskable-512.png'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ARQUIVOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys()
      .then(function (nomes) {
        return Promise.all(nomes.map(function (nome) {
          return nome === CACHE ? null : caches.delete(nome);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evento) {
  var pedido = evento.request;
  if (pedido.method !== 'GET') return;
  // API do GitHub, Gist e Worker de avisos vão direto à rede, sem passar pelo cache.
  if (new URL(pedido.url).origin !== self.location.origin) return;

  if (pedido.mode === 'navigate') {
    // Rede primeiro, para mudanças na página aparecerem logo; o cache é a reserva sem internet.
    evento.respondWith(
      fetch(pedido)
        .then(function (resposta) {
          if (resposta.ok && pedido.url === self.registration.scope) {
            var copia = resposta.clone();
            evento.waitUntil(caches.open(CACHE).then(function (cache) { return cache.put(PAGINA, copia); }));
          }
          return resposta;
        })
        .catch(function () { return caches.match(PAGINA); })
    );
    return;
  }

  evento.respondWith(
    caches.match(pedido).then(function (guardado) { return guardado || fetch(pedido); })
  );
});
