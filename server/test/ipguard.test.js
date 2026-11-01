import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAddress } from '../src/ipguard.js';

test('private, link-local, metadata, mapped and reserved addresses are refused; public ones pass; loopback is flagged', () => {
  const refused = { '10.0.0.1': 'private-10', '172.16.5.5': 'private-172', '192.168.1.1': 'private-192', '169.254.169.254': 'link-local-or-metadata', '100.64.0.1': 'cgnat', '0.0.0.0': 'this-network', '224.0.0.1': 'multicast-reserved', '255.255.255.255': 'multicast-reserved', '192.0.2.1': 'documentation',
    'fd00:ec2::254': 'unique-local-or-metadata', 'fe80::1': 'link-local', '::': 'unspecified-or-compat', '::ffff:10.0.0.1': 'ipv4-mapped', '::ffff:127.0.0.1': 'ipv4-mapped', '64:ff9b::a00:1': 'nat64', '2002:a00:1::1': '6to4', 'ff02::1': 'multicast', '2001:db8::1': 'documentation', '4000::1': 'not-global-unicast' };
  for (const [a, reason] of Object.entries(refused)) { const c = classifyAddress(a); assert.equal(c.ok, false, a); assert.equal(c.reason, reason, a); assert.equal(c.loopback, false, a); }
  for (const a of ['127.0.0.1', '127.8.8.8', '::1']) { const c = classifyAddress(a); assert.deepEqual([c.ok, c.loopback], [false, true], a); }
  for (const a of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(classifyAddress(a).ok, true, a);
  for (const a of ['', 'abc', '999.1.1.1', '1.2.3', '[::1]x']) assert.equal(classifyAddress(a).reason, 'unparseable', a);
});
