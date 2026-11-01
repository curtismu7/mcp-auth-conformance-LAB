// WWW-Authenticate parser. Iterative, linear time, hard limits; never throws. Returns what it saw and what is wrong.
// Grammar read in RFC 9110 (challenge = auth-scheme [ 1*SP ( token68 / #auth-param ) ]) and RFC 6750 section 3.
export const LIMITS = Object.freeze({ maxLength: 8192, maxChallenges: 20, maxParams: 50 });
const TOKEN = /[A-Za-z0-9!#$%&'*+.^_`|~-]/;
const isSp = (c) => c === ' ' || c === '\t';

// -> { challenges: [{ scheme, params: [{name,value,quoted}], token68 }], problems: [{ code, message }] }
export function parseChallenges(value) {
  const s = String(value ?? '');
  const out = { challenges: [], problems: [] };
  const problem = (code, message) => { if (out.problems.length < 20) out.problems.push({ code, message }); };
  if (s.length > LIMITS.maxLength) { problem('too_long', `header is ${s.length} characters; the lab stops at ${LIMITS.maxLength}`); return out; }
  const n = s.length;
  let i = 0;
  let cur = null;
  let afterComma = false;
  const skip = () => { while (i < n && isSp(s[i])) i += 1; };
  const token = () => { const st = i; while (i < n && TOKEN.test(s[i])) i += 1; return s.slice(st, i); };
  const start = (scheme) => {
    if (out.challenges.length >= LIMITS.maxChallenges) { problem('too_many', `more than ${LIMITS.maxChallenges} challenges`); i = n; return; }
    cur = { scheme, params: [], token68: null }; out.challenges.push(cur); afterComma = false;
  };
  skip();
  const first = token();
  if (!first) { problem('no_scheme', 'the header does not start with an auth-scheme token'); return out; }
  start(first);
  while (i < n) {
    skip();
    if (i >= n) break;
    if (s[i] === ',') {
      if (afterComma) problem('empty_element', 'an empty element in the param list');
      else if (!cur.params.length && cur.token68 === null) problem('empty_first_param', 'a comma directly after the scheme leaves the first auth-param empty');
      afterComma = true; i += 1; continue;
    }
    const st = i; const name = token();
    if (!name) { problem('bad_char', `unexpected character ${JSON.stringify(s[i])}`); i += 1; continue; }
    skip();
    if (s[i] === '=' && s[i + 1] !== '=' ) {
      i += 1; skip();
      let val = ''; let quoted = false;
      if (s[i] === '"') {
        quoted = true; i += 1; let closed = false;
        while (i < n) {
          if (s[i] === '\\' && i + 1 < n) { val += s[i + 1]; i += 2; continue; }
          if (s[i] === '"') { closed = true; i += 1; break; }
          val += s[i]; i += 1;
        }
        if (!closed) problem('unterminated_quote', `the quoted value of ${name} never closes`);
      } else { const vs = i; while (i < n && s[i] !== ',' && !isSp(s[i])) i += 1; val = s.slice(vs, i); if (!val) problem('missing_value', `${name} has no value`); }
      if (cur.params.length >= LIMITS.maxParams) { problem('too_many', `more than ${LIMITS.maxParams} params`); break; }
      if (cur.params.length && !afterComma) problem('missing_comma', `no comma before ${name}`);
      cur.params.push({ name: name.toLowerCase(), value: val, quoted }); afterComma = false; continue;
    }
    if (afterComma) { start(name); continue; } // a bare token after a comma starts the next challenge
    if (!cur.params.length && cur.token68 === null) { cur.token68 = name; while (s[i] === '=') i += 1; continue; }
    problem('bad_param', `${s.slice(st, i)} is not a name=value pair`);
  }
  if (afterComma) problem('empty_element', 'a trailing comma leaves an empty element');
  return out;
}

export const param = (challenge, name) => challenge?.params.find((p) => p.name === name)?.value;
