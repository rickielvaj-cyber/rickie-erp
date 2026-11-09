import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { verifyAccessToken } from "./mcp/auth";

const ISSUER = "https://abc.supabase.co/auth/v1";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  const other = await generateKeyPair("ES256");
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, opts: { key?: CryptoKey; iss?: string; aud?: string; exp?: string | number } = {}) =>
    new SignJWT({ role: "authenticated", client_id: "client-1", ...claims })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setSubject("user-1")
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? "authenticated")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "1h")
      .sign(opts.key ?? privateKey);
  return { jwks, sign, otherKey: other.privateKey };
}

test("accepts a valid OAuth access token", async () => {
  const { jwks, sign } = await setup();
  const info = await verifyAccessToken(await sign({}), { issuer: ISSUER, jwks });
  assert.equal(info?.clientId, "client-1");
  assert.equal(info?.extra?.userId, "user-1");
  assert.ok((info?.expiresAt ?? 0) > Date.now() / 1000);
});

test("rejects wrong issuer, audience, expired, bad signature", async () => {
  const { jwks, sign, otherKey } = await setup();
  const opts = { issuer: ISSUER, jwks };
  assert.equal(await verifyAccessToken(await sign({}, { iss: "https://evil.example/auth/v1" }), opts), undefined);
  assert.equal(await verifyAccessToken(await sign({}, { aud: "something-else" }), opts), undefined);
  assert.equal(await verifyAccessToken(await sign({}, { exp: Math.floor(Date.now() / 1000) - 60 }), opts), undefined);
  assert.equal(await verifyAccessToken(await sign({}, { key: otherKey }), opts), undefined);
  assert.equal(await verifyAccessToken("not-a-jwt", opts), undefined);
});

test("rejects tokens without client_id (normal web sessions) or wrong role", async () => {
  const { jwks, sign } = await setup();
  const opts = { issuer: ISSUER, jwks };
  assert.equal(await verifyAccessToken(await sign({ client_id: undefined }), opts), undefined);
  assert.equal(await verifyAccessToken(await sign({ role: "anon" }), opts), undefined);
});

test("rejects HS256 tokens", async () => {
  const { jwks } = await setup();
  const hs = await new SignJWT({ role: "authenticated", client_id: "c" })
    .setProtectedHeader({ alg: "HS256", kid: "k1" })
    .setSubject("u")
    .setIssuer(ISSUER)
    .setAudience("authenticated")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("secret-secret-secret-secret-secret!"));
  assert.equal(await verifyAccessToken(hs, { issuer: ISSUER, jwks }), undefined);
});
