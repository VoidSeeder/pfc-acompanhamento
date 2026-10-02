// A mesma lista existe em ../../index.html (FONTES). Ao mudar uma, mude a outra.
export const FONTES = [
  { chave: 'texto', repo: 'VoidSeeder/PFC-Monography', rotulo: 'Texto da monografia' },
  { chave: 'codigo', repo: 'VoidSeeder/cfd_on_gpu', rotulo: 'Códigos' },
  {
    chave: 'documentacao',
    anotacoes: 'https://gist.githubusercontent.com/VoidSeeder/5a882a39e3d93b55f8cd31370f88aee6/raw/anotacoes.json',
    rotulo: 'Documentação',
  },
];

const POR_FONTE = 30;

export function itensDeCommits(commits) {
  if (!Array.isArray(commits)) throw new Error('a resposta de commits não é uma lista');
  return commits.map((c) => ({
    id: c.sha,
    mensagem: c.commit.message.split('\n')[0].trim(),
    data: new Date(c.commit.committer.date).getTime(),
  }));
}

// Registro com data inválida não aparece na página; aqui também não gera aviso.
export function itensDeAnotacoes(anotacoes) {
  if (!Array.isArray(anotacoes)) throw new Error('as anotações não são uma lista');
  return anotacoes
    .filter((a) => typeof a.texto === 'string')
    .map((a) => ({ id: a.data + ' ' + a.texto, mensagem: a.texto, data: new Date(a.data).getTime() }))
    .filter((item) => !Number.isNaN(item.data));
}

// Nunca lança: devolve { situacao: 'ok', itens, etag }, { situacao: 'igual' } (304)
// ou { situacao: 'falha', motivo }.
export async function buscarFonte(fonte, etag, token, buscar = fetch) {
  const url = fonte.repo
    ? `https://api.github.com/repos/${fonte.repo}/commits?per_page=${POR_FONTE}`
    : fonte.anotacoes;
  const headers = { 'User-Agent': 'pfc-acompanhamento-avisos' };
  if (fonte.repo) {
    headers.Accept = 'application/vnd.github+json';
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (etag) headers['If-None-Match'] = etag;

  try {
    let resposta = await buscar(url, { headers });
    if (resposta.status === 401 && headers.Authorization) {
      // Token vencido ou revogado: tenta sem ele, para os avisos não pararem em silêncio.
      console.error('token do GitHub recusado (HTTP 401); consultando sem token');
      const { Authorization, ...semToken } = headers;
      resposta = await buscar(url, { headers: semToken });
    }
    if (resposta.status === 304) return { situacao: 'igual' };
    if (!resposta.ok) return { situacao: 'falha', motivo: `HTTP ${resposta.status}` };
    const dados = await resposta.json();
    return {
      situacao: 'ok',
      itens: fonte.repo ? itensDeCommits(dados) : itensDeAnotacoes(dados),
      etag: resposta.headers.get('ETag'),
    };
  } catch (erro) {
    return { situacao: 'falha', motivo: String(erro) };
  }
}
