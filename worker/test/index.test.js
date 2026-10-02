import { describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import { LIMITE_INSCRICOES, chaveDaInscricao } from '../src/inscricoes.js';
import { criarKv } from './apoio.js';

const ORIGEM = 'https://voidseeder.github.io';
const URL_INSCRICOES = 'https://tcc-avisos.exemplo.workers.dev/inscricoes';
const inscricao = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'abc', auth: 'abc' } };

const env = (kv = criarKv()) => ({ AVISOS: kv, ORIGEM_PERMITIDA: ORIGEM });

function pedido(metodo, corpo, url = URL_INSCRICOES) {
  const opcoes = { method: metodo, headers: { 'Content-Type': 'application/json' } };
  if (corpo !== undefined) opcoes.body = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  return new Request(url, opcoes);
}

describe('POST /inscricoes', () => {
  it('guarda a inscrição e responde 201 com CORS só para a página', async () => {
    const kv = criarKv();
    const resposta = await worker.fetch(pedido('POST', { ...inscricao, expirationTime: null }), env(kv));

    expect(resposta.status).toBe(201);
    expect(resposta.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    expect(await kv.get(await chaveDaInscricao(inscricao.endpoint), 'json')).toEqual(inscricao);
  });

  it('corpo que não é JSON responde 400', async () => {
    const resposta = await worker.fetch(pedido('POST', '{"endpoint": '), env());
    expect(resposta.status).toBe(400);
  });

  it('sem corpo responde 400', async () => {
    const resposta = await worker.fetch(pedido('POST'), env());
    expect(resposta.status).toBe(400);
  });

  it('JSON que não é objeto responde 400', async () => {
    expect((await worker.fetch(pedido('POST', 'null'), env())).status).toBe(400);
    expect((await worker.fetch(pedido('POST', '"texto"'), env())).status).toBe(400);
  });

  it('inscrição inválida responde 400 com o motivo e CORS', async () => {
    const resposta = await worker.fetch(pedido('POST', { ...inscricao, endpoint: 'https://exemplo.com/push' }), env());
    expect(resposta.status).toBe(400);
    expect(await resposta.text()).toBe('serviço de push desconhecido');
    expect(resposta.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
  });

  it('corpo acima de 4 KB responde 413 e não guarda nada', async () => {
    const kv = criarKv();
    const resposta = await worker.fetch(pedido('POST', { ...inscricao, enchimento: 'x'.repeat(5000) }), env(kv));
    expect(resposta.status).toBe(413);
    expect(kv.dados.size).toBe(0);
  });

  it('corpo grande sem Content-Length também responde 413', async () => {
    const pedaco = new TextEncoder().encode('x'.repeat(1024));
    let enviados = 0;
    const corpo = new ReadableStream({
      pull(controle) {
        if (enviados++ < 8) controle.enqueue(pedaco);
        else controle.close();
      },
    });
    const semTamanho = new Request(URL_INSCRICOES, { method: 'POST', body: corpo, duplex: 'half' });

    expect(semTamanho.headers.get('Content-Length')).toBeNull();
    expect((await worker.fetch(semTamanho, env())).status).toBe(413);
  });

  it('com o teto de inscrições atingido responde 507', async () => {
    const inicial = {};
    for (let i = 0; i < LIMITE_INSCRICOES; i++) inicial['inscricao:' + i] = '{}';
    const resposta = await worker.fetch(pedido('POST', inscricao), env(criarKv(inicial)));
    expect(resposta.status).toBe(507);
  });
});

describe('DELETE /inscricoes', () => {
  it('apaga a inscrição e responde 204', async () => {
    const kv = criarKv();
    await worker.fetch(pedido('POST', inscricao), env(kv));

    const resposta = await worker.fetch(pedido('DELETE', { endpoint: inscricao.endpoint }), env(kv));

    expect(resposta.status).toBe(204);
    expect(resposta.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    expect(kv.dados.size).toBe(0);
  });

  it('apagar o que não existe também responde 204', async () => {
    const resposta = await worker.fetch(pedido('DELETE', { endpoint: 'https://fcm.googleapis.com/fcm/send/nunca' }), env());
    expect(resposta.status).toBe(204);
  });

  it('sem endpoint responde 400', async () => {
    expect((await worker.fetch(pedido('DELETE', {}), env())).status).toBe(400);
    expect((await worker.fetch(pedido('DELETE', 'null'), env())).status).toBe(400);
  });
});

describe('demais pedidos', () => {
  it('OPTIONS /inscricoes libera POST e DELETE com JSON para a página', async () => {
    const resposta = await worker.fetch(new Request(URL_INSCRICOES, { method: 'OPTIONS' }), env());
    expect(resposta.status).toBe(204);
    expect(resposta.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEM);
    expect(resposta.headers.get('Access-Control-Allow-Methods')).toBe('POST, DELETE, OPTIONS');
    expect(resposta.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  });

  it.each([
    ['GET', 'https://tcc-avisos.exemplo.workers.dev/'],
    ['GET', URL_INSCRICOES],
    ['PUT', URL_INSCRICOES],
    ['POST', 'https://tcc-avisos.exemplo.workers.dev/inscricoes/123'],
    ['POST', 'https://tcc-avisos.exemplo.workers.dev/outra'],
  ])('%s %s responde 404', async (metodo, url) => {
    const resposta = await worker.fetch(new Request(url, { method: metodo }), env());
    expect(resposta.status).toBe(404);
  });
});
