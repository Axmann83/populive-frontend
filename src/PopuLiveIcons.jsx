import { Radar, Trophy, Globe, User, Heart, Star } from 'lucide-react';

/**
 * ============================================================
 * POPULIVE — ICONE CONDIVISE
 * ============================================================
 * Un solo posto da cui importare le icone in tutta l'app, invece
 * di ripetere lo stesso import lucide-react ovunque — se domani
 * cambiamo un'icona, la cambiamo qui una volta sola.
 *
 * "Koha" (ex "Rosa") non ha un equivalente esatto nella libreria
 * Lucide, quindi resta un'icona disegnata su misura — lo stesso
 * fiore già mostrato e approvato in anteprima, non una versione
 * diversa presa al volo da un'altra libreria.
 * ============================================================
 */

export { Radar, Trophy, Globe, User, Heart, Star };

export function KohaFlowerIcon({ size = 20, color = 'currentColor', strokeWidth = 2, fill = 'none', ...props }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={fill} stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      {...props}
    >
      <path d="M12 7.5a4.5 4.5 0 1 1 4.5 4.5H12V7.5Z" />
      <path d="M12 7.5A4.5 4.5 0 1 0 7.5 12H12V7.5Z" />
      <path d="M12 12a4.5 4.5 0 1 0 4.5 4.5V12Z" />
      <path d="M12 12a4.5 4.5 0 1 1-4.5 4.5V12Z" />
    </svg>
  );
}
