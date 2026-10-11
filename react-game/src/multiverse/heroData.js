// ============================================================================
// AVENGERS: DOOMSDAY — 16-Hero Multiverse Roster & Smart Chat Matcher
// Engineered for @Spiddyfacts: "WHO CAN DEFEAT DOCTOR DOOM?"
// ============================================================================

export const HEROES = [
  {
    id: 'spidey',
    name: 'Spider-Man',
    shortName: 'Spidey',
    callout: 'SPIDEY',
    team: 'Web Warriors',
    color: '#ef4444',
    secondaryColor: '#2563eb',
    gradient: 'linear-gradient(135deg, #dc2626, #2563eb)',
    glow: 'rgba(239, 68, 68, 0.75)',
    attackName: 'Web Blast',
    iconSvg: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 3.1a8 8 0 0 1 4.9 2.5l-3.4 1.5zm-2 0l-1.5 4-3.4-1.5A8 8 0 0 1 11 5.1zM5.1 11a8 8 0 0 1 1.4-3.7l3.6 1.6-1.5 4zm0 2l3.5-1.9 1.5 4-3.6 1.6A8 8 0 0 1 5.1 13zm7.9 5.9a8 8 0 0 1-4.9-2.5l3.4-1.5zm2 0l1.5-4 3.4 1.5a8 8 0 0 1-4.9 2.5zm3.9-5.9l-3.5 1.9-1.5-4 3.6-1.6a8 8 0 0 1 1.4 3.7zm0-2a8 8 0 0 1-1.4 3.7l-3.6-1.6 1.5-4z',
    aliases: [
      'spidey', 'spider-man', 'spiderman', 'spider man', 'spider', 'peter parker',
      'peter', 'miles', 'miles morales', 'webhead', 'webslinger', 'spideman'
    ]
  },
  {
    id: 'reed',
    name: 'Mr. Fantastic',
    shortName: 'Reed',
    callout: 'REED',
    team: 'Fantastic Four',
    color: '#0284c7',
    secondaryColor: '#38bdf8',
    gradient: 'linear-gradient(135deg, #0284c7, #0369a1)',
    glow: 'rgba(56, 189, 248, 0.75)',
    attackName: 'Cosmic Stretch',
    iconSvg: 'M12 2L4 6v12l8 4 8-4V6l-8-4zm0 3.5l5.5 2.8v8.4L12 19.5 6.5 16.7V8.3L12 5.5zm-2 4h4v6h-4v-6z',
    aliases: [
      'reed', 'mr fantastic', 'reed richards', 'mister fantastic', 'fantastic',
      'fantastic 4', 'f4', 'pedro pascal', 'pedro', 'mrfantastic', 'richards'
    ]
  },
  {
    id: 'deadpool',
    name: 'Deadpool',
    shortName: 'Deadpool',
    callout: 'DEADPOOL',
    team: 'X-Force',
    color: '#dc2626',
    secondaryColor: '#18181b',
    gradient: 'linear-gradient(135deg, #b91c1c, #450a0a)',
    glow: 'rgba(220, 38, 38, 0.75)',
    attackName: 'Dual Katanas',
    iconSvg: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 3.5c2.49 0 4.5 2.01 4.5 4.5 0 2.25-1.5 5.5-4.5 8.5-3-3-4.5-6.25-4.5-8.5 0-2.49 2.01-4.5 4.5-4.5zm0 2c-1.38 0-2.5 1.12-2.5 2.5 0 1.2.8 3.2 2.5 5.2 1.7-2 2.5-4 2.5-5.2 0-1.38-1.12-2.5-2.5-2.5z',
    aliases: [
      'deadpool', 'dead pool', 'dp', 'wade', 'wade wilson', 'merc with a mouth',
      'chimichanga', 'wadewilson', 'ryan reynolds'
    ]
  },
  {
    id: 'wolverine',
    name: 'Wolverine',
    shortName: 'Wolverine',
    callout: 'LOGAN',
    team: 'X-Men',
    color: '#eab308',
    secondaryColor: '#1d4ed8',
    gradient: 'linear-gradient(135deg, #ca8a04, #1e40af)',
    glow: 'rgba(234, 179, 8, 0.75)',
    attackName: 'Adamantium Slash',
    iconSvg: 'M4 3l4 18h2L7 3H4zm6 0l2 18h2l-2-18h-2zm6 0l-1 18h2l3-18h-4z',
    aliases: [
      'wolverine', 'logan', 'weapon x', 'wolvie', 'claws', 'adamantium',
      'james howlett', 'hugh jackman', 'wolv', 'wolvarine'
    ]
  },
  {
    id: 'wanda',
    name: 'Scarlet Witch',
    shortName: 'Wanda',
    callout: 'WANDA',
    team: 'Mystic Order',
    color: '#e11d48',
    secondaryColor: '#881337',
    gradient: 'linear-gradient(135deg, #e11d48, #4c0519)',
    glow: 'rgba(225, 29, 72, 0.8)',
    attackName: 'Chaos Magic',
    iconSvg: 'M12 2L4 9l8 13 8-13-8-7zm0 4.2l5.1 4.5-5.1 8.3-5.1-8.3L12 6.2z',
    aliases: [
      'wanda', 'scarlet witch', 'scarlet', 'maximoff', 'wanda maximoff',
      'chaos magic', 'witch', 'scarletwitch'
    ]
  },
  {
    id: 'doctorstrange',
    name: 'Doctor Strange',
    shortName: 'Strange',
    callout: 'STRANGE',
    team: 'Mystic Order',
    color: '#f97316',
    secondaryColor: '#10b981',
    gradient: 'linear-gradient(135deg, #ea580c, #047857)',
    glow: 'rgba(249, 115, 22, 0.75)',
    attackName: 'Mystic Portal',
    iconSvg: 'M12 2A10 10 0 1 0 22 12 10 10 0 0 0 12 2zm0 3a7 7 0 1 1-7 7 7 7 0 0 1 7-7zm0 2a5 5 0 1 0 5 5 5 5 0 0 0-5-5zm0 3a2 2 0 1 1-2 2 2 2 0 0 1 2-2z',
    aliases: [
      'strange', 'dr strange', 'doctor strange', 'dr. strange', 'stephen strange',
      'sorcerer supreme', 'eye of agamotto', 'stephen', 'cumberbatch'
    ]
  },
  {
    id: 'ironman',
    name: 'Iron Man',
    shortName: 'Iron Man',
    callout: 'IRON MAN',
    team: 'Avengers Prime',
    color: '#e11d48',
    secondaryColor: '#f59e0b',
    gradient: 'linear-gradient(135deg, #be123c, #d97706)',
    glow: 'rgba(245, 158, 11, 0.75)',
    attackName: 'Repulsor Blast',
    iconSvg: 'M12 2L4 6v8l8 8 8-8V6l-8-4zm-4 7h8v2H8V9zm1 4h6v2H9v-2zm2 4h2v2h-2v-2z',
    aliases: [
      'ironman', 'iron man', 'tony stark', 'tony', 'stark', 'arc reactor',
      'rdj', 'mark 85', 'iron'
    ]
  },
  {
    id: 'thor',
    name: 'Thor',
    shortName: 'Thor',
    callout: 'THOR',
    team: 'Avengers Prime',
    color: '#06b6d4',
    secondaryColor: '#f59e0b',
    gradient: 'linear-gradient(135deg, #0891b2, #4338ca)',
    glow: 'rgba(6, 182, 212, 0.75)',
    attackName: 'Lightning Storm',
    iconSvg: 'M11 2L4 14h6l-2 8 9-12h-6l2-8z',
    aliases: [
      'thor', 'odinson', 'god of thunder', 'mjolnir', 'stormbreaker',
      'asgard', 'thunder', 'hemsworth'
    ]
  },
  {
    id: 'loki',
    name: 'Loki',
    shortName: 'Loki',
    callout: 'LOKI',
    team: 'Multiverse Order',
    color: '#10b981',
    secondaryColor: '#eab308',
    gradient: 'linear-gradient(135deg, #059669, #a16207)',
    glow: 'rgba(16, 185, 129, 0.8)',
    attackName: 'Time Slip Illusion',
    iconSvg: 'M12 2L5 8v6l7 6 7-6V8l-7-6zm-4 8l4-3 4 3-4 5-4-5z',
    aliases: [
      'loki', 'god of stories', 'god of mischief', 'tva', 'laufeyson',
      'mischief', 'yggdrasil', 'lokii'
    ]
  },
  {
    id: 'hulk',
    name: 'Hulk',
    shortName: 'Hulk',
    callout: 'HULK',
    team: 'Avengers Prime',
    color: '#22c55e',
    secondaryColor: '#15803d',
    gradient: 'linear-gradient(135deg, #15803d, #14532d)',
    glow: 'rgba(34, 197, 94, 0.75)',
    attackName: 'Gamma Smash',
    iconSvg: 'M12 2a9 9 0 0 0-9 9c0 3.6 2.2 6.7 5.3 8L8 22h8l-.3-3c3.1-1.3 5.3-4.4 5.3-8a9 9 0 0 0-9-9zm-4 7h2v3H8V9zm6 0h2v3h-2V9zm-5 6h6v2H9v-2z',
    aliases: [
      'hulk', 'bruce banner', 'banner', 'smash', 'gamma', 'world breaker',
      'incredible hulk', 'hulkk'
    ]
  },
  {
    id: 'captainamerica',
    name: 'Captain America',
    shortName: 'Cap',
    callout: 'CAP',
    team: 'Avengers Prime',
    color: '#0284c7',
    secondaryColor: '#dc2626',
    gradient: 'linear-gradient(135deg, #0369a1, #b91c1c)',
    glow: 'rgba(2, 132, 199, 0.75)',
    attackName: 'Vibranium Shield',
    iconSvg: 'M12 2A10 10 0 1 0 22 12 10 10 0 0 0 12 2zm0 3a7 7 0 1 1-7 7 7 7 0 0 1 7-7zm0 2.5a4.5 4.5 0 1 0 4.5 4.5A4.5 4.5 0 0 0 12 7.5zm0 1.8l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z',
    aliases: [
      'cap', 'captain america', 'captain', 'steve rogers', 'sam wilson',
      'shield', 'first avenger', 'capt'
    ]
  },
  {
    id: 'blackpanther',
    name: 'Black Panther',
    shortName: 'Panther',
    callout: 'PANTHER',
    team: 'Wakanda Alliance',
    color: '#7c3aed',
    secondaryColor: '#0f172a',
    gradient: 'linear-gradient(135deg, #5b21b6, #1e1b4b)',
    glow: 'rgba(124, 58, 237, 0.75)',
    attackName: 'Kinetic Pulse',
    iconSvg: 'M12 2L4 7v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V7l-8-5zm-3 8a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 9 10zm6 0a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 15 10zm-5 4h4v2h-4v-2z',
    aliases: [
      'black panther', 'panther', 'wakanda', 'wakanda forever', 'shuri',
      'tchalla', 'vibranium panther', 'blackpanther'
    ]
  },
  {
    id: 'torch',
    name: 'Human Torch',
    shortName: 'Torch',
    callout: 'TORCH',
    team: 'Fantastic Four',
    color: '#ea580c',
    secondaryColor: '#ef4444',
    gradient: 'linear-gradient(135deg, #ea580c, #b91c1c)',
    glow: 'rgba(234, 88, 12, 0.8)',
    attackName: 'Supernova Blast',
    iconSvg: 'M12 2C8 7 6 9.5 6 13a6 6 0 0 0 12 0c0-3.5-2-6-6-11zm0 16a3.5 3.5 0 0 1-3.5-3.5c0-1.8 1.2-3.3 3.5-5.5 2.3 2.2 3.5 3.7 3.5 5.5A3.5 3.5 0 0 1 12 18z',
    aliases: [
      'torch', 'human torch', 'johnny storm', 'flame on', 'johnny',
      'fire', 'supernova', 'humantorch'
    ]
  },
  {
    id: 'ghostrider',
    name: 'Ghost Rider',
    shortName: 'Ghost Rider',
    callout: 'RIDER',
    team: 'Midnight Sons',
    color: '#f97316',
    secondaryColor: '#1c1917',
    gradient: 'linear-gradient(135deg, #ea580c, #292524)',
    glow: 'rgba(249, 115, 22, 0.8)',
    attackName: 'Hellfire Chain',
    iconSvg: 'M12 2a8 8 0 0 0-8 8c0 4 3 6.5 5 8.5L9 22h6l0-3.5c2-2 5-4.5 5-8.5a8 8 0 0 0-8-8zm-3 8a2 2 0 1 1 2-2 2 2 0 0 1-2 2zm6 0a2 2 0 1 1 2-2 2 2 0 0 1-2 2z',
    aliases: [
      'ghost rider', 'rider', 'ghostrider', 'johnny blaze', 'hellfire',
      'penance stare', 'blaze', 'spirit of vengeance'
    ]
  },
  {
    id: 'venom',
    name: 'Venom',
    shortName: 'Venom',
    callout: 'VENOM',
    team: 'Anti-Heroes',
    color: '#475569',
    secondaryColor: '#0f172a',
    gradient: 'linear-gradient(135deg, #0f172a, #334155)',
    glow: 'rgba(148, 163, 184, 0.7)',
    attackName: 'Symbiote Strike',
    iconSvg: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-5 6c1.66 0 3 1.34 3 3 0 1.25-.76 2.32-1.84 2.76L9 17h-2l.84-3.24C6.76 13.32 6 12.25 6 11c0-1.66 1.34-3 3-3zm10 0c1.66 0 3 1.34 3 3 0 1.25-.76 2.32-1.84 2.76L19 17h-2l.84-3.24c-1.08-.44-1.84-1.51-1.84-2.76 0-1.66 1.34-3 3-3z',
    aliases: [
      'venom', 'eddie brock', 'eddie', 'symbiote', 'we are venom',
      'lethal protector', 'venomous'
    ]
  },
  {
    id: 'thanos',
    name: 'Thanos',
    shortName: 'Thanos',
    callout: 'THANOS',
    team: 'Cosmic Titans',
    color: '#8b5cf6',
    secondaryColor: '#f59e0b',
    gradient: 'linear-gradient(135deg, #6d28d9, #b45309)',
    glow: 'rgba(139, 92, 246, 0.75)',
    attackName: 'Infinity Snap',
    iconSvg: 'M12 2a9 9 0 0 0-9 9c0 3.8 2.4 7 5.7 8.3L9 22h6l.3-2.7C18.6 18 21 14.8 21 11a9 9 0 0 0-9-9zm-3 8a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 9 10zm6 0a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 15 10z',
    aliases: [
      'thanos', 'mad titan', 'infinity gauntlet', 'snap', 'titan',
      'inevitable', 'thanoss'
    ]
  }
];

