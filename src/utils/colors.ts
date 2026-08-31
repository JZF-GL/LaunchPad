export function getFrameworkBadgeClass(framework: string): string {
  switch (framework.toLowerCase()) {
    case 'react':
      return 'bg-cyan-950/60 text-cyan-400 border-cyan-800/50'
    case 'vue':
      return 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
    case 'vite':
      return 'bg-purple-950/60 text-purple-400 border-purple-800/50'
    case 'next.js':
      return 'bg-zinc-800/80 text-zinc-200 border-zinc-700'
    case 'nuxt':
      return 'bg-green-950/60 text-green-400 border-green-800/50'
    case 'svelte':
      return 'bg-orange-950/60 text-orange-400 border-orange-800/50'
    case 'astro':
      return 'bg-rose-950/60 text-rose-400 border-rose-800/50'
    case 'tailwindcss':
      return 'bg-sky-950/60 text-sky-400 border-sky-800/50'
    case 'typescript':
      return 'bg-blue-950/60 text-blue-400 border-blue-800/50'
    case 'electron':
      return 'bg-teal-950/60 text-teal-300 border-teal-800/50'
    default:
      return 'bg-dark-700/60 text-dark-300 border-dark-600'
  }
}

export function getScriptIconType(scriptName: string) {
  const name = scriptName.toLowerCase()
  if (name.includes('dev') || name.includes('start') || name.includes('serve')) return 'play'
  if (name.includes('build')) return 'build'
  if (name.includes('test')) return 'test'
  if (name.includes('lint') || name.includes('format')) return 'lint'
  if (name.includes('preview')) return 'preview'
  return 'default'
}
