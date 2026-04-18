const test = require('node:test');
const assert = require('node:assert/strict');
const { getTokenExpiryMs } = require('../dist/api-client');

function createJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${encodedPayload}.signature`;
}

test('getTokenExpiryMs parses a standard base64url JWT payload', () => {
  const token = createJwt({
    sub: 'flashpad-user',
    exp: 1760000000,
    roles: ['notes:write'],
    device_id: 'mobile-ios',
  });

  assert.equal(getTokenExpiryMs(token), 1760000000 * 1000);
});

test('getTokenExpiryMs returns null when exp is missing', () => {
  const token = createJwt({ sub: 'flashpad-user' });
  assert.equal(getTokenExpiryMs(token), null);
});

test('getTokenExpiryMs returns null for malformed tokens', () => {
  assert.equal(getTokenExpiryMs('not-a-jwt'), null);
});
