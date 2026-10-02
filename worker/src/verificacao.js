import { FONTES, buscarFonte } from './fontes.js';
import { apagarInscricao, listarInscricoes } from './inscricoes.js';
import { avaliarFonte, montarNotificacao } from './novidades.js';
import { enviarATodas } from './push.js';

// Uma rodada: consulta as fontes, descobre o que é novo e avisa as inscrições.
// buscar e enviar são trocáveis para os testes.
export async function verificar(env, { buscar = buscarFonte, enviar = enviarATodas } = {}) {
  const estado = (await env.AVISOS.get('estado', 'json')) ?? {};
  // Estado gravado antes da reserva não tem itens: sem o ETag, a resposta vem com a lista
  // inteira em vez de um 304.
  const resultados = await Promise.all(
    FONTES.map((fonte) => {
      const guardado = estado[fonte.chave];
      return buscar(fonte, guardado?.itens ? guardado.etag ?? null : null, env.GITHUB_TOKEN);
    }),
  );
  const agora = Date.now();

  const novos = [];
  const falhas = [];
  let mudou = false;
  FONTES.forEach((fonte, i) => {
    if (resultados[i].situacao === 'falha') {
      falhas.push(fonte.chave);
      console.error(`fonte ${fonte.chave} falhou: ${resultados[i].motivo}`);
    }
    const avaliacao = avaliarFonte(estado[fonte.chave], resultados[i], agora);
    if (avaliacao.mudou) {
      estado[fonte.chave] = avaliacao.estado;
      mudou = true;
    }
    for (const item of avaliacao.novos) novos.push({ ...item, rotulo: fonte.rotulo });
  });

  // Grava antes de enviar: se a execução for interrompida no meio do envio, o aviso se perde
  // em vez de se repetir a cada cinco minutos.
  if (mudou) await env.AVISOS.put('estado', JSON.stringify(estado));

  const resumo = { novos: novos.length, enviadas: 0, extintas: 0, falhas };
  if (novos.length === 0) return resumo;

  const inscricoes = await listarInscricoes(env.AVISOS);
  if (inscricoes.length === 0) return resumo;

  const { enviadas, extintas } = await enviar(inscricoes, montarNotificacao(novos), {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  });
  await Promise.all(extintas.map((endpoint) => apagarInscricao(env.AVISOS, endpoint)));

  return { ...resumo, enviadas, extintas: extintas.length };
}
