import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'

mkdirSync('/tmp/v0-images', { recursive: true })

const url = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/HEM%E1%84%91%E1%85%A1%E1%84%86%E1%85%A1_CI-1-fYz4G5Ld5rfaFhdppQPaawBcivPYA2.png'

const res = await fetch(url)
const arrayBuffer = await res.arrayBuffer()
const buffer = Buffer.from(arrayBuffer)

const meta = await sharp(buffer).metadata()
console.log('[v0] Image dimensions:', meta.width, 'x', meta.height)

const cropHeight = Math.floor(meta.height * 0.5)

const cropped = await sharp(buffer)
  .extract({ left: 0, top: 0, width: meta.width, height: cropHeight })
  .toBuffer()

writeFileSync('/tmp/v0-images/hem-pharma-logo.png', cropped)
console.log('[v0] Saved to /tmp/v0-images/hem-pharma-logo.png')
