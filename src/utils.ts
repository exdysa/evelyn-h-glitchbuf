export function b64encode(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

export function b64decode(s: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
}

export function stateSearch(seed: string, script: string): string {
  return '?' + new URLSearchParams({ seed, script: b64encode(script) }).toString();
}
