// Address classification for the probe's SSRF guard. Public unicast only; loopback is reported separately so the caller
// can allow it ONLY when the user typed a loopback target. Blocks are deliberately wholesale (IPv4-mapped, NAT64, 6to4, Teredo).
import { BlockList, isIP } from 'node:net';

const mk = (entries, family) => { const b = new BlockList(); for (const [a, bits] of entries) b.addSubnet(a, bits, family); return b; };
const V4 = [
  ['this-network', [['0.0.0.0', 8]]], ['private-10', [['10.0.0.0', 8]]], ['cgnat', [['100.64.0.0', 10]]], ['link-local-or-metadata', [['169.254.0.0', 16]]],
  ['private-172', [['172.16.0.0', 12]]], ['ietf-protocol', [['192.0.0.0', 24]]], ['private-192', [['192.168.0.0', 16]]], ['benchmark', [['198.18.0.0', 15]]],
  ['documentation', [['192.0.2.0', 24], ['198.51.100.0', 24], ['203.0.113.0', 24]]], ['multicast-reserved', [['224.0.0.0', 4], ['240.0.0.0', 4]]],
].map(([label, e]) => [label, mk(e, 'ipv4')]);
const V6 = [
  ['unspecified-or-compat', [['::', 96]]], ['ipv4-mapped', [['::ffff:0:0', 96]]], ['nat64', [['64:ff9b::', 96]]], ['6to4', [['2002::', 16]]], ['teredo', [['2001::', 32]]],
  ['documentation', [['2001:db8::', 32]]], ['unique-local-or-metadata', [['fc00::', 7]]], ['link-local', [['fe80::', 10], ['fec0::', 10]]], ['multicast', [['ff00::', 8]]],
].map(([label, e]) => [label, mk(e, 'ipv6')]);
const LOOP4 = mk([['127.0.0.0', 8]], 'ipv4');
const LOOP6 = mk([['::1', 128]], 'ipv6');
const GLOBAL6 = mk([['2000::', 3]], 'ipv6');

// -> { ok: boolean, loopback: boolean, reason: string }
export function classifyAddress(addr) {
  const a = String(addr).replace(/^\[|\]$/g, '');
  const fam = isIP(a);
  if (!fam) return { ok: false, loopback: false, reason: 'unparseable' };
  if (fam === 4) {
    if (LOOP4.check(a, 'ipv4')) return { ok: false, loopback: true, reason: 'loopback' };
    for (const [label, b] of V4) if (b.check(a, 'ipv4')) return { ok: false, loopback: false, reason: label };
    return { ok: true, loopback: false, reason: 'public' };
  }
  if (LOOP6.check(a, 'ipv6')) return { ok: false, loopback: true, reason: 'loopback' };
  for (const [label, b] of V6) if (b.check(a, 'ipv6')) return { ok: false, loopback: false, reason: label };
  if (!GLOBAL6.check(a, 'ipv6')) return { ok: false, loopback: false, reason: 'not-global-unicast' };
  return { ok: true, loopback: false, reason: 'public' };
}
