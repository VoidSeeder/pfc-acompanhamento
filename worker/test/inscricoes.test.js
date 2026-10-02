import { describe, expect, it } from 'vitest';
import {
  LIMITE_INSCRICOES,
  apagarInscricao,
  chaveDaInscricao,
  guardarInscricao,
  listarInscricoes,
  validarInscricao,
} from '../src/inscricoes.js';
import { criarKv } from './apoio.js';

const valida = (endpoint = 'https://fcm.googleapis.com/fcm/send/abc') => ({
  endpoint,
  keys: { p256dh: 'BPubKey_-123', auth: 'segredo_-45' },
});

describe('validarInscricao', () => {
  it('aceita inscrição do Chrome e guarda só os campos usados', () => {
    const resultado = validarInscricao({ ...valida(), expirationTime: null, extra: 'x' });
    expect(resultado).toEqual({ ok: true, inscricao: valida() });
  });

  it.each([
    'https://jmt17.google.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/abc',
  ])('aceita o serviço de push %s', (endpoint) => {
    expect(validarInscricao(valida(endpoint)).ok).toBe(true);
  });

  it.each([
    ['http em vez de https', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['serviço desconhecido', 'https://exemplo.com/push'],
    ['host que só começa igual', 'https://fcm.googleapis.com.exemplo.com/abc'],
    ['host que só termina parecido', 'https://falsofcm.googleapis.com/abc'],
    ['texto que não é URL', 'fcm.googleapis.com'],
  ])('recusa endpoint: %s', (_, endpoint) => {
    expect(validarInscricao(valida(endpoint)).ok).toBe(false);
  });

  it.each([
    ['nulo', null],
    ['texto', 'inscricao'],
    ['lista', [valida()]],
    ['número', 7],
    ['endpoint numérico', { ...valida(), endpoint: 7 }],
    ['sem chaves', { endpoint: valida().endpoint }],
    ['chaves nulas', { endpoint: valida().endpoint, keys: null }],
    ['sem auth', { endpoint: valida().endpoint, keys: { p256dh: 'abc' } }],
    ['p256dh vazia', { endpoint: valida().endpoint, keys: { p256dh: '', auth: 'abc' } }],
    ['chave com caractere estranho', { endpoint: valida().endpoint, keys: { p256dh: 'a b', auth: 'abc' } }],
    ['chave enorme', { endpoint: valida().endpoint, keys: { p256dh: 'a'.repeat(201), auth: 'abc' } }],
  ])('recusa corpo: %s', (_, corpo) => {
    const resultado = validarInscricao(corpo);
    expect(resultado.ok).toBe(false);
    expect(typeof resultado.motivo).toBe('string');
  });
});

describe('armazenamento', () => {
  it('a chave é inscricao: mais o sha256 do endpoint', async () => {
    // sha256('abc')
    expect(await chaveDaInscricao('abc')).toBe('inscricao:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('guarda, lista e apaga', async () => {
    const kv = criarKv();
    expect(await guardarInscricao(kv, valida())).toBe(true);
    expect(await listarInscricoes(kv)).toEqual([valida()]);

    await apagarInscricao(kv, valida().endpoint);
    expect(await listarInscricoes(kv)).toEqual([]);
  });

  it('listar ignora as outras chaves do KV', async () => {
    const kv = criarKv({ estado: '{}' });
    await guardarInscricao(kv, valida());
    expect(await listarInscricoes(kv)).toEqual([valida()]);
  });

  it('recusa quando o teto foi atingido, mas aceita regravar uma existente', async () => {
    const kv = criarKv();
    for (let i = 0; i < LIMITE_INSCRICOES; i++) {
      expect(await guardarInscricao(kv, valida('https://fcm.googleapis.com/fcm/send/' + i))).toBe(true);
    }
    expect(await guardarInscricao(kv, valida('https://fcm.googleapis.com/fcm/send/excedente'))).toBe(false);
    expect(await guardarInscricao(kv, valida('https://fcm.googleapis.com/fcm/send/0'))).toBe(true);
    expect(await listarInscricoes(kv)).toHaveLength(LIMITE_INSCRICOES);
  });
});
