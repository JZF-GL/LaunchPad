import fs from 'node:fs'
import path from 'node:path'
import { ProjectItem } from '../src/types'

export function scanProject(folderPath: string): ProjectItem {
  const packageJsonPath = path.join(folderPath, 'package.json')
  const folderName = path.basename(folderPath)

  if (!fs.existsSync(packageJsonPath)) {
    return {
      id: Buffer.from(folderPath).toString('base64'),
      name: folderName,
      path: folderPath,
      packageJsonExists: false,
      scripts: {},
      packageManager: 'npm',
      frameworks: [],
      createdAt: Date.now(),
    }
  }

  let pkg: any = {}
  try {
    const content = fs.readFileSync(packageJsonPath, 'utf-8')
    pkg = JSON.parse(content)
  } catch (e) {
    console.error('Failed to parse package.json', e)
  }

  // 检测包管理器
  let packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' = 'npm'
  if (fs.existsSync(path.join(folderPath, 'pnpm-lock.yaml'))) {
    packageManager = 'pnpm'
  } else if (fs.existsSync(path.join(folderPath, 'yarn.lock'))) {
    packageManager = 'yarn'
  } else if (fs.existsSync(path.join(folderPath, 'bun.lockb')) || fs.existsSync(path.join(folderPath, 'bun.lock'))) {
    packageManager = 'bun'
  } else if (fs.existsSync(path.join(folderPath, 'package-lock.json'))) {
    packageManager = 'npm'
  } else if (pkg.packageManager) {
    if (pkg.packageManager.includes('pnpm')) packageManager = 'pnpm'
    else if (pkg.packageManager.includes('yarn')) packageManager = 'yarn'
    else if (pkg.packageManager.includes('bun')) packageManager = 'bun'
  }

  // 识别框架与工具链
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  }

  const frameworks: string[] = []
  if (allDeps['next']) frameworks.push('Next.js')
  if (allDeps['nuxt'] || allDeps['nuxt3']) frameworks.push('Nuxt')
  if (allDeps['react'] && !frameworks.includes('Next.js')) frameworks.push('React')
  if (allDeps['vue'] && !frameworks.includes('Nuxt')) frameworks.push('Vue')
  if (allDeps['svelte'] || allDeps['@sveltejs/kit']) frameworks.push('Svelte')
  if (allDeps['astro']) frameworks.push('Astro')
  if (allDeps['@angular/core']) frameworks.push('Angular')
  if (allDeps['vite']) frameworks.push('Vite')
  if (allDeps['webpack']) frameworks.push('Webpack')
  if (allDeps['tailwindcss']) frameworks.push('TailwindCSS')
  if (allDeps['typescript'] || fs.existsSync(path.join(folderPath, 'tsconfig.json'))) frameworks.push('TypeScript')
  if (allDeps['electron']) frameworks.push('Electron')

  return {
    id: Buffer.from(folderPath).toString('base64'),
    name: pkg.name || folderName,
    path: folderPath,
    packageJsonExists: true,
    scripts: pkg.scripts || {},
    packageManager,
    frameworks,
    createdAt: Date.now(),
  }
}
