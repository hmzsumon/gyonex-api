// simple email detector (good-enough for app use)
export function isEmailLike(input: string): boolean {
  if (!input) return false;
  const s = String(input).trim();
  // very permissive: name@domain.tld (tld ≥ 2)
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

export function normalizeEmail(input: string): string {
  return String(input).trim().toLowerCase();
}

export function normalizeCustomerId(input: string): string {
  // adjust to your style (upper-case U2025xx etc.)
  return String(input).trim().toUpperCase();
}
