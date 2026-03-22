import sharp from 'sharp'
import { writeFileSync } from 'fs'

const url = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/HEM%E1%84%91%E1%85%A1%E1%84%86%E1%85%A1_CI-1-fYz4G5Ld5rfaFhdppQPaawBcivPYA2.png'

const res = await fetch(url)
const arrayBuffer = await res.arrayBuffer()
const buffer = Buffer.from(arrayBuffer)

const meta = await sharp(buffer).metadata()
console.log('[v0] Image dimensions:', meta.width, 'x', meta.height)

const cropHeight = Math.floor(meta.height * 0.5)

await sharp(buffer)
  .extract({ left: 0, top: 0, width: meta.width, height: cropHeight })
  .toFile('/vercel/share/v0-project/public/images/hem-pharma-logo.png')

console.log('[v0] Cropped image saved to public/images/hem-pharma-logo.png')
