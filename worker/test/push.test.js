import { afterEach, describe, expect, it, vi } from 'vitest';
import { TTL_SEGUNDOS, enviarATodas } from '../src/push.js';
import { criarInscricao, criarVapid } from './apoio.js';

const notificacao = { titulo: 'Códigos', corpo: 'Ajusta a malha' };

// buscar falso: responde com o status combinado por endpoint (201 se não houver).
function servicoDePush(statusPorEndpoint = {}) {
  const pedidos = [];
  const buscar = async (url, opcoes) => {
    pedidos.push({ url, ...opcoes });
    const status = statusPorEndpoint[url] ?? 201;
    if (status === 'rede') throw new Error('sem rede');
    return new Response(null, { status });
  };
  return { buscar, pedidos };
}

afterEach(() => vi.restoreAllMocks());

describe('enviarATodas', () => {
  it('manda um push cifrado, com VAPID e TTL de 24 horas', async () => {
    const inscricao = await criarInscricao();
    const { buscar, pedidos } = servicoDePush();

    const resultado = await enviarATodas([inscricao], notificacao, await criarVapid(), buscar);

    expect(resultado).toEqual({ enviadas: 1, extintas: [] });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].url).toBe(inscricao.endpoint);
    expect(pedidos[0].method).toBe('POST');
    expect(pedidos[0].headers.authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(pedidos[0].headers.ttl).toBe(String(TTL_SEGUNDOS));
    expect(TTL_SEGUNDOS).toBe(86400);
    expect(pedidos[0].headers['content-encoding']).toBe('aes128gcm');
    expect(pedidos[0].body).toBeInstanceOf(Uint8Array);
    // O texto não vai às claras.
    expect(Buffer.from(pedidos[0].body).includes('Ajusta a malha')).toBe(false);
  });

  it('assina uma vez por serviço de push e cifra uma vez por inscrição', async () => {
    const a = await criarInscricao('https://fcm.googleapis.com/fcm/send/a');
    const b = await criarInscricao('https://fcm.googleapis.com/fcm/send/b');
    const c = await criarInscricao('https://updates.push.services.mozilla.com/wpush/v2/c');
    const { buscar, pedidos } = servicoDePush();

    await enviarATodas([a, b, c], notificacao, await criarVapid(), buscar);

    const de = (inscricao) => pedidos.find((p) => p.url === inscricao.endpoint);
    expect(de(a).headers.authorization).toBe(de(b).headers.authorization);
    expect(de(c).headers.authorization).not.toBe(de(a).headers.authorization);
    expect(Buffer.from(de(a).body).equals(Buffer.from(de(b).body))).toBe(false);
  });

  it('404 e 410 marcam a inscrição como extinta', async () => {
    const viva = await criarInscricao('https://fcm.googleapis.com/fcm/send/viva');
    const sumiu = await criarInscricao('https://fcm.googleapis.com/fcm/send/sumiu');
    const expirou = await criarInscricao('https://fcm.googleapis.com/fcm/send/expirou');
    const { buscar } = servicoDePush({ [sumiu.endpoint]: 404, [expirou.endpoint]: 410 });

    const resultado = await enviarATodas([viva, sumiu, expirou], notificacao, await criarVapid(), buscar);

    expect(resultado.enviadas).toBe(1);
    expect(resultado.extintas.sort()).toEqual([expirou.endpoint, sumiu.endpoint].sort());
  });

  it('outras falhas vão para o log e não interrompem os demais envios', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recusada = await criarInscricao('https://fcm.googleapis.com/fcm/send/recusada');
    const semRede = await criarInscricao('https://fcm.googleapis.com/fcm/send/sem-rede');
    const chaveRuim = { endpoint: 'https://fcm.googleapis.com/fcm/send/chave-ruim', keys: { p256dh: 'abc', auth: 'abc' } };
    const boa = await criarInscricao('https://fcm.googleapis.com/fcm/send/boa');
    const { buscar, pedidos } = servicoDePush({ [recusada.endpoint]: 500, [semRede.endpoint]: 'rede' });

    const resultado = await enviarATodas([recusada, semRede, chaveRuim, boa], notificacao, await criarVapid(), buscar);

    expect(resultado).toEqual({ enviadas: 1, extintas: [] });
    expect(pedidos.some((p) => p.url === boa.endpoint)).toBe(true);
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('sem inscrições não faz nada', async () => {
    const { buscar, pedidos } = servicoDePush();
    expect(await enviarATodas([], notificacao, await criarVapid(), buscar)).toEqual({ enviadas: 0, extintas: [] });
    expect(pedidos).toEqual([]);
  });
});
