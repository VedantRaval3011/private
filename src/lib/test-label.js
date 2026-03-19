function toTitleCase(str) {
  return str.split(' ').map(w => {
    if (['BP', 'IP', 'USP', 'EP'].includes(w.toUpperCase())) return w.toUpperCase();
    if (w.toUpperCase() === 'Q.S.') return 'q.s.';
    if (w.length === 0) return '';
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

function formatLabelClaim(raw) {
  if (!raw || raw.trim() === 'N/A') return raw || '';

  const hasComposition = /^COMPOSITION\s*[:\-]?\s*/i.test(raw);
  const body = raw.replace(/^COMPOSITION\s*[:\-]?\s*/i, '').trim();

  // Split on 2+ consecutive dots
  const parts = body.split(/\.{2,}/);
  if (parts.length < 2) return raw.trim();

  const lines = [];


  let currentName = parts[0].trim();

  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i].trim();

    // Match value (e.g. 0.1%W/V, Q.S.), optional parenthetical qualifier, and next name
    const valueMatch = segment.match(
      /^([\d.]+\s*%\s*[A-Z/]+|Q\.S\.(?:\s+ON\s+DRIED\s+BASIS)?|Q\.S\.?)\s*(\([^)]*\))?\s*([\s\S]*?)$/i
    );

    if (valueMatch) {
      const rawValue = valueMatch[1].trim();
      const qualifier = valueMatch[2] ? valueMatch[2].trim() : '';
      const rest = valueMatch[3].trim();

      // Lowercase units like % w/v or q.s.
      let value = rawValue.toLowerCase().replace(/%\s*w\s*\/\s*v/g, '% w/v').replace(/%\s*w\s*\/\s*w/g, '% w/w').replace(/%\s*v\s*\/\s*v/g, '% v/v');

      lines.push(`${toTitleCase(currentName)} ……… ${value}`);
      if (qualifier) lines.push(toTitleCase(qualifier));
      currentName = rest;
    } else {
      if (currentName) lines.push(toTitleCase(currentName));
      currentName = segment;
    }
  }
  if (currentName) lines.push(toTitleCase(currentName));

  return lines.join('\n');
}

const raw = "COMPOSITION: SODIUM HYALURONATE BP.....................0.1%W/V STABILIZED OXYCHLORO COMPLEX ........0.005%W/V (AS PRESERVATIVE) STERILE AQUEOUS BASE ..................... Q.S.";
console.log(formatLabelClaim(raw));
