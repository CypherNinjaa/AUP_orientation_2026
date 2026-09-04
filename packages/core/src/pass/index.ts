/**
 * Pass issuance and identification — server side.
 *
 * `verify-web.ts` is deliberately *not* re-exported here. It is reached through
 * `@orientation/core/pass/verify-web` so that a client bundle importing browser
 * verification cannot pull `node:crypto` in through this barrel.
 */
export {
  CODE10_LENGTH,
  REFERENCE_BODY_LENGTH,
  REFERENCE_PREFIX,
  formatCode10,
  generateCode10,
  generateReference,
  isCode10,
  isReference,
  normaliseReference,
  parseCode10,
} from './codes'

export {
  ENVELOPE_NAMESPACE,
  ENVELOPE_VERSION,
  looksLikeEnvelope,
  parseEnvelope,
  serialiseEnvelope,
  signableMessage,
  type EnvelopeFields,
  type PassEnvelope,
} from './envelope'

export {
  PassKeyError,
  assertKeyPairMatches,
  deriveKeyId,
  generatePassKeyPair,
  loadSigningKey,
  loadVerifyingKey,
  signPass,
  verifyPassPayload,
  type IssuedEnvelope,
  type SignatureState,
  type SigningKey,
  type VerifyResult,
  type VerifyingKey,
} from './sign'
