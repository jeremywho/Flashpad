import {
  appHostFromApiUrl,
  extractCredentials,
  selectAppLogins,
  OnePasswordListItem,
} from '../onePasswordItems';

const FLASHPAD_ID = 'abcdefghijklmnopqrstuvwxyz';
const SECOND_ID = 'zyxwvutsrqponmlkjihgfedcba';
const OTHER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('appHostFromApiUrl', () => {
  it('maps the API host to the site the login is saved under', () => {
    expect(appHostFromApiUrl('https://api.flashpad.cc')).toBe('flashpad.cc');
    expect(appHostFromApiUrl('http://localhost:5000')).toBe('localhost');
  });
});

describe('selectAppLogins', () => {
  const items: OnePasswordListItem[] = [
    {
      id: FLASHPAD_ID,
      title: 'Flashpad',
      category: 'LOGIN',
      additional_information: 'jeremy',
      urls: [{ href: 'https://flashpad.cc/login', primary: true }],
    },
    { id: OTHER_ID, title: 'GitHub', category: 'LOGIN', urls: [{ href: 'https://github.com' }] },
    { id: 'tooshort', title: 'Malformed', category: 'LOGIN', urls: [{ href: 'https://flashpad.cc' }] },
  ];

  it('returns only logins saved for the app host', () => {
    expect(selectAppLogins(items, 'flashpad.cc')).toEqual([
      { id: FLASHPAD_ID, title: 'Flashpad', username: 'jeremy' },
    ]);
  });

  it('matches subdomains and scheme-less URLs', () => {
    const variants: OnePasswordListItem[] = [
      { id: FLASHPAD_ID, title: 'Web', category: 'LOGIN', urls: [{ href: 'flashpad.cc' }] },
      { id: SECOND_ID, title: 'API', category: 'LOGIN', urls: [{ href: 'https://www.flashpad.cc' }] },
    ];
    expect(selectAppLogins(variants, 'flashpad.cc').map((choice) => choice.title)).toEqual(['Web', 'API']);
  });

  it('does not match a host that merely ends with the same letters', () => {
    const lookalikes: OnePasswordListItem[] = [
      { id: FLASHPAD_ID, title: 'Evil', category: 'LOGIN', urls: [{ href: 'https://notflashpad.cc' }] },
      { id: SECOND_ID, title: 'TLD only', category: 'LOGIN', urls: [{ href: 'cc' }] },
    ];
    expect(selectAppLogins(lookalikes, 'flashpad.cc')).toEqual([]);
  });

  it('skips items with no URLs and non-login categories', () => {
    const misc: OnePasswordListItem[] = [
      { id: FLASHPAD_ID, title: 'Flashpad note', category: 'SECURE_NOTE', urls: [{ href: 'https://flashpad.cc' }] },
      { id: SECOND_ID, title: 'Flashpad', category: 'LOGIN' },
    ];
    expect(selectAppLogins(misc, 'flashpad.cc')).toEqual([]);
  });
});

describe('extractCredentials', () => {
  it('reads username and password by field purpose, not position or label', () => {
    expect(
      extractCredentials({
        id: FLASHPAD_ID,
        fields: [
          { id: 'notesPlain', label: 'notesPlain', purpose: 'NOTES', value: 'hello' },
          { id: 'password', label: 'Secret', purpose: 'PASSWORD', value: 'hunter2' },
          { id: 'username', label: 'Login name', purpose: 'USERNAME', value: 'jeremy' },
        ],
      })
    ).toEqual({ username: 'jeremy', password: 'hunter2' });
  });

  it('falls back to labels for items without purposes', () => {
    expect(
      extractCredentials({
        id: FLASHPAD_ID,
        fields: [
          { label: 'username', value: 'jeremy' },
          { label: 'password', value: 'hunter2' },
        ],
      })
    ).toEqual({ username: 'jeremy', password: 'hunter2' });
  });

  it('returns null when the password is missing', () => {
    expect(
      extractCredentials({ id: FLASHPAD_ID, fields: [{ purpose: 'USERNAME', value: 'jeremy' }] })
    ).toBeNull();
  });
});
