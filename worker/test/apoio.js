// KV em memória com a mesma interface usada pelo Worker.
export function criarKv(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    gravacoes: 0,
    async get(chave, tipo) {
      const valor = dados.get(chave);
      if (valor === undefined) return null;
      return tipo === 'json' ? JSON.parse(valor) : valor;
    },
    async put(chave, valor) {
      this.gravacoes++;
      dados.set(chave, valor);
    },
    async delete(chave) {
      dados.delete(chave);
    },
    async list({ prefix = '' } = {}) {
      const keys = [...dados.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

// Inscrição com chaves de verdade, como a que o navegador gera.
export async function criarInscricao(endpoint = 'https://fcm.googleapis.com/fcm/send/abc') {
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    endpoint,
    keys: {
      p256dh: base64url(await crypto.subtle.exportKey('raw', par.publicKey)),
      auth: base64url(crypto.getRandomValues(new Uint8Array(16))),
    },
  };
}

export async function criarVapid() {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  return {
    subject: 'https://voidseeder.github.io/pfc-acompanhamento/',
    publicKey: base64url(await crypto.subtle.exportKey('raw', par.publicKey)),
    privateKey: (await crypto.subtle.exportKey('jwk', par.privateKey)).d,
  };
}