// Map of aliases to hero IDs for O(1) lightning lookup
const ALIAS_LOOKUP = new Map();
for (const hero of HEROES) {
  ALIAS_LOOKUP.set(hero.id.toLowerCase(), hero.id);
  ALIAS_LOOKUP.set(hero.name.toLowerCase(), hero.id);
  ALIAS_LOOKUP.set(hero.shortName.toLowerCase(), hero.id);
  ALIAS_LOOKUP.set(hero.callout.toLowerCase(), hero.id);
  for (const alias of hero.aliases) {
    ALIAS_LOOKUP.set(alias.toLowerCase(), hero.id);
  }
}

// Backwards compatibility mappings for older chat test votes
ALIAS_LOOKUP.set('batman', 'wolverine');
ALIAS_LOOKUP.set('superman', 'thor');
ALIAS_LOOKUP.set('joker', 'deadpool');
ALIAS_LOOKUP.set('flash', 'spidey');

/**
 * Intelligent comment parser: finds which superhero a comment is voting for
 * Handles clean matching, prefixes ("vote spidey", "kill doom wanda", "reed can beat doom"),
 * punctuation, and emojis.
 */
export function findHeroFromComment(commentText) {
  if (!commentText) return null;
  const raw = String(commentText).toLowerCase();

  // 1. Direct exact alias match
  const trimmed = raw.trim();
  if (ALIAS_LOOKUP.has(trimmed)) {
    const heroId = ALIAS_LOOKUP.get(trimmed);
    return HEROES.find(h => h.id === heroId) || null;
  }

  // 2. Scan comment words and multi-word phrases
  const clean = raw.replace(/[!?,.:;@#$%^&*()_=+~`'"/\\<>{}[\]|]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);

  // Check 3-word combinations first (e.g. "god of stories", "god of thunder", "doctor strange")
  for (let i = 0; i <= words.length - 3; i++) {
    const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    if (ALIAS_LOOKUP.has(phrase)) {
      const heroId = ALIAS_LOOKUP.get(phrase);
      return HEROES.find(h => h.id === heroId) || null;
    }
  }

  // Check 2-word combinations (e.g. "scarlet witch", "mr fantastic", "spider man", "ghost rider")
  for (let i = 0; i <= words.length - 2; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (ALIAS_LOOKUP.has(phrase)) {
      const heroId = ALIAS_LOOKUP.get(phrase);
      return HEROES.find(h => h.id === heroId) || null;
    }
  }

  // Check single words (e.g. "spidey", "reed", "wanda", "logan", "strange", "thor", "loki")
  for (const w of words) {
    if (ALIAS_LOOKUP.has(w)) {
      const heroId = ALIAS_LOOKUP.get(w);
      return HEROES.find(h => h.id === heroId) || null;
    }
  }

  return null;
}
