import { Injectable } from '@nestjs/common';

export interface CepLookupResult {
  bairro: string;
}

/**
 * Esta chamada acontece **dentro do webhook**, no caminho de quase toda
 * verificação de entrega — só 8 dos 160 bairros têm faixa de CEP local, o
 * resto cai aqui. Sem prazo, uma BrasilAPI pendurada segurava a requisição
 * até o `maxDuration` de 30s da Vercel, a Meta não recebia o `200` dentro da
 * janela dela e reentregava a mensagem.
 *
 * 4s é folgado pra uma resposta normal e curto o bastante pra sobrar tempo de
 * responder ao cliente: estourar o prazo é tratado como CEP não resolvido, que
 * é um caminho que o bot já sabe percorrer (`deliveryRetryMessage`).
 */
const LOOKUP_TIMEOUT_MS = 4000;

@Injectable()
export class CepLookupService {
  private readonly baseUrl = 'https://brasilapi.com.br/api/cep/v2';

  async lookup(cep: string): Promise<CepLookupResult | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${cep}`, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      // Só o campo que usamos, tipado: a resposta da BrasilAPI traz bem mais,
      // e sem isso `json()` entra como `any` e espalha acesso não verificado.
      const data = (await response.json()) as { neighborhood?: string };
      if (!data?.neighborhood) return null;
      return { bairro: data.neighborhood };
    } catch {
      return null;
    }
  }
}
