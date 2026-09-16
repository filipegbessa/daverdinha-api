import 'reflect-metadata';
import { pageBounds, paginated } from './pagination';

describe('pageBounds', () => {
  it('defaults to the first page', () => {
    expect(pageBounds({})).toEqual({ page: 1, perPage: 20, skip: 0, take: 20 });
  });

  it('skips the pages before the requested one', () => {
    expect(pageBounds({ page: 3, perPage: 10 })).toEqual({
      page: 3,
      perPage: 10,
      skip: 20,
      take: 10,
    });
  });
});

describe('paginated', () => {
  it('works out the page count from the total', () => {
    expect(paginated([], 45, 1, 20)).toEqual({
      items: [],
      page: 1,
      perPage: 20,
      total: 45,
      totalPages: 3,
    });
  });

  it('reports a single page when there is nothing at all, never zero pages', () => {
    expect(paginated([], 0, 1, 20).totalPages).toBe(1);
  });

  it('does not round a partial page away', () => {
    expect(paginated([], 21, 1, 20).totalPages).toBe(2);
  });
});
