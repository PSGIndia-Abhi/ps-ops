/**
 * Site Audits accent colours: the admin panel blue (#0284C7, `--primary` on the web).
 * The key names still say "green" (they were green at first); only the values changed,
 * so every audit screen follows this one file.
 */
export const ag = {
  green: '#0284C7', // main accent: buttons, selected chips, icons
  greenDark: '#075985', // text on light blue
  greenPressed: '#0369A1', // pressed button
  greenSoft: '#E0F2FE', // light fill (selected chip, icon tiles)
  greenSofter: '#F0F9FF', // very light fill (cards, tips)
  greenBorder: '#7DD3FC', // light border
  amberText: '#B45309',
  redText: '#B91C1C',
  red: '#DC2626',
} as const;
