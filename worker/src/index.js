import { LIMITE_CORPO_BYTES, apagarInscricao, guardarInscricao, validarInscricao } from './inscricoes.js';
import { verificar } from './verificacao.js';

function responder(status, env, texto = null, extras = {}) {
  return new Response(texto, {
    status,
    headers: {
      'Access-Control-Allow-Origin': env.ORIGEM_PERMITIDA,
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
      ...extras,
    },
  });
}

// A última lista que a verificação agendada conseguiu de cada fonte. A página recorre a ela
// quando a consulta direta ao GitHub falha (por exemplo, pelo limite de consultas sem token).
async function lista(env) {
  const estado = (await env.AVISOS.get('estado', 'json')) ?? {};
  const fontes = {};
  for (const [chave, { itens, consultadoEm }] of Object.entries(estado)) {
    if (Array.isArray(itens)) fontes[chave] = { itens, consultadoEm };
  }
  return responder(200, env, JSON.stringify(fontes), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

// Lê o corpo como JSON sem aceitar mais do que LIMITE_CORPO_BYTES.
// Devolve { dados } ou { status } com o código de erro a responder.
async function lerJson(pedido) {
  if (Number(pedido.headers.get('Content-Length')) > LIMITE_CORPO_BYTES) return { status: 413 };
  if (!pedido.body) return { status: 400 };

  const leitor = pedido.body.getReader();
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITE_CORPO_BYTES) {
      await leitor.cancel();
      return { status: 413 };
    }
    partes.push(value);
  }

  try {
    return { dados: JSON.parse(await new Blob(partes).text()) };
  } catch {
    return { status: 400 };
  }
}

async function atender(pedido, env) {
  const { pathname } = new URL(pedido.url);
  const metodo = pedido.method;
  if (pathname === '/lista' && metodo === 'GET') return lista(env);
  if (pathname !== '/inscricoes' || !['POST', 'DELETE', 'OPTIONS'].includes(metodo)) {
    return new Response('Não encontrado', { status: 404 });
  }
  if (metodo === 'OPTIONS') return responder(204, env);

  const corpo = await lerJson(pedido);
  if (corpo.status) return responder(corpo.status, env);

  if (metodo === 'POST') {
    const validacao = validarInscricao(corpo.dados);
    if (!validacao.ok) return responder(400, env, validacao.motivo);
    const guardou = await guardarInscricao(env.AVISOS, validacao.inscricao);
    return guardou ? responder(201, env) : responder(507, env, 'limite de inscrições atingido');
  }

  if (typeof corpo.dados?.endpoint !== 'string') return responder(400, env, 'endpoint ausente');
  await apagarInscricao(env.AVISOS, corpo.dados.endpoint);
  return responder(204, env);
}

export default {
  fetch(pedido, env) {
    return atender(pedido, env);
  },

  async scheduled(evento, env) {
    console.log(JSON.stringify(await verificar(env)));
  },
};
