import { Injectable } from '@nestjs/common';

export interface CepLookupResult {
  bairro: string;
  /** Cidade do CEP; quem compara bairro tem que conferir que é o Rio. */
  city?: string;
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

/**
 * O bairro de um CEP não muda, e a rota pública de checagem do site pode
 * pedir o mesmo CEP muitas vezes: guardar as respostas boas evita repetir a
 * chamada à BrasilAPI. Em memória, por instância (serverless reinicia e
 * esvazia, o que é ok). Falha não é guardada, pra tentar de novo na próxima.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;

@Injectable()
export class CepLookupService {
  private readonly baseUrl = 'https://brasilapi.com.br/api/cep/v2';
  private readonly cache = new Map<
    string,
    { result: CepLookupResult; expiresAt: number }
  >();

  async lookup(cep: string): Promise<CepLookupResult | null> {
    const cached = this.cache.get(cep);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    const result = await this.fetchLookup(cep);
    if (result) this.remember(cep, result);
    return result;
  }

  private remember(cep: string, result: CepLookupResult) {
    // Map guarda a ordem de inserção: o primeiro é o mais antigo.
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(cep, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private async fetchLookup(cep: string): Promise<CepLookupResult | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${cep}`, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      // Só o campo que usamos, tipado: a resposta da BrasilAPI traz bem mais,
      // e sem isso `json()` entra como `any` e espalha acesso não verificado.
      const data = (await response.json()) as {
        neighborhood?: string;
        city?: string;
      };
      if (!data?.neighborhood) return null;
      return {
        bairro: data.neighborhood,
        ...(data.city && { city: data.city }),
      };
    } catch {
      return null;
    }
  }
}
