// Fills {{token}} placeholders from the chosen vertical's cast. Unknown tokens are left visible, never dropped.
export const fill = (text, cast) => String(text ?? "").replace(/\{\{(\w+)\}\}/g, (m, k) => (cast && k in cast ? String(cast[k]) : m));
