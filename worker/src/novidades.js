export const LIMITE_VISTOS = 500;
export const LIMITE_CORPO = 300;

// anterior: { vistos: string[], etag: string | null, itens, consultadoEm } ou undefined
// (fonte nunca vista). resultado: o que buscarFonte devolveu. agora: hora da consulta, em ms.
// itens e consultadoEm são a reserva que a página usa quando não consegue falar com o GitHub.
// mudou diz se o estado precisa ser gravado: sempre que a fonte respondeu, para a hora da
// conferência acompanhar.
export function avaliarFonte(anterior, resultado, agora) {
  if (resultado.situacao === 'falha') return { estado: anterior, novos: [], mudou: false };
  if (resultado.situacao === 'igual') {
    return { estado: { ...anterior, consultadoEm: agora }, novos: [], mudou: true };
  }

  const ids = [...new Set(resultado.itens.map((item) => item.id))];
  const reserva = { itens: resultado.itens, consultadoEm: agora };
  if (!anterior) return { estado: { vistos: ids, etag: resultado.etag, ...reserva }, novos: [], mudou: true };

  const conhecidos = new Set(anterior.vistos);
  const novos = [];
  for (const item of resultado.itens) {
    if (conhecidos.has(item.id)) continue;
    conhecidos.add(item.id);
    novos.push(item);
  }

  // Os vistos se acumulam em vez de serem trocados pela resposta atual: o Gist passa por um
  // CDN que às vezes devolve a versão anterior, e um item que some e volta não é novidade.
  // O corte nunca deixa de fora um id da resposta atual, senão ele viraria novidade a cada
  // verificação.
  const atuais = new Set(ids);
  const vistos = [...ids, ...anterior.vistos.filter((id) => !atuais.has(id))]
    .slice(0, Math.max(ids.length, LIMITE_VISTOS));

  return { estado: { vistos, etag: resultado.etag, ...reserva }, novos, mudou: true };
}

function cortar(texto) {
  const letras = [...texto];
  if (letras.length <= LIMITE_CORPO) return texto;
  return letras.slice(0, LIMITE_CORPO - 1).join('').trimEnd() + '…';
}

// novos: lista não vazia de { mensagem, data, rotulo }. O título (que o sistema mostra em
// negrito) diz do que se trata o aviso; o corpo traz a novidade mais recente e a sua fonte.
export function montarNotificacao(novos) {
  const maisRecente = novos.reduce((a, b) => (b.data > a.data ? b : a));
  const quantas = novos.length === 1 ? 'uma novidade' : `${novos.length} novidades`;
  return {
    titulo: `O TCC do João Pedro tem ${quantas}`,
    corpo: cortar(`${maisRecente.rotulo}: ${maisRecente.mensagem}`),
  };
}
