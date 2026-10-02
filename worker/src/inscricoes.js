export const LIMITE_CORPO_BYTES = 4096;
export const LIMITE_INSCRICOES = 200;

const PREFIXO = 'inscricao:';
const CHAVE_BASE64URL = /^[A-Za-z0-9_-]{1,200}$/;

// Serviços de push do Chrome (Google), Firefox (Mozilla), Edge (Microsoft) e Safari (Apple).
const SERVICOS = [
  'fcm.googleapis.com',
  'jmt17.google.com',
  'updates.push.services.mozilla.com',
  '.notify.windows.com',
  '.push.apple.com',
];

function servicoConhecido(host) {
  return SERVICOS.some((s) => (s.startsWith('.') ? host.endsWith(s) : host === s));
}

// Devolve { ok: true, inscricao } só com os campos usados, ou { ok: false, motivo }.
export function validarInscricao(dados) {
  if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) {
    return { ok: false, motivo: 'o corpo deve ser um objeto' };
  }
  const { endpoint, keys } = dados;
  if (typeof endpoint !== 'string') return { ok: false, motivo: 'endpoint ausente' };

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, motivo: 'endpoint inválido' };
  }
  if (url.protocol !== 'https:') return { ok: false, motivo: 'endpoint deve ser https' };
  if (!servicoConhecido(url.hostname)) return { ok: false, motivo: 'serviço de push desconhecido' };

  if (keys === null || typeof keys !== 'object') return { ok: false, motivo: 'chaves ausentes' };
  const { p256dh, auth } = keys;
  if (typeof p256dh !== 'string' || !CHAVE_BASE64URL.test(p256dh)) return { ok: false, motivo: 'chave p256dh inválida' };
  if (typeof auth !== 'string' || !CHAVE_BASE64URL.test(auth)) return { ok: false, motivo: 'chave auth inválida' };

  return { ok: true, inscricao: { endpoint, keys: { p256dh, auth } } };
}

export async function chaveDaInscricao(endpoint) {
  const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  const hex = [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return PREFIXO + hex;
}

// O teto de 200 cabe numa página só do list (até 1.000 chaves), então não há paginação.
async function chaves(kv) {
  const { keys } = await kv.list({ prefix: PREFIXO });
  return keys.map((k) => k.name);
}

// Devolve false quando o teto de inscrições foi atingido. Regravar uma inscrição que já
// existe sempre é aceito.
export async function guardarInscricao(kv, inscricao) {
  const chave = await chaveDaInscricao(inscricao.endpoint);
  const existentes = await chaves(kv);
  if (!existentes.includes(chave) && existentes.length >= LIMITE_INSCRICOES) return false;
  await kv.put(chave, JSON.stringify(inscricao));
  return true;
}

export async function apagarInscricao(kv, endpoint) {
  await kv.delete(await chaveDaInscricao(endpoint));
}

export async function listarInscricoes(kv) {
  const valores = await Promise.all((await chaves(kv)).map((chave) => kv.get(chave, 'json')));
  return valores.filter((v) => v !== null);
}
