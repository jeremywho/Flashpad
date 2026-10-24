export interface OnePasswordListItem {
  id: string;
  title?: string;
  category?: string;
  additional_information?: string;
  urls?: Array<{ href?: string; primary?: boolean }>;
}

export interface OnePasswordField {
  id?: string;
  label?: string;
  purpose?: string;
  value?: string;
}

export interface OnePasswordItem {
  id: string;
  fields?: OnePasswordField[];
}

export interface LoginChoice {
  id: string;
  title: string;
  username: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export type OnePasswordFillResult =
  | { status: 'filled'; credentials: LoginCredentials }
  | { status: 'choose'; choices: LoginChoice[] }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

export const ONE_PASSWORD_ITEM_ID = /^[a-z0-9]{26}$/i;

function hostOf(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchesHost(itemHost: string, appHost: string): boolean {
  return itemHost === appHost || itemHost.endsWith(`.${appHost}`);
}

export function appHostFromApiUrl(apiUrl: string): string {
  const host = hostOf(apiUrl) ?? 'flashpad.cc';
  return host.startsWith('api.') ? host.slice('api.'.length) : host;
}

export function selectAppLogins(items: OnePasswordListItem[], appHost: string): LoginChoice[] {
  const host = appHost.toLowerCase();
  return items
    .filter((item) => ONE_PASSWORD_ITEM_ID.test(item.id))
    .filter((item) => !item.category || item.category.toUpperCase() === 'LOGIN')
    .filter((item) =>
      (item.urls ?? []).some((url) => {
        const itemHost = url.href ? hostOf(url.href) : null;
        return itemHost !== null && matchesHost(itemHost, host);
      })
    )
    .map((item) => ({
      id: item.id,
      title: item.title ?? 'Login',
      username: item.additional_information ?? '',
    }));
}

function pickField(fields: OnePasswordField[], purpose: string, label: string): string | undefined {
  const byPurpose = fields.find((field) => field.purpose?.toUpperCase() === purpose && field.value);
  if (byPurpose) return byPurpose.value;
  return fields.find((field) => field.label?.toLowerCase() === label && field.value)?.value;
}

export function extractCredentials(item: OnePasswordItem): LoginCredentials | null {
  const fields = item.fields ?? [];
  const username = pickField(fields, 'USERNAME', 'username');
  const password = pickField(fields, 'PASSWORD', 'password');
  if (!username || !password) return null;
  return { username, password };
}
