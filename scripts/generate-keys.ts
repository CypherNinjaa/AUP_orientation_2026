/**
 * Generate the two secrets that cannot be typed by hand.
 *
 *   npm run keys:generate
 *
 * Prints an ECDSA P-256 pass signing pair and an AES-256 secrets key, ready to
 * paste into `.env`. Nothing is written to disk on purpose: a private key that a
 * script drops in a file is a private key somebody forgets to delete, and a shell
 * history is easier to clear than a stray `keys.txt` in a repo.
 *
 * Run it once per environment. The production pair must be different from the
 * local one — a leaked development key that also signs live passes is a forgery
 * tool.
 */
import { randomBytes } from 'node:crypto'
import { generatePassKeyPair } from '../packages/core/src/pass/sign'

const pair = generatePassKeyPair()
const secretsKey = randomBytes(32).toString('base64')

// PEM is multi-line and every deployment UI mangles that differently, so the
// values are base64 of the PEM: one line, no escaping, no quoting.
process.stdout.write(`
# ─── Generated ${new Date().toISOString()} ──────────────────────────────────
# Pass signing key id: ${pair.keyId}
# Paste these three lines into .env. Keep PASS_PRIVATE_KEY and SECRETS_KEY off
# every device that is not the server.

PASS_PRIVATE_KEY=${pair.privateKeyBase64}
PASS_PUBLIC_KEY=${pair.publicKeyBase64}
SECRETS_KEY=${secretsKey}

# The public key, decoded, for reference — this is the only half that ever
# reaches a volunteer's phone:
#
${pair.publicKeyPem
  .trim()
  .split('\n')
  .map((line) => `#   ${line}`)
  .join('\n')}
#
# Rotating PASS_PRIVATE_KEY invalidates nothing already issued *provided* the old
# public key stays in the manifest — keep both until the last pass expires.
# Rotating SECRETS_KEY makes every stored secondary Cloudinary secret unreadable;
# they have to be re-entered in the admin UI afterwards.
`)
