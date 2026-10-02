export const LIMITE_VISTOS = 500;
export const LIMITE_CORPO = 300;

// anterior: { vistos: string[], etag: string | null } ou undefined (fonte nunca vista).
// resultado: o que buscarFonte devolveu.
export function avaliarFonte(anterior, resultado) {
  if (resultado.situacao !== 'ok') return { estado: anterior, novos: [], mudou: false };

  const ids = [...new Set(resultado.itens.map((item) => item.id))];
  if (!anterior) return { estado: { vistos: ids, etag: resultado.etag }, novos: [], mudou: true };

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

  return {
    estado: { vistos, etag: resultado.etag },
    novos,
    mudou: novos.length > 0 || resultado.etag !== anterior.etag,
  };
}

function cortar(texto) {
  const letras = [...texto];
  if (letras.length <= LIMITE_CORPO) return texto;
  return letras.slice(0, LIMITE_CORPO - 1).join('').trimEnd() + '…';
}

// novos: lista não vazia de { mensagem, data, rotulo }.
export function montarNotificacao(novos) {
  const maisRecente = novos.reduce((a, b) => (b.data > a.data ? b : a));
  return {
    titulo: novos.length === 1 ? maisRecente.rotulo : `${novos.length} novidades no TCC`,
    corpo: cortar(maisRecente.mensagem),
  };
}
