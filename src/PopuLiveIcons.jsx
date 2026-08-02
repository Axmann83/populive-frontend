import {
  Radar, Trophy, Globe, User, Heart, Star,
  Link2, Coins, Crown, Sparkles, Eye, PartyPopper, Target,
  Map, Armchair, History, Wallet, Settings, Hand, BookmarkCheck,
} from 'lucide-react';

/**
 * ============================================================
 * POPULIVE — ICONE CONDIVISE
 * ============================================================
 * Un solo posto da cui importare le icone in tutta l'app, invece
 * di ripetere lo stesso import lucide-react ovunque — se domani
 * cambiamo un'icona, la cambiamo qui una volta sola.
 *
 * "Pulse" non ha un equivalente esatto nella libreria Lucide,
 * quindi resta un'icona disegnata su misura — le stesse tre onde
 * concentriche che salgono sopra un punto, identiche a quelle
 * dell'animazione di apertura sopra la "i" di Live (prima qui
 * c'era un fiore stilizzato, tolto per usare lo stesso linguaggio
 * visivo del logo invece di un simbolo scollegato).
 * ============================================================
 */

export {
  Radar, Trophy, Globe, User, Heart, Star,
  Link2, Coins, Crown, Sparkles, Eye, PartyPopper, Target,
  Map, Armchair, History, Wallet, Settings, Hand, BookmarkCheck,
};

export function PulseWaveIcon({ size = 20, color = 'currentColor', strokeWidth = 2, ...props }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round"
      {...props}
    >
      <circle cx="12" cy="18.5" r="1.6" fill={color} stroke="none" />
      <path d="M8.5 18.5a3.5 3.5 0 0 1 7 0" />
      <path d="M5.5 18.5a6.5 6.5 0 0 1 13 0" />
      <path d="M2.5 18.5a9.5 9.5 0 0 1 19 0" />
    </svg>
  );
}
