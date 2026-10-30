// Plain-language names for what the server's guardrails masked (see backend/guardrails/detectors.py).
const LABELS: Record<string, [string, string]> = {
  EMAIL: ['email address', 'email addresses'],
  PHONE: ['phone number', 'phone numbers'],
  CARD: ['card number', 'card numbers'],
  SSN: ['ID number', 'ID numbers'],
  IBAN: ['bank account number', 'bank account numbers'],
  API_KEY: ['API key', 'API keys'],
  JWT: ['token', 'tokens'],
  BEARER_TOKEN: ['token', 'tokens'],
  CREDENTIAL: ['password or token', 'passwords or tokens'],
  PRIVATE_KEY: ['private key', 'private keys'],
};

/** {EMAIL: 1, PHONE: 2} -> "1 email address and 2 phone numbers" */
export function describeRedactions(redacted: Record<string, number>): string {
  const parts = Object.entries(redacted).map(([kind, n]) => {
    const [one, many] = LABELS[kind] ?? ['sensitive item', 'sensitive items'];
    return `${n} ${n === 1 ? one : many}`;
  });
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
