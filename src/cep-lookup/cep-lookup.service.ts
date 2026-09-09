import { Injectable } from '@nestjs/common';

export interface CepLookupResult {
  bairro: string;
}

@Injectable()
export class CepLookupService {
  private readonly baseUrl = 'https://brasilapi.com.br/api/cep/v2';

  async lookup(cep: string): Promise<CepLookupResult | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${cep}`);
      if (!response.ok) return null;
      const data = await response.json();
      if (!data?.neighborhood) return null;
      return { bairro: data.neighborhood };
    } catch {
      return null;
    }
  }
}
