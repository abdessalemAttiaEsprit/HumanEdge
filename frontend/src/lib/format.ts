/** Tunisian dinar amounts are quoted to 3 decimals (millimes) across the app. */
export function formatTnd(value: number): string {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`;
}

export function formatInt(value: number): string {
  return value.toLocaleString('en-US');
}

/** JJ/MM/AAAA — format de date français, utilisé pour l'affichage de l'abonnement. */
export function formatDateFr(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}
