import { afterEach, describe, expect, it, vi } from 'vitest';
import { chaveDaInscricao } from '../src/inscricoes.js';
import { verificar } from '../src/verificacao.js';
import { criarKv } from './apoio.js';

const inscricao = (nome) => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/' + nome, keys: { p256dh: 'abc', auth: 'abc' } });

async function kvCom({ estado, inscricoes = [] }) {
  const inicial = {};
  if (estado) inicial.estado = JSON.stringify(estado);
  for (const i of inscricoes) inicial[await chaveDaInscricao(i.endpoint)] = JSON.stringify(i);
  return criarKv(inicial);
}

const env = (kv) => ({
  AVISOS: kv,
  GITHUB_TOKEN: 'segredo',
  VAPID_SUBJECT: 'https://voidseeder.github.io/pfc-acompanhamento/',
  VAPID_PUBLIC_KEY: 'publica',
  VAPID_PRIVATE_KEY: 'privada',
});

// buscar falso: respostas por chave da fonte; fonte sem resposta combinada devolve 304.
function fontes(respostas) {
  const pedidos = [];
  const buscar = async (fonte, etag, token) => {
    pedidos.push({ chave: fonte.chave, etag, token });
    return respostas[fonte.chave] ?? { situacao: 'igual' };
  };
  return { buscar, pedidos };
}

const ok = (ids, etag) => ({
  situacao: 'ok',
  etag,
  itens: ids.map((id, i) => ({ id, mensagem: 'mensagem ' + id, data: 1000 - i })),
});

const estadoInicial = () => ({
  texto: { vistos: ['t1'], etag: 'et' },
  codigo: { vistos: ['c1'], etag: 'ec' },
  documentacao: { vistos: ['d1'], etag: 'ed' },
});

afterEach(() => vi.restoreAllMocks());

