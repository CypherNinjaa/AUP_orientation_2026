/**
 * Turning a `Pass` row into things a human can present at a gate.
 *
 * Three encodings of the same fact, because a gate at 8:30 in September sunlight
 * with 15,000 people arriving cannot depend on one of them working (D6):
 *
 *   - **QR** carries the whole signed envelope. Offline verification with no
 *     lookup: the volunteer's device checks the ECDSA signature against a public
 *     key it already holds and knows the pass is genuine without a network.
 *   - **Code128** carries only the ten-digit code. A barcode holding 200 bytes of
 *     base64url would be too dense for a phone camera at arm's length, so this one
 *     is a *lookup key* and resolves against the offline manifest.
 *   - **The printed code**, `XXX-XXX-XXXX`, for when both cameras fail and a
 *     volunteer types it. Grouped in threes because that is what a person can hold
 *     in their head while looking away from the screen.
 *
 * ## Why the PDF uses standard fonts
 *
 * `pdf-lib` can embed a TTF, and embedding one would let the pass carry the site's
 * Plus Jakarta Sans. It does not, for one reason: a font file is ~200 KB per
 * document and this route can be hit by every student in the same hour. Helvetica
 * is in every PDF reader already.
 *
 * The cost is WinAnsi encoding, which cannot represent a Devanagari name or a
 * character outside Latin-1. `winAnsi()` below replaces what it cannot draw instead
 * of throwing, because a pass with a transliterated name still admits the student
 * and a 500 does not. The QR and the code are unaffected — they are what the gate
 * actually reads.
 */
import 'server-only'

import bwipjs from 'bwip-js/node'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'

import { formatCode10 } from '@orientation/core/pass'
import type { CompanionRelationship } from '@orientation/contracts'

import { EVENT } from '../event'

/**
 * Letter-spaced text.
 *
 * `pdf-lib` has no `characterSpacing`, so tracking is done by drawing one glyph at
 * a time and advancing by the measured width plus the gap. Used only for the
 * eyebrow labels and the pass code — the two places where tracking is doing real
 * work (small caps stay legible, and a ten-digit code is easier to read aloud) and
 * where the string is short enough that per-glyph draws are irrelevant.
 */
function drawTracked(
  page: { drawText: (t: string, o: Record<string, unknown>) => void },
  text: string,
  options: {
    x: number
    y: number
    size: number
    font: { widthOfTextAtSize: (t: string, s: number) => number }
    color: unknown
    tracking: number
  },
): number {
  let cursor = options.x
  for (const glyph of text) {
    page.drawText(glyph, {
      x: cursor,
      y: options.y,
      size: options.size,
      font: options.font,
      color: options.color,
    })
    cursor += options.font.widthOfTextAtSize(glyph, options.size) + options.tracking
  }
  return cursor - options.x - options.tracking
}

/** Amity navy, as the site uses it. */
const NAVY = rgb(0.071, 0.137, 0.361)
const INK = rgb(0.11, 0.13, 0.2)
const MUTED = rgb(0.42, 0.45, 0.53)
const HAIRLINE = rgb(0.85, 0.87, 0.92)

// ─────────────────────────────────────────────────────────────────────────────
// Symbologies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The QR as inline SVG, for the in-app pass.
 *
 * SVG rather than a data-URL PNG: it stays crisp when a student pinch-zooms to
 * help a volunteer's camera focus, and it is a few hundred bytes in the HTML
 * instead of a base64 image in the payload.
 *
 * Error correction level M, not H. The envelope is ~180 characters; at H the
 * module count rises enough that a cracked phone screen in sunlight becomes the
 * limiting factor rather than the redundancy.
 */
export async function qrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
  })
}

/** The QR as a PNG buffer, for the PDF. */
export async function qrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 900,
  })
}

/**
 * Code128 of the ten-digit code.
 *
 * `includetext: false` — the code is typeset separately in a size a person can
 * read, and bwip-js's own text rendering is small enough to be decorative.
 * `height` is in millimetres and 14 mm is what a phone camera can resolve at the
 * ~200 mm a student holds a screen from a volunteer.
 */
