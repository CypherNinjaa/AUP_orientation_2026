/**
 * The scan decision. One module, imported by both the offline scanner and the
 * server sync endpoint so the two can never disagree.
 */
export {
  badgeFor,
  decideScan,
  toneFor,
  type CodeSource,
  type KnownPass,
  type PassStatus,
  type RegistrationStatus,
  type ScanContext,
  type ScanDecision,
  type ScanInput,
  type ScanOutcome,
  type ScanReason,
  type SignatureState,
} from './decide'
