import { getCardMenuActions } from '@shared/index';

describe('getCardMenuActions', () => {
  it('inbox view: pin + archive + move to trash', () => {
    expect(getCardMenuActions('inbox').map((a) => a.id)).toEqual(['pin', 'archive', 'trash']);
  });

  it('a category view behaves like inbox', () => {
    expect(getCardMenuActions('cat_abc123').map((a) => a.id)).toEqual(['pin', 'archive', 'trash']);
  });

  it('archive view: pin + restore + move to trash', () => {
    expect(getCardMenuActions('archive').map((a) => a.id)).toEqual(['pin', 'restore', 'trash']);
  });

  it('a pinned note offers unpin instead of pin', () => {
    expect(getCardMenuActions('inbox', { pinned: true }).map((a) => a.id)).toEqual(['unpin', 'archive', 'trash']);
    expect(getCardMenuActions('archive', { pinned: true }).map((a) => a.id)).toEqual(['unpin', 'restore', 'trash']);
  });

  it('trash view: restore + delete permanently (danger + confirm), never pin', () => {
    const items = getCardMenuActions('trash', { pinned: true });
    expect(items.map((a) => a.id)).toEqual(['restore', 'delete']);
    const del = items.find((a) => a.id === 'delete')!;
    expect(del.danger).toBe(true);
    expect(typeof del.confirm).toBe('string');
  });
});
