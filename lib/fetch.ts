const BUILD_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

function normalizeBasePath(value: string) {
  if (!value || value === '/') return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getBasePath(): string {
  const buildBasePath = normalizeBasePath(BUILD_BASE_PATH);
  if (buildBasePath) return buildBasePath;

  if (typeof window === 'undefined') return '';

  const nextData = (window as any).__NEXT_DATA__;
  const assetPrefix = normalizeBasePath(nextData?.assetPrefix || '');
  if (assetPrefix) return assetPrefix;

  const nextScript = document.querySelector<HTMLScriptElement>('script[src*="/_next/"]');
  const src = nextScript?.getAttribute('src') || '';
  const marker = '/_next/';
  const markerIndex = src.indexOf(marker);
  if (markerIndex > 0) {
    const fromScript = src.slice(0, markerIndex);
    if (fromScript.startsWith(window.location.origin)) {
      return normalizeBasePath(fromScript.slice(window.location.origin.length));
    }
    if (fromScript.startsWith('/')) return normalizeBasePath(fromScript);
  }

  return '';
}

export function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  if (/^https?:\/\//i.test(path)) return fetch(path, options);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${getBasePath()}${normalizedPath}`, options);
}
