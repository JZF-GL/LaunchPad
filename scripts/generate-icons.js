import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import toIco from 'to-ico'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// 创建 build 与 public 目录
const buildDir = path.join(rootDir, 'build')
const publicDir = path.join(rootDir, 'public')

if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true })
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })

// 512x512 精致极客暗色 + 渐变闪电 Logo SVG
const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#161B22" />
      <stop offset="100%" stop-color="#0D1117" />
    </linearGradient>
    <linearGradient id="zapGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="50%" stop-color="#6366F1" />
      <stop offset="100%" stop-color="#A855F7" />
    </linearGradient>
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.8" />
      <stop offset="50%" stop-color="#6366F1" stop-opacity="0.4" />
      <stop offset="100%" stop-color="#30363D" stop-opacity="0.2" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="20" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- 外层圆角矩形背景 -->
  <rect x="24" y="24" width="464" height="464" rx="100" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="8" />

  <!-- 内部光晕背景圆 -->
  <circle cx="256" cy="256" r="140" fill="#6366F1" opacity="0.15" filter="url(#glow)" />

  <!-- 极客闪电 Zap 图标 (居中强化设计) -->
  <path
    d="M 284 64 L 148 276 L 248 276 L 216 448 L 372 236 L 272 236 Z"
    fill="url(#zapGrad)"
    filter="url(#glow)"
    stroke="#FFFFFF"
    stroke-width="6"
    stroke-linejoin="round"
  />
</svg>
`

async function generate() {
  console.log('Generating LaunchPad application icons...')
  const svgBuffer = Buffer.from(svgIcon)

  // 1. 生成 512x512 PNG
  const png512 = await sharp(svgBuffer).resize(512, 512).png().toBuffer()
  const png256 = await sharp(svgBuffer).resize(256, 256).png().toBuffer()
  const png128 = await sharp(svgBuffer).resize(128, 128).png().toBuffer()
  const png64 = await sharp(svgBuffer).resize(64, 64).png().toBuffer()
  const png48 = await sharp(svgBuffer).resize(48, 48).png().toBuffer()
  const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer()
  const png16 = await sharp(svgBuffer).resize(16, 16).png().toBuffer()

  // 写入 build 目录和 public 目录
  fs.writeFileSync(path.join(buildDir, 'icon.png'), png512)
  fs.writeFileSync(path.join(publicDir, 'icon.png'), png512)
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgBuffer)

  // 2. 生成包含多尺寸的 Windows .ico 文件
  const icoBuffer = await toIco([png16, png32, png48, png64, png128, png256])
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer)
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer)
  fs.writeFileSync(path.join(publicDir, 'icon.ico'), icoBuffer)

  console.log('✅ Icons generated successfully in /build and /public!')
}

generate().catch(console.error)