export async function barcodePng(code10: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: code10,
    scale: 4,
    height: 14,
    includetext: false,
    paddingwidth: 8,
    paddingheight: 4,
  })
}

/**
 * The same Code128, as inline SVG, for the in-app pass.
 *
 * SVG rather than a base64 PNG for the same reason as the QR: it survives a
 * pinch-zoom, and it keeps a 20 KB image out of a JSON payload the dashboard
 * fetches over campus wifi.
 */
export function barcodeSvg(code10: string): string {
  return bwipjs.toSVG({
    bcid: 'code128',
    text: code10,
    height: 14,
    includetext: false,
    paddingwidth: 4,
    paddingheight: 2,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// The PDF
// ─────────────────────────────────────────────────────────────────────────────

export interface PassPdfInput {
  name: string
  program: string
  reference: string
  code10: string
  qrPayload: string
  guestCount: number
  companions: { relationship: CompanionRelationship; name: string }[]
  issuedAt: Date
}

const RELATIONSHIP_LABEL: Record<CompanionRelationship, string> = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  GUARDIAN: 'Guardian',
}

/**
 * Replace anything Helvetica cannot draw.
 *
 * `pdf-lib` throws on a character outside WinAnsi, which would turn one student
 * with an accented name into a 500. A transliteration is imperfect and visible;
 * a failed download is neither.
 */
function winAnsi(value: string): string {
  return value
    .normalize('NFKD')
    // Strip combining marks — `José` becomes `Jose` rather than failing.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^ -~ -ÿ]/g, '?')
}

/**
 * A5 landscape, 595 × 420 pt.
 *
 * Sized so it prints two-up on A4 and so it fills a phone screen when the student
 * opens the download instead of printing it — which most of them will.
 */
const WIDTH = 595
const HEIGHT = 420

export async function renderPassPdf(input: PassPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Orientation ${EVENT.year} entry pass — ${winAnsi(input.name)}`)
  doc.setAuthor(EVENT.institution)
  doc.setSubject(`${EVENT.programme} ${EVENT.year}`)
  doc.setProducer('orientation2026')
  doc.setCreationDate(input.issuedAt)

  const page = doc.addPage([WIDTH, HEIGHT])
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)

  const [qr, barcode] = await Promise.all([
    doc.embedPng(await qrPng(input.qrPayload)),
    doc.embedPng(await barcodePng(input.code10)),
  ])

  // ── header band ───────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: HEIGHT - 74, width: WIDTH, height: 74, color: NAVY })
  drawTracked(page, winAnsi(EVENT.institution.toUpperCase()), {
    x: 32,
    y: HEIGHT - 34,
    size: 13,
    font: bold,
    color: rgb(1, 1, 1),
    tracking: 1.4,
  })
  page.drawText(winAnsi(`${EVENT.programme} ${EVENT.year} · Entry pass`), {
    x: 32,
    y: HEIGHT - 55,
    size: 10,
    font: regular,
    color: rgb(0.78, 0.82, 0.92),
  })
  page.drawText(winAnsi(EVENT.dateRange), {
    x: WIDTH - 32 - regular.widthOfTextAtSize(winAnsi(EVENT.dateRange), 10),
    y: HEIGHT - 55,
    size: 10,
    font: regular,
    color: rgb(0.78, 0.82, 0.92),
  })

  // ── identity, left column ─────────────────────────────────────────────────
  let y = HEIGHT - 112

  const label = (text: string, atY: number) => {
    drawTracked(page, winAnsi(text.toUpperCase()), {
      x: 32,
      y: atY,
      size: 7.5,
      font: bold,
      color: MUTED,
      tracking: 1.1,
    })
  }

  label('Student', y)
  y -= 20
  // The name gets whatever size fits. A 44-character name at 20pt overruns the
  // QR panel, and a pass with the name clipped is a pass a volunteer cannot check.
  const nameText = winAnsi(input.name)
  const nameSize = [20, 17, 14, 12].find((size) => bold.widthOfTextAtSize(nameText, size) <= 300) ?? 11
  page.drawText(nameText, { x: 32, y, size: nameSize, font: bold, color: INK })

  y -= 26
  label('Programme', y)
  y -= 15
  // Verbatim from the admissions sheet. Wrapped rather than truncated: the
  // programme is how a volunteer disambiguates two students with the same name,
  // and `B.Tech CSE (AI & ML)` cut to `B.Tech CSE (AI` does not.
  for (const line of wrap(winAnsi(input.program), regular, 10, 300).slice(0, 2)) {
    page.drawText(line, { x: 32, y, size: 10, font: regular, color: INK })
    y -= 13
  }

  y -= 12
  label('Guests admitted', y)
  y -= 15
  const guestLine =
    input.companions.length === 0
      ? 'None — student only'
      : input.companions
          .map((c) => `${RELATIONSHIP_LABEL[c.relationship]}: ${c.name}`)
          .join('   ')
  for (const line of wrap(winAnsi(guestLine), regular, 10, 300).slice(0, 2)) {
    page.drawText(line, { x: 32, y, size: 10, font: regular, color: INK })
    y -= 13
  }

  // ── the code, bottom left ─────────────────────────────────────────────────
  page.drawLine({
    start: { x: 32, y: 128 },
    end: { x: 332, y: 128 },
    thickness: 0.75,
    color: HAIRLINE,
  })

  label('Pass code', 110)
  drawTracked(page, formatCode10(input.code10), {
    x: 32,
    y: 84,
    size: 21,
    font: bold,
    color: NAVY,
    tracking: 1.5,
  })

  page.drawImage(barcode, { x: 32, y: 40, width: 300, height: 36 })

  // ── QR panel, right ───────────────────────────────────────────────────────
  const panelX = 372
  page.drawRectangle({
    x: panelX,
    y: 40,
    width: 191,
    height: HEIGHT - 74 - 40 - 24,
    color: rgb(0.976, 0.98, 0.992),
    borderColor: HAIRLINE,
    borderWidth: 0.75,
  })

  const qrSize = 152
  page.drawImage(qr, {
    x: panelX + (191 - qrSize) / 2,
    y: HEIGHT - 74 - 24 - qrSize - 14,
    width: qrSize,
    height: qrSize,
  })

  const scanNote = 'Show this at the gate'
  page.drawText(winAnsi(scanNote), {
    x: panelX + (191 - bold.widthOfTextAtSize(winAnsi(scanNote), 9)) / 2,
    y: HEIGHT - 74 - 24 - qrSize - 34,
    size: 9,
    font: bold,
    color: INK,
  })

  const refNote = `Ref ${input.reference}`
  page.drawText(winAnsi(refNote), {
    x: panelX + (191 - regular.widthOfTextAtSize(winAnsi(refNote), 8)) / 2,
    y: HEIGHT - 74 - 24 - qrSize - 48,
    size: 8,
    font: regular,
    color: MUTED,
  })

  // ── footer ────────────────────────────────────────────────────────────────
  const footer = winAnsi(
    `${EVENT.venue.name}, ${EVENT.venue.street} · ${EVENT.timeNote} · Help desk ${EVENT.helpline}`,
  )
  page.drawText(footer, { x: 32, y: 20, size: 7.5, font: regular, color: MUTED })

  // A warning rather than a rule the PDF can enforce: the QR is the same signed
  // envelope in every copy, and `CheckIn.passId UNIQUE` is what makes a second
  // scan a `DUPLICATE`. Saying so is what stops a student sharing it in good faith.
  const notice = winAnsi('Admits one student and the guests named above, once. Do not share.')
  page.drawText(notice, {
    x: WIDTH - 32 - regular.widthOfTextAtSize(notice, 7.5),
    y: 20,
    size: 7.5,
    font: regular,
    color: MUTED,
  })

  return doc.save()
}

/** Greedy word wrap against a measured font. */
function wrap(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']

  const lines: string[] = []
  let current = words[0] as string

  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  lines.push(current)
  return lines
}
