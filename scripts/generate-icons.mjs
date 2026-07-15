// One-off PWA icon generation from public/favicon.svg (npm run icons).
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pub = (f) => path.join(root, 'public', f)
const svg = await readFile(pub('favicon.svg'))

await sharp(svg).resize(192, 192).png().toFile(pub('pwa-192x192.png'))
await sharp(svg).resize(512, 512).png().toFile(pub('pwa-512x512.png'))
await sharp(svg).resize(180, 180).png().toFile(pub('apple-touch-icon.png'))

// Maskable: full-bleed background, glyph shrunk into the ~80% safe zone.
const glyph = await sharp(svg).resize(410, 410).png().toBuffer()
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#0f172a' },
})
  .composite([{ input: glyph, gravity: 'center' }])
  .png()
  .toFile(pub('pwa-maskable-512x512.png'))

console.log('Icons generated in public/')