describe('verificar', () => {
  it('na primeira execução registra o estado e não avisa ninguém', async () => {
    const kv = await kvCom({ inscricoes: [inscricao('a')] });
    const enviar = vi.fn();
    const { buscar, pedidos } = fontes({ texto: ok(['t1'], 'et'), codigo: ok(['c1'], 'ec'), documentacao: ok(['d1'], 'ed') });

    const resumo = await verificar(env(kv), { buscar, enviar });

    expect(resumo).toEqual({ novos: 0, enviadas: 0, extintas: 0, falhas: [] });
    expect(enviar).not.toHaveBeenCalled();
    expect(await kv.get('estado', 'json')).toEqual(estadoInicial());
    expect(pedidos).toEqual([
      { chave: 'texto', etag: null, token: 'segredo' },
      { chave: 'codigo', etag: null, token: 'segredo' },
      { chave: 'documentacao', etag: null, token: 'segredo' },
    ]);
  });

  it('consulta cada fonte com o ETag guardado', async () => {
    const kv = await kvCom({ estado: estadoInicial() });
    const { buscar, pedidos } = fontes({});

    await verificar(env(kv), { buscar, enviar: vi.fn() });

    expect(pedidos.map((p) => p.etag)).toEqual(['et', 'ec', 'ed']);
  });

  it('sem mudanças não grava nada no KV', async () => {
    const kv = await kvCom({ estado: estadoInicial(), inscricoes: [inscricao('a')] });
    const enviar = vi.fn();

    const resumo = await verificar(env(kv), { buscar: fontes({}).buscar, enviar });

    expect(resumo.novos).toBe(0);
    expect(kv.gravacoes).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('com uma novidade avisa todas as inscrições com o rótulo da fonte', async () => {
    const kv = await kvCom({ estado: estadoInicial(), inscricoes: [inscricao('a'), inscricao('b')] });
    const enviar = vi.fn(async () => ({ enviadas: 2, extintas: [] }));

    const resumo = await verificar(env(kv), { buscar: fontes({ codigo: ok(['c2', 'c1'], 'ec2') }).buscar, enviar });

    expect(resumo).toEqual({ novos: 1, enviadas: 2, extintas: 0, falhas: [] });
    expect(enviar).toHaveBeenCalledTimes(1);
    const [inscricoes, notificacao, vapid] = enviar.mock.calls[0];
    expect(inscricoes.map((i) => i.endpoint).sort()).toEqual([inscricao('a').endpoint, inscricao('b').endpoint]);
    expect(notificacao).toEqual({ titulo: 'Códigos', corpo: 'mensagem c2' });
    expect(vapid).toEqual({
      subject: 'https://voidseeder.github.io/pfc-acompanhamento/',
      publicKey: 'publica',
      privateKey: 'privada',
    });
    expect((await kv.get('estado', 'json')).codigo).toEqual({ vistos: ['c2', 'c1'], etag: 'ec2' });
  });

  it('novidades em várias fontes viram uma notificação só', async () => {
    const kv = await kvCom({ estado: estadoInicial(), inscricoes: [inscricao('a')] });
    const enviar = vi.fn(async () => ({ enviadas: 1, extintas: [] }));
    const { buscar } = fontes({ texto: ok(['t2', 't1'], 'et2'), documentacao: ok(['d3', 'd2', 'd1'], 'ed2') });

    const resumo = await verificar(env(kv), { buscar, enviar });

    expect(resumo.novos).toBe(3);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][1].titulo).toBe('3 novidades no TCC');
  });

  it('grava o estado antes de enviar, para não repetir o aviso se o envio for interrompido', async () => {
    const kv = await kvCom({ estado: estadoInicial(), inscricoes: [inscricao('a')] });
    let vistosNaHoraDoEnvio;
    const enviar = async () => {
      vistosNaHoraDoEnvio = (await kv.get('estado', 'json')).codigo.vistos;
      throw new Error('interrompido');
    };
    const { buscar } = fontes({ codigo: ok(['c2', 'c1'], 'ec2') });

    await expect(verificar(env(kv), { buscar, enviar })).rejects.toThrow('interrompido');
    expect(vistosNaHoraDoEnvio).toEqual(['c2', 'c1']);

    const depois = vi.fn();
    const resumo = await verificar(env(kv), { buscar, enviar: depois });
    expect(resumo.novos).toBe(0);
    expect(depois).not.toHaveBeenCalled();
  });

  it('apaga as inscrições que o serviço de push deu como extintas', async () => {
    const kv = await kvCom({ estado: estadoInicial(), inscricoes: [inscricao('viva'), inscricao('extinta')] });
    const enviar = async () => ({ enviadas: 1, extintas: [inscricao('extinta').endpoint] });

    const resumo = await verificar(env(kv), { buscar: fontes({ codigo: ok(['c2', 'c1'], 'ec2') }).buscar, enviar });

    expect(resumo.extintas).toBe(1);
    expect(kv.dados.has(await chaveDaInscricao(inscricao('extinta').endpoint))).toBe(false);
    expect(kv.dados.has(await chaveDaInscricao(inscricao('viva').endpoint))).toBe(true);
  });

  it('fonte que falhou mantém o estado e não atrapalha as outras', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const kv = await kvCom({ estado: estadoInicial(), inscricoes: [inscricao('a')] });
    const enviar = vi.fn(async () => ({ enviadas: 1, extintas: [] }));
    const { buscar } = fontes({ texto: { situacao: 'falha', motivo: 'HTTP 500' }, codigo: ok(['c2', 'c1'], 'ec2') });

    const resumo = await verificar(env(kv), { buscar, enviar });

    expect(resumo).toEqual({ novos: 1, enviadas: 1, extintas: 0, falhas: ['texto'] });
    expect((await kv.get('estado', 'json')).texto).toEqual({ vistos: ['t1'], etag: 'et' });
  });

  it('sem inscrições não tenta enviar', async () => {
    const kv = await kvCom({ estado: estadoInicial() });
    const enviar = vi.fn();

    const resumo = await verificar(env(kv), { buscar: fontes({ codigo: ok(['c2', 'c1'], 'ec2') }).buscar, enviar });

    expect(resumo).toEqual({ novos: 1, enviadas: 0, extintas: 0, falhas: [] });
    expect(enviar).not.toHaveBeenCalled();
  });
});
