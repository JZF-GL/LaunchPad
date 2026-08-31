import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

const DIST_ELECTRON = path.resolve(__dirname, 'dist-electron')

/**
 * 强制 Electron 主进程 / preload 以 CommonJS 输出。
 *
 * 原因：package.json 中声明了 `"type": "module"`，vite-plugin-electron 会据此把主进程
 * 打包成 ESM，而 Electron 33(内置 Node 20.18.3) 在 ESM 里加载 CJS 的 `electron` 模块时
 * 会在 CJS→ESM 转译阶段崩溃：
 *   TypeError: Cannot read properties of undefined (reading 'exports')
 *     at cjsPreparseModuleExports (node:internal/modules/esm/translators:379:81)
 * 另外 electron/main.ts 使用了 `__dirname`，该变量在 ESM 下同样不存在。
 */
function electronCjsOutput(): Plugin {
  return {
    name: 'launchpad:electron-cjs-output',
    config(config) {
      const lib = config.build?.lib as
        | { formats?: string[]; entry?: unknown; fileName?: unknown }
        | undefined
      if (lib && !Array.isArray(lib) && Array.isArray(lib.formats)) {
        lib.formats = ['cjs']
      }
    },
    buildStart() {
      // 让 dist-electron 目录下的 .js 按 CommonJS 解析，而不是跟随根目录的 "type": "module"
      fs.mkdirSync(DIST_ELECTRON, { recursive: true })
      fs.writeFileSync(
        path.join(DIST_ELECTRON, 'package.json'),
        JSON.stringify({ type: 'commonjs' }, null, 2) + '\n'
      )
    },
  }
}

const electronCjs = electronCjsOutput()

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    electron([
      {
        // Main-Process entry file of the Electron App.
        entry: 'electron/main.ts',
        vite: {
          plugins: [electronCjs],
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['tree-kill'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete, 
          // instead of restarting the entire Electron App.
          options.reload()
        },
        vite: {
          plugins: [electronCjs],
          build: {
            outDir: 'dist-electron',
          },
        },
      },
    ]),
    renderer(),
  ],
})
