import * as path from 'path';
import { computeCepRangesFromCnefe } from './generate-cep-ranges';

describe('computeCepRangesFromCnefe', () => {
  it('computes the min/max CEP per bairro from a CNEFE-shaped CSV', async () => {
    const fixturePath = path.join(__dirname, '__fixtures__', 'cnefe-sample.csv');

    const result = await computeCepRangesFromCnefe(fixturePath);

    expect(result['Ipanema']).toEqual([{ start: 22410000, end: 22471000 }]);
    expect(result['Barra da Tijuca']).toEqual([{ start: 22600000, end: 22793000 }]);
    expect(result['Ipanema'][0].start).not.toBe(0);
  });
});
