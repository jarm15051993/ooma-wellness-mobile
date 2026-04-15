const sharp = require('sharp')

const SIZE = 1024
const CX = 512, CY = 512

// O ring — slightly taller oval for a serif O feel
const OUTER_RX = 420, OUTER_RY = 440
const INNER_RX = 268, INNER_RY = 292

// Crescent: cubic bezier inner edge with horizontal tangents at tips.
// Width at center = 128 + 0.75*CTRL_X - 244
// CTRL_X=290 → ~101px wide at center (~19% of counter)
const CTRL_X = 290

const innerLeft  = CX - INNER_RX  // 244
const innerRight = CX + INNER_RX  // 780
const outerLeft  = CX - OUTER_RX  //  92
const outerRight = CX + OUTER_RX  // 932
const innerTop   = CY - INNER_RY  // 220
const innerBot   = CY + INNER_RY  // 804

// ── Shared path (cream, no background) ──────────────────────────────────────
// Evenodd compound: outer ellipse + inner ellipse (hole) + crescent (re-fill)
const crescentPath = `
    M ${outerLeft} ${CY}
    A ${OUTER_RX} ${OUTER_RY} 0 0 1 ${outerRight} ${CY}
    A ${OUTER_RX} ${OUTER_RY} 0 0 1 ${outerLeft}  ${CY}
    Z

    M ${innerLeft} ${CY}
    A ${INNER_RX} ${INNER_RY} 0 0 1 ${innerRight} ${CY}
    A ${INNER_RX} ${INNER_RY} 0 0 1 ${innerLeft}  ${CY}
    Z

    M ${CX} ${innerTop}
    A ${INNER_RX} ${INNER_RY} 0 0 0 ${CX} ${innerBot}
    C ${CTRL_X} ${innerBot} ${CTRL_X} ${innerTop} ${CX} ${innerTop}
    Z`

// ── icon.png  (ink background + cream logo) ─────────────────────────────────
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#1C1A14"/>
  <path fill-rule="evenodd" fill="#FAF7F2" d="${crescentPath}"/>
</svg>`

// ── android-icon-foreground.png  (transparent bg + cream logo, for adaptive) ─
const fgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <path fill-rule="evenodd" fill="#FAF7F2" d="${crescentPath}"/>
</svg>`

// ── android-icon-background.png  (solid ink, 512×512) ──────────────────────
const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1C1A14"/>
</svg>`

// ── splash-icon.png  (transparent bg + cream logo — shown on ink splash bg) ─
// Same as foreground (cream on transparent); app.json splash bg = #1C1A14
const splashSvg = fgSvg

// ── android-icon-monochrome.png  (white O on transparent, for Android 13+ themed icons) ─
const monoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <path fill-rule="evenodd" fill="#FFFFFF" d="${crescentPath}"/>
</svg>`

async function run() {
  await sharp(Buffer.from(iconSvg)).resize(SIZE, SIZE).png().toFile('assets/icon.png')
  console.log('✓ icon.png')

  await sharp(Buffer.from(fgSvg)).resize(SIZE, SIZE).png().toFile('assets/android-icon-foreground.png')
  console.log('✓ android-icon-foreground.png')

  await sharp(Buffer.from(bgSvg)).resize(512, 512).png().toFile('assets/android-icon-background.png')
  console.log('✓ android-icon-background.png')

  await sharp(Buffer.from(splashSvg)).resize(SIZE, SIZE).png().toFile('assets/splash-icon.png')
  console.log('✓ splash-icon.png')

  await sharp(Buffer.from(monoSvg)).resize(SIZE, SIZE).png().toFile('assets/android-icon-monochrome.png')
  console.log('✓ android-icon-monochrome.png')
}

run().catch(console.error)
