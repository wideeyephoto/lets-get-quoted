/**
 * Deterministic color palette for customer monogram avatars
 */
const PALETTES = [
  { bg: 'rgba(59, 130, 246, 0.15)', color: '#1d4ed8' }, // Blue
  { bg: 'rgba(16, 185, 129, 0.15)', color: '#047857' }, // Emerald
  { bg: 'rgba(139, 92, 246, 0.15)', color: '#6d28d9' }, // Purple
  { bg: 'rgba(245, 158, 11, 0.15)', color: '#b45309' }, // Amber
  { bg: 'rgba(236, 72, 153, 0.15)', color: '#be185d' }, // Pink
  { bg: 'rgba(14, 165, 233, 0.15)', color: '#0369a1' }, // Sky
  { bg: 'rgba(20, 184, 166, 0.15)', color: '#0f766e' }, // Teal
];

export function getClientInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAvatarColor(name: string): { bg: string; color: string } {
  if (!name) return PALETTES[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTES.length;
  return PALETTES[index];
}
