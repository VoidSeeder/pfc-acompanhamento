import { afterEach, describe, expect, it, vi } from 'vitest';
import { FONTES, buscarFonte, itensDeAnotacoes, itensDeCommits } from '../src/fontes.js';

const commit = (sha, mensagem, data) => ({ sha, commit: { message: mensagem, committer: { date: data } } });
const repositorio = FONTES.find((f) => f.repo);
const gist = FONTES.find((f) => f.anotacoes);

// buscar falso: guarda cada pedido e devolve as respostas combinadas, na ordem.
function buscarFalso(...respostas) {
  const pedidos = [];
  const buscar = async (url, opcoes) => {
    pedidos.push({ url, headers: opcoes.headers });
    const resposta = respostas.shift();
    if (resposta instanceof Error) throw resposta;
    return resposta;
  };
  return { buscar, pedidos };
}

afterEach(() => vi.restoreAllMocks());

describe('itensDeCommits', () => {
  it('usa o sha como id e só a primeira linha da mensagem', () => {
    const itens = itensDeCommits([commit('abc', '  Ajusta a malha  \n\ndetalhes', '2026-10-01T12:00:00Z')]);
    expect(itens).toEqual([{ id: 'abc', mensagem: 'Ajusta a malha', data: Date.parse('2026-10-01T12:00:00Z') }]);
  });

  it('recusa resposta que não é lista', () => {
    expect(() => itensDeCommits({ message: 'Not Found' })).toThrow();
  });
});

describe('itensDeAnotacoes', () => {
  it('usa data e texto como id', () => {
    const itens = itensDeAnotacoes([{ data: '2026-10-01T12:00:00Z', texto: 'Decidi usar LBM' }]);
    expect(itens).toEqual([{
      id: '2026-10-01T12:00:00Z Decidi usar LBM',
      mensagem: 'Decidi usar LBM',
      data: Date.parse('2026-10-01T12:00:00Z'),
    }]);
  });

  it('ignora registro com data inválida, como a página faz', () => {
    expect(itensDeAnotacoes([{ data: 'ontem', texto: 'sem data' }])).toEqual([]);
  });

  it('ignora registro sem texto', () => {
    expect(itensDeAnotacoes([{ data: '2026-10-01T12:00:00Z' }])).toEqual([]);
  });

  it('recusa conteúdo que não é lista', () => {
    expect(() => itensDeAnotacoes({ anotacoes: [] })).toThrow();
  });
});

describe('buscarFonte', () => {
  it('consulta o repositório com token e If-None-Match', async () => {
    const { buscar, pedidos } = buscarFalso(Response.json([commit('abc', 'm', '2026-10-01T12:00:00Z')], { headers: { ETag: 'W/"novo"' } }));
    const resultado = await buscarFonte(repositorio, 'W/"velho"', 'segredo', buscar);

    expect(pedidos[0].url).toBe(`https://api.github.com/repos/${repositorio.repo}/commits?per_page=30`);
    expect(pedidos[0].headers.Authorization).toBe('Bearer segredo');
    expect(pedidos[0].headers['If-None-Match']).toBe('W/"velho"');
    expect(pedidos[0].headers['User-Agent']).toBeTruthy();
    expect(resultado.situacao).toBe('ok');
    expect(resultado.etag).toBe('W/"novo"');
    expect(resultado.itens.map((i) => i.id)).toEqual(['abc']);
  });

  it('não manda o token nem If-None-Match vazio para o Gist', async () => {
    const { buscar, pedidos } = buscarFalso(Response.json([]));
    await buscarFonte(gist, null, 'segredo', buscar);

    expect(pedidos[0].url).toBe(gist.anotacoes);
    expect(pedidos[0].headers.Authorization).toBeUndefined();
    expect(pedidos[0].headers['If-None-Match']).toBeUndefined();
  });

  it('funciona sem token', async () => {
    const { buscar, pedidos } = buscarFalso(Response.json([]));
    await buscarFonte(repositorio, null, undefined, buscar);
    expect(pedidos[0].headers.Authorization).toBeUndefined();
  });

  it('304 vira "igual"', async () => {
    const { buscar } = buscarFalso(new Response(null, { status: 304 }));
    expect(await buscarFonte(repositorio, 'e', 't', buscar)).toEqual({ situacao: 'igual' });
  });

  it('erro HTTP vira falha', async () => {
    const { buscar } = buscarFalso(new Response('limite', { status: 403 }));
    expect(await buscarFonte(repositorio, null, 't', buscar)).toEqual({ situacao: 'falha', motivo: 'HTTP 403' });
  });

  it('token recusado (401) tenta de novo sem token e registra no log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { buscar, pedidos } = buscarFalso(
      new Response('Bad credentials', { status: 401 }),
      Response.json([commit('abc', 'm', '2026-10-01T12:00:00Z')], { headers: { ETag: 'W/"novo"' } }),
    );

    const resultado = await buscarFonte(repositorio, 'W/"velho"', 'vencido', buscar);

    expect(pedidos).toHaveLength(2);
    expect(pedidos[0].headers.Authorization).toBe('Bearer vencido');
    expect(pedidos[1].headers.Authorization).toBeUndefined();
    expect(pedidos[1].headers['If-None-Match']).toBe('W/"velho"');
    expect(resultado.situacao).toBe('ok');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('401 sem token é falha, sem segunda tentativa', async () => {
    const { buscar, pedidos } = buscarFalso(new Response('', { status: 401 }));
    expect(await buscarFonte(repositorio, null, undefined, buscar)).toEqual({ situacao: 'falha', motivo: 'HTTP 401' });
    expect(pedidos).toHaveLength(1);
  });

  it('JSON quebrado vira falha', async () => {
    const { buscar } = buscarFalso(new Response('[{"data": '));
    expect((await buscarFonte(gist, null, null, buscar)).situacao).toBe('falha');
  });

  it('Gist que não é lista vira falha', async () => {
    const { buscar } = buscarFalso(Response.json({ anotacoes: [] }));
    expect((await buscarFonte(gist, null, null, buscar)).situacao).toBe('falha');
  });

  it('queda de rede vira falha', async () => {
    const { buscar } = buscarFalso(new Error('sem rede'));
    expect((await buscarFonte(repositorio, null, 't', buscar)).situacao).toBe('falha');
  });
});
