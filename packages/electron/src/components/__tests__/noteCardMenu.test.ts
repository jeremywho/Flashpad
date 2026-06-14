import { getCardMenuActions } from '@shared/index';

describe('getCardMenuActions', () => {
  it('inbox view: archive + move to trash', () => {
    expect(getCardMenuActions('inbox').map((a) => a.id)).toEqual(['archive', 'trash']);
  });

  it('a category view behaves like inbox', () => {
    expect(getCardMenuActions('cat_abc123').map((a) => a.id)).toEqual(['archive', 'trash']);
  });

  it('archive view: restore + move to trash', () => {
    expect(getCardMenuActions('archive').map((a) => a.id)).toEqual(['restore', 'trash']);
  });

  it('trash view: restore + delete permanently (danger + confirm)', () => {
    const items = getCardMenuActions('trash');
    expect(items.map((a) => a.id)).toEqual(['restore', 'delete']);
    const del = items.find((a) => a.id === 'delete')!;
    expect(del.danger).toBe(true);
    expect(typeof del.confirm).toBe('string');
  });
});
