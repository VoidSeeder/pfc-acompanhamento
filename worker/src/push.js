import { encryptNotification, vapidHeaders } from '@block65/webcrypto-web-push';

export const TTL_SEGUNDOS = 24 * 60 * 60;

// Envia a mesma notificação ({ titulo, corpo }) a todas as inscrições.
// vapid: { subject, publicKey, privateKey }.
// Devolve { enviadas, extintas }: extintas são os endpoints que o serviço de push deu como
// encerrados (404 ou 410) e que devem ser apagados. Falha em uma inscrição não interrompe as outras.
export async function enviarATodas(inscricoes, notificacao, vapid, buscar = fetch) {
  const texto = new TextEncoder().encode(JSON.stringify(notificacao));
  // A assinatura VAPID vale para o serviço de push inteiro; é feita uma vez por origem.
  const assinaturas = new Map();
  const extintas = [];
  let enviadas = 0;

  await Promise.all(inscricoes.map(async (inscricao) => {
    try {
      const destino = { ...inscricao, expirationTime: null };
      const origem = new URL(inscricao.endpoint).origin;
      if (!assinaturas.has(origem)) assinaturas.set(origem, vapidHeaders(destino, vapid));
      const { headers } = await assinaturas.get(origem);

      const resposta = await buscar(inscricao.endpoint, {
        method: 'POST',
        headers: {
          ...headers,
          ttl: String(TTL_SEGUNDOS),
          'content-encoding': 'aes128gcm',
          'content-type': 'application/octet-stream',
        },
        body: await encryptNotification(destino, texto),
      });

      if (resposta.status === 404 || resposta.status === 410) extintas.push(inscricao.endpoint);
      else if (resposta.ok) enviadas++;
      else console.error(`push recusado: HTTP ${resposta.status} em ${origem}`);
    } catch (erro) {
      console.error(`falha ao enviar push: ${erro}`);
    }
  }));

  return { enviadas, extintas };
}
