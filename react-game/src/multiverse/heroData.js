// Multiverse 16-Hero Tournament Roster Data & Smart Chat Keyword Matcher
// Engineered for @Spiddyfacts audience engagement with maximum keyword flexibility

export const HEROES = [
  {
    id: 'spidey',
    name: 'Spider-Man',
    shortName: 'Spidey',
    callout: 'SPIDEY',
    team: 'Marvel Knights',
    teamColor: '#ef4444',
    color: '#ef4444',
    secondaryColor: '#2563eb',
    gradient: 'linear-gradient(135deg, #dc2626, #2563eb)',
    glow: 'rgba(239, 68, 68, 0.65)',
    attackName: 'Web Blast',
    iconSvg: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 3.1a8 8 0 0 1 4.9 2.5l-3.4 1.5zm-2 0l-1.5 4-3.4-1.5A8 8 0 0 1 11 5.1zM5.1 11a8 8 0 0 1 1.4-3.7l3.6 1.6-1.5 4zm0 2l3.5-1.9 1.5 4-3.6 1.6A8 8 0 0 1 5.1 13zm7.9 5.9a8 8 0 0 1-4.9-2.5l3.4-1.5zm2 0l1.5-4 3.4 1.5a8 8 0 0 1-4.9 2.5zm3.9-5.9l-3.5 1.9-1.5-4 3.6-1.6a8 8 0 0 1 1.4 3.7zm0-2a8 8 0 0 1-1.4 3.7l-3.6-1.6 1.5-4z',
    aliases: [
      'spidey', 'spider-man', 'spiderman', 'spider man', 'spider', 'peter parker',
      'peter', 'miles', 'miles morales', 'webhead', 'webslinger', 'spideman'
    ]
  },
  {
    id: 'batman',
    name: 'Batman',
    shortName: 'Batman',
    callout: 'BATMAN',
    team: 'Justice Alliance',
    teamColor: '#f59e0b',
    color: '#f59e0b',
    secondaryColor: '#1e293b',
    gradient: 'linear-gradient(135deg, #0f172a, #334155)',
    glow: 'rgba(245, 158, 11, 0.6)',
    attackName: 'Batarang Strike',
    iconSvg: 'M12 4c.6 1.6 1.8 2.8 3.5 3.3.4.1.8.3 1.2.6C18.4 9 20.3 10.8 22 13c-2.4-.2-4.5.6-6 2.2-1.5-1.6-3.6-2.4-6-2.2 1.7-2.2 3.6-4 5.3-5.1.4-.3.8-.5 1.2-.6 1.7-.5 2.9-1.7 3.5-3.3-2.1.8-4.2 2-6 3.6-1.8-1.6-3.9-2.8-6-3.6z',
    aliases: [
      'batman', 'bat man', 'bat', 'dark knight', 'bruce wayne', 'bruce',
      'gotham', 'batwing', 'wayne', 'the dark knight', 'batsy'
    ]
  },
  {
    id: 'deadpool',
    name: 'Deadpool',
    shortName: 'Deadpool',
    callout: 'DEADPOOL',
    team: 'Anti-Heroes',
    teamColor: '#dc2626',
    color: '#dc2626',
    secondaryColor: '#18181b',
    gradient: 'linear-gradient(135deg, #b91c1c, #450a0a)',
    glow: 'rgba(220, 38, 38, 0.7)',
    attackName: 'Dual Katanas',
    iconSvg: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 3.5c2.49 0 4.5 2.01 4.5 4.5 0 2.25-1.5 5.5-4.5 8.5-3-3-4.5-6.25-4.5-8.5 0-2.49 2.01-4.5 4.5-4.5zm0 2c-1.38 0-2.5 1.12-2.5 2.5 0 1.2.8 3.2 2.5 5.2 1.7-2 2.5-4 2.5-5.2 0-1.38-1.12-2.5-2.5-2.5z',
    aliases: [
      'deadpool', 'dead pool', 'dp', 'wade', 'wade wilson', 'merc with a mouth',
      'pool', 'chimichanga', 'wadewilson'
    ]
  },
  {
    id: 'wolverine',
    name: 'Wolverine',
    shortName: 'Wolverine',
    callout: 'WOLVERINE',
    team: 'Anti-Heroes',
    teamColor: '#eab308',
    color: '#eab308',
    secondaryColor: '#1d4ed8',
    gradient: 'linear-gradient(135deg, #ca8a04, #1e40af)',
    glow: 'rgba(234, 179, 8, 0.7)',
    attackName: 'Adamantium Slash',
    iconSvg: 'M4 3l4 18h2L7 3H4zm6 0l2 18h2l-2-18h-2zm6 0l-1 18h2l3-18h-4z',
    aliases: [
      'wolverine', 'logan', 'weapon x', 'wolvie', 'claws', 'adamantium',
      'james howlett', 'wolverin', 'wolvarine'
    ]
  },
  {
    id: 'ironman',
    name: 'Iron Man',
    shortName: 'Iron Man',
    callout: 'IRON MAN',
    team: 'Tech Avengers',
    teamColor: '#e11d48',
    color: '#e11d48',
    secondaryColor: '#f59e0b',
    gradient: 'linear-gradient(135deg, #be123c, #d97706)',
    glow: 'rgba(245, 158, 11, 0.7)',
    attackName: 'Repulsor Blast',
    iconSvg: 'M12 2L4 6v8l8 8 8-8V6l-8-4zm-4 7h8v2H8V9zm1 4h6v2H9v-2zm2 4h2v2h-2v-2z',
    aliases: [
      'ironman', 'iron man', 'tony stark', 'tony', 'stark', 'iron',
      'arc reactor', 'jarvis', 'friday', 'iron-man'
    ]
  },
  {
    id: 'joker',
    name: 'Joker',
    shortName: 'Joker',
    callout: 'JOKER',
    team: 'Chaos Legion',
    teamColor: '#9333ea',
    color: '#9333ea',
    secondaryColor: '#22c55e',
    gradient: 'linear-gradient(135deg, #7e22ce, #16a34a)',
    glow: 'rgba(147, 51, 234, 0.7)',
    attackName: 'Laughing Gas',
    iconSvg: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-3 6a2 2 0 1 1-2 2 2 2 0 0 1 2-2zm6 0a2 2 0 1 1-2 2 2 2 0 0 1 2-2zm-8.8 6.5a7 7 0 0 0 11.6 0 1 1 0 0 1 1.6 1.2 9 9 0 0 1-14.8 0 1 1 0 0 1 1.6-1.2z',
    aliases: [
      'joker', 'the joker', 'clown', 'clown prince', 'arkham', 'arthur fleck',
      'heath', 'jester', 'jockar', 'joke'
    ]
  },
  {
    id: 'thor',
    name: 'Thor',
    shortName: 'Thor',
    callout: 'THOR',
    team: 'Cosmic Titans',
    teamColor: '#06b6d4',
    color: '#06b6d4',
    secondaryColor: '#e0e7ff',
    gradient: 'linear-gradient(135deg, #0891b2, #4338ca)',
    glow: 'rgba(6, 182, 212, 0.75)',
    attackName: 'Lightning Storm',
    iconSvg: 'M11 2L4 14h6l-2 8 9-12h-6l2-8z',
    aliases: [
      'thor', 'odinson', 'god of thunder', 'mjolnir', 'stormbreaker', 'asgard',
      'asgardian', 'thunder', 'thor odinson'
    ]
  },
  {
    id: 'superman',
    name: 'Superman',
    shortName: 'Superman',
    callout: 'SUPERMAN',
    team: 'Justice Alliance',
    teamColor: '#3b82f6',
    color: '#3b82f6',
    secondaryColor: '#ef4444',
    gradient: 'linear-gradient(135deg, #1d4ed8, #b91c1c)',
    glow: 'rgba(59, 130, 246, 0.75)',
    attackName: 'Heat Vision',
    iconSvg: 'M12 2L3 7l3 11 6 4 6-4 3-11-9-5zm0 3.5l6 3.5-2 7.5-4 2.5-4-2.5-2-7.5 6-3.5zm-2 4h4v2h-4V9.5zm-1 3.5h6v1.5H9V13z',
    aliases: [
      'superman', 'super man', 'clark kent', 'clark', 'man of steel', 'kal-el',
      'kal el', 'krypton', 'super-man', 'supes'
    ]
  },
  {
    id: 'thanos',
    name: 'Thanos',
    shortName: 'Thanos',
    callout: 'THANOS',
    team: 'Cosmic Titans',
    teamColor: '#8b5cf6',
    color: '#8b5cf6',
    secondaryColor: '#f59e0b',
    gradient: 'linear-gradient(135deg, #6d28d9, #b45309)',
    glow: 'rgba(139, 92, 246, 0.75)',
    attackName: 'Infinity Snap',
    iconSvg: 'M12 2a9 9 0 0 0-9 9c0 3.8 2.4 7 5.7 8.3L9 22h6l.3-2.7C18.6 18 21 14.8 21 11a9 9 0 0 0-9-9zm-3 8a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 9 10zm6 0a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 15 10z',
    aliases: [
      'thanos', 'mad titan', 'infinity gauntlet', 'snap', 'titan', 'inevitable',
      'thanos titan', 'thanoss'
    ]
  },
  {
    id: 'doctorstrange',
    name: 'Doctor Strange',
    shortName: 'Dr Strange',
    callout: 'STRANGE',
    team: 'Mystic Order',
    teamColor: '#f97316',
    color: '#f97316',
    secondaryColor: '#10b981',
    gradient: 'linear-gradient(135deg, #ea580c, #047857)',
    glow: 'rgba(249, 115, 22, 0.75)',
    attackName: 'Mystic Portal',
    iconSvg: 'M12 2A10 10 0 1 0 22 12 10 10 0 0 0 12 2zm0 3a7 7 0 1 1-7 7 7 7 0 0 1 7-7zm0 2a5 5 0 1 0 5 5 5 5 0 0 0-5-5zm0 3a2 2 0 1 1-2 2 2 2 0 0 1 2-2z',
    aliases: [
      'strange', 'dr strange', 'doctor strange', 'dr. strange', 'stephen strange',
      'sorcerer supreme', 'eye of agamotto', 'multiverse'
    ]
  },
  {
    id: 'venom',
    name: 'Venom',
    shortName: 'Venom',
    callout: 'VENOM',
    team: 'Chaos Legion',
    teamColor: '#64748b',
    color: '#334155',
    secondaryColor: '#f8fafc',
    gradient: 'linear-gradient(135deg, #0f172a, #475569)',
    glow: 'rgba(148, 163, 184, 0.65)',
    attackName: 'Symbiote Strike',
    iconSvg: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-5 6c1.66 0 3 1.34 3 3 0 1.25-.76 2.32-1.84 2.76L9 17h-2l.84-3.24C6.76 13.32 6 12.25 6 11c0-1.66 1.34-3 3-3zm10 0c1.66 0 3 1.34 3 3 0 1.25-.76 2.32-1.84 2.76L19 17h-2l.84-3.24c-1.08-.44-1.84-1.51-1.84-2.76 0-1.66 1.34-3 3-3z',
    aliases: [
      'venom', 'symbiote', 'eddie brock', 'eddie', 'we are venom', 'black suit',
      'venomous', 'venom symbiote'
    ]
  },
  {
    id: 'hulk',
    name: 'Hulk',
    shortName: 'Hulk',
    callout: 'HULK',
    team: 'Tech Avengers',
    teamColor: '#22c55e',
    color: '#22c55e',
    secondaryColor: '#7e22ce',
    gradient: 'linear-gradient(135deg, #15803d, #6b21a8)',
    glow: 'rgba(34, 197, 94, 0.75)',
    attackName: 'Gamma Smash',
    iconSvg: 'M12 2a9 9 0 0 0-9 9c0 3.6 2.2 6.7 5.3 8L8 22h8l-.3-3c3.1-1.3 5.3-4.4 5.3-8a9 9 0 0 0-9-9zm-4 7h2v3H8V9zm6 0h2v3h-2V9zm-5 6h6v2H9v-2z',
    aliases: [
      'hulk', 'incredible hulk', 'bruce banner', 'banner', 'smash', 'gamma',
      'green monster', 'gladiator hulk', 'hulkk'
    ]
  },
  {
    id: 'captainamerica',
    name: 'Captain America',
    shortName: 'Cap',
    callout: 'CAPTAIN',
    team: 'Tech Avengers',
    teamColor: '#0284c7',
    color: '#0284c7',
    secondaryColor: '#dc2626',
    gradient: 'linear-gradient(135deg, #0369a1, #b91c1c)',
    glow: 'rgba(2, 132, 199, 0.75)',
    attackName: 'Vibranium Shield',
    iconSvg: 'M12 2A10 10 0 1 0 22 12 10 10 0 0 0 12 2zm0 3a7 7 0 1 1-7 7 7 7 0 0 1 7-7zm0 2.5a4.5 4.5 0 1 0 4.5 4.5A4.5 4.5 0 0 0 12 7.5zm0 1.8l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z',
    aliases: [
      'cap', 'captain america', 'captain', 'steve rogers', 'steve', 'shield',
      'first avenger', 'vibranium', 'cap america', 'capt'
    ]
  },
  {
    id: 'blackpanther',
    name: 'Black Panther',
    shortName: 'Panther',
    callout: 'PANTHER',
    team: 'Mystic Order',
    teamColor: '#7c3aed',
    color: '#7c3aed',
    secondaryColor: '#0f172a',
    gradient: 'linear-gradient(135deg, #5b21b6, #1e1b4b)',
    glow: 'rgba(124, 58, 237, 0.75)',
    attackName: 'Kinetic Pulse',
    iconSvg: 'M12 2L4 7v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V7l-8-5zm-3 8a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 9 10zm6 0a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 15 10zm-5 4h4v2h-4v-2z',
    aliases: [
      'black panther', 'panther', 'wakanda', 'wakanda forever', 't\'challa',
      'tchalla', 'king of wakanda', 'shuri', 'blackpanther'
    ]
  },
  {
    id: 'flash',
    name: 'The Flash',
    shortName: 'Flash',
    callout: 'FLASH',
    team: 'Justice Alliance',
    teamColor: '#ef4444',
    color: '#ef4444',
    secondaryColor: '#eab308',
    gradient: 'linear-gradient(135deg, #dc2626, #ca8a04)',
    glow: 'rgba(234, 179, 8, 0.8)',
    attackName: 'Speedforce Blitz',
    iconSvg: 'M13 2L3 14h8l-2 8 12-13h-8l2-7z',
    aliases: [
      'flash', 'the flash', 'barry allen', 'barry', 'speedforce', 'fastest man alive',
      'scarlet speedster', 'wally west', 'theflash'
    ]
  },
  {
    id: 'loki',
    name: 'Loki',
    shortName: 'Loki',
    callout: 'LOKI',
    team: 'Chaos Legion',
    teamColor: '#15803d',
    color: '#15803d',
    secondaryColor: '#eab308',
    gradient: 'linear-gradient(135deg, #166534, #a16207)',
    glow: 'rgba(34, 197, 94, 0.7)',
    attackName: 'Illusion Dagger',
    iconSvg: 'M12 2L5 8v6l7 6 7-6V8l-7-6zm-4 8l4-3 4 3-4 5-4-5z',
    aliases: [
      'loki', 'god of mischief', 'mischief', 'tva', 'laufeyson', 'loki laufeyson',
      'glorious purpose', 'frost giant', 'lokii'
    ]
  }
];

// Map of aliases to hero IDs for O(1) lookup
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

/**
 * Intelligent comment parser: finds which superhero a comment is voting for
 * Handles clean matching, prefixes ("vote spidey", "go batman", "team deadpool"),
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

  // Check 3-word combinations first (e.g. "god of thunder", "man of steel", "doctor strange")
  for (let i = 0; i <= words.length - 3; i++) {
    const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    if (ALIAS_LOOKUP.has(phrase)) {
      const heroId = ALIAS_LOOKUP.get(phrase);
      return HEROES.find(h => h.id === heroId) || null;
    }
  }

  // Check 2-word combinations (e.g. "iron man", "spider man", "dark knight", "peter parker")
  for (let i = 0; i <= words.length - 2; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (ALIAS_LOOKUP.has(phrase)) {
      const heroId = ALIAS_LOOKUP.get(phrase);
      return HEROES.find(h => h.id === heroId) || null;
    }
  }

  // Check single words (e.g. "spidey", "batman", "deadpool", "wolverine", "hulk")
  for (const w of words) {
    if (ALIAS_LOOKUP.has(w)) {
      const heroId = ALIAS_LOOKUP.get(w);
      return HEROES.find(h => h.id === heroId) || null;
    }
  }

  return null;
}
