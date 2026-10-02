import { describe, expect, it } from 'vitest';
import { LIMITE_CORPO, LIMITE_VISTOS, avaliarFonte, montarNotificacao } from '../src/novidades.js';

const item = (id, data = 0) => ({ id, mensagem: 'mensagem ' + id, data });
const ok = (ids, etag = 'e2') => ({ situacao: 'ok', itens: ids.map((id) => item(id)), etag });

describe('avaliarFonte', () => {
  it('na primeira execução só registra, sem novidades', () => {
    expect(avaliarFonte(undefined, ok(['a', 'b'], 'e1'))).toEqual({
      estado: { vistos: ['a', 'b'], etag: 'e1' },
      novos: [],
      mudou: true,
    });
  });

  it('fonte que falhou mantém o estado anterior', () => {
    const anterior = { vistos: ['a'], etag: 'e1' };
    expect(avaliarFonte(anterior, { situacao: 'falha', motivo: 'HTTP 500' })).toEqual({
      estado: anterior,
      novos: [],
      mudou: false,
    });
  });

  it('fonte que falhou sem estado anterior continua sem estado', () => {
    expect(avaliarFonte(undefined, { situacao: 'falha', motivo: 'HTTP 500' })).toEqual({
      estado: undefined,
      novos: [],
      mudou: false,
    });
  });

  it('resposta 304 não muda nada', () => {
    const anterior = { vistos: ['a'], etag: 'e1' };
    expect(avaliarFonte(anterior, { situacao: 'igual' })).toEqual({ estado: anterior, novos: [], mudou: false });
  });

  it('id já visto não é novo; só o inédito é', () => {
    const resultado = avaliarFonte({ vistos: ['a', 'b'], etag: 'e1' }, ok(['c', 'a', 'b']));
    expect(resultado.novos.map((n) => n.id)).toEqual(['c']);
    expect(resultado.estado).toEqual({ vistos: ['c', 'a', 'b'], etag: 'e2' });
    expect(resultado.mudou).toBe(true);
  });

  it('o mesmo id duas vezes na mesma resposta conta uma vez', () => {
    const resultado = avaliarFonte({ vistos: ['a'], etag: 'e1' }, ok(['c', 'c', 'a']));
    expect(resultado.novos.map((n) => n.id)).toEqual(['c']);
    expect(resultado.estado.vistos).toEqual(['c', 'a']);
  });

  it('item que some e volta (resposta velha do CDN) não é novidade de novo', () => {
    const comNovo = avaliarFonte({ vistos: ['a'], etag: 'e1' }, ok(['b', 'a'], 'e2'));
    expect(comNovo.novos.map((n) => n.id)).toEqual(['b']);

    const respostaVelha = avaliarFonte(comNovo.estado, ok(['a'], 'e1'));
    expect(respostaVelha.novos).toEqual([]);
    expect(respostaVelha.estado.vistos).toContain('b');

    const deNovo = avaliarFonte(respostaVelha.estado, ok(['b', 'a'], 'e2'));
    expect(deNovo.novos).toEqual([]);
  });

  it('etag novo sem itens novos grava o estado sem avisar', () => {
    const resultado = avaliarFonte({ vistos: ['a'], etag: 'e1' }, ok(['a'], 'e2'));
    expect(resultado.novos).toEqual([]);
    expect(resultado.mudou).toBe(true);
  });

  it('resposta idêntica à anterior não pede gravação', () => {
    const resultado = avaliarFonte({ vistos: ['a'], etag: 'e1' }, ok(['a'], 'e1'));
    expect(resultado.mudou).toBe(false);
  });

  it('descarta os vistos mais antigos acima do limite', () => {
    const antigos = Array.from({ length: LIMITE_VISTOS }, (_, i) => 'antigo' + i);
    const resultado = avaliarFonte({ vistos: antigos, etag: 'e1' }, ok(['novo']));
    expect(resultado.estado.vistos).toHaveLength(LIMITE_VISTOS);
    expect(resultado.estado.vistos[0]).toBe('novo');
    expect(resultado.estado.vistos).not.toContain('antigo' + (LIMITE_VISTOS - 1));
  });

  it('nunca descarta um id da resposta atual, mesmo acima do limite', () => {
    const muitos = Array.from({ length: LIMITE_VISTOS + 50 }, (_, i) => 'id' + i);
    const primeira = avaliarFonte(undefined, ok(muitos, 'e1'));
    expect(primeira.estado.vistos).toHaveLength(LIMITE_VISTOS + 50);

    const segunda = avaliarFonte(primeira.estado, ok(muitos, 'e2'));
    expect(segunda.novos).toEqual([]);
    expect(segunda.estado.vistos).toHaveLength(LIMITE_VISTOS + 50);
  });
});

describe('montarNotificacao', () => {
  it('com uma novidade, o título é o rótulo da fonte e o corpo é a mensagem', () => {
    expect(montarNotificacao([{ mensagem: 'Revisa o capítulo 2', data: 10, rotulo: 'Texto da monografia' }])).toEqual({
      titulo: 'Texto da monografia',
      corpo: 'Revisa o capítulo 2',
    });
  });

  it('com várias, o título conta e o corpo é a mensagem mais recente', () => {
    const novos = [
      { mensagem: 'antiga', data: 10, rotulo: 'Códigos' },
      { mensagem: 'a mais recente', data: 30, rotulo: 'Documentação' },
      { mensagem: 'do meio', data: 20, rotulo: 'Códigos' },
    ];
    expect(montarNotificacao(novos)).toEqual({ titulo: '3 novidades no TCC', corpo: 'a mais recente' });
  });

  it('corta mensagem longa demais para caber no push', () => {
    const { corpo } = montarNotificacao([{ mensagem: 'x'.repeat(5000), data: 1, rotulo: 'Documentação' }]);
    expect([...corpo]).toHaveLength(LIMITE_CORPO);
    expect(corpo.endsWith('…')).toBe(true);
  });

  it('não parte um emoji ao meio ao cortar', () => {
    const { corpo } = montarNotificacao([{ mensagem: '🎓'.repeat(400), data: 1, rotulo: 'Códigos' }]);
    expect(corpo).toBe('🎓'.repeat(LIMITE_CORPO - 1) + '…');
  });

  it('mantém intacta a mensagem que cabe', () => {
    const mensagem = 'y'.repeat(LIMITE_CORPO);
    expect(montarNotificacao([{ mensagem, data: 1, rotulo: 'Códigos' }]).corpo).toBe(mensagem);
  });
});
