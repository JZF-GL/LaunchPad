import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import os from 'node:os'
import { exec } from 'node:child_process'
import util from 'node:util'
import { scanProject } from './projectScanner'
import { processManager } from './processManager'
import { getProcessByPort, killPort } from './portManager'
import { SystemEnvInfo, SystemMetrics } from '../src/types'

const execPromise = util.promisify(exec)

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null = null
const preload = path.join(__dirname, './preload.js')
const url = process.env.VITE_DEV_SERVER_URL

function createWindow() {
  const iconPath = process.platform === 'win32'
    ? path.join(app.getAppPath(), 'build/icon.ico')
    : path.join(app.getAppPath(), 'build/icon.png')

  win = new BrowserWindow({
    title: 'LaunchPad - Frontend Project Runner',
    icon: iconPath,
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    frame: false, // 禁用系统默认外边框与标题栏
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // 绑定 Window 到进程管理器用于推送终端输出与状态
  processManager.setWindow(win)

  // 监听窗口最大化与还原事件
  win.on('maximize', () => {
    win?.webContents.send('window:maximized', true)
  })

  win.on('unmaximize', () => {
    win?.webContents.send('window:maximized', false)
  })

  if (url) {
    win.loadURL(url)
  } else {
    win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  // 窗口关闭时终止所有后台任务
  win.on('close', async () => {
    await processManager.stopAll()
  })
}

// 单实例锁定：防止重复打开多个应用窗口
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    setupIpcHandlers()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', async () => {
  await processManager.stopAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function setupIpcHandlers() {
  // 打开目录选择器
  ipcMain.handle('dialog:open-directory', async () => {
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '选择前端项目根目录',
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })

  // 扫描项目
  ipcMain.handle('project:scan', async (_, folderPath: string) => {
    return scanProject(folderPath)
  })

  // 运行脚本
  ipcMain.handle('script:run', async (_, args: {
    projectId: string
    scriptName: string
    projectPath: string
    packageManager: string
    customArgs?: string
  }) => {
    return processManager.runScript(
      args.projectId,
      args.scriptName,
      args.projectPath,
      args.packageManager,
      args.customArgs
    )
  })

  // 停止脚本
  ipcMain.handle('script:stop', async (_, taskId: string) => {
    return processManager.stopScript(taskId)
  })

  // 获取所有运行中任务 (包含实时进程内存)
  ipcMain.handle('script:get-running-tasks', async () => {
    return processManager.getRunningTasksWithMemory()
  })

  // 获取任务的历史日志
  ipcMain.handle('script:get-task-logs', async (_, taskId: string) => {
    return processManager.getTaskLogs(taskId)
  })

  // 端口检查
  ipcMain.handle('port:get-process', async (_, port: number) => {
    return getProcessByPort(port)
  })

  // 端口清理 / 强制杀掉占用进程
  ipcMain.handle('port:kill', async (_, port: number) => {
    return killPort(port)
  })

  // 在系统文件管理器中打开
  ipcMain.handle('shell:open-path', async (_, folderPath: string) => {
    return shell.openPath(folderPath)
  })

  // 打开外部链接
  ipcMain.handle('shell:open-external', async (_, targetUrl: string) => {
    return shell.openExternal(targetUrl)
  })

  // 在 VSCode 中打开
  ipcMain.handle('shell:open-vscode', async (_, folderPath: string) => {
    try {
      await execPromise(`code "${folderPath}"`)
      return { success: true }
    } catch (e: any) {
      return { success: false, message: e.message }
    }
  })

  // 获取系统环境版本
  ipcMain.handle('system:get-env', async (): Promise<SystemEnvInfo> => {
    const info: SystemEnvInfo = {
      nodeVersion: process.version,
      platform: process.platform,
    }

    try {
      const { stdout: pnpmV } = await execPromise('pnpm -v')
      info.pnpmVersion = pnpmV.trim()
    } catch {}

    try {
      const { stdout: npmV } = await execPromise('npm -v')
      info.npmVersion = npmV.trim()
    } catch {}

    try {
      const { stdout: yarnV } = await execPromise('yarn -v')
      info.yarnVersion = yarnV.trim()
    } catch {}

    try {
      const { stdout: bunV } = await execPromise('bun -v')
      info.bunVersion = bunV.trim()
    } catch {}

    return info
  })

  // 获取实时硬件与应用指标
  let prevCpuTimes: { idle: number; total: number } | null = null

  function getCpuUsage(): number {
    const cpus = os.cpus()
    let idle = 0
    let total = 0

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += (cpu.times as any)[type]
      }
      idle += cpu.times.idle
    }

    if (!prevCpuTimes) {
      prevCpuTimes = { idle, total }
      return 0
    }

    const idleDiff = idle - prevCpuTimes.idle
    const totalDiff = total - prevCpuTimes.total
    prevCpuTimes = { idle, total }

    if (totalDiff <= 0) return 0
    const usage = Math.round((1 - idleDiff / totalDiff) * 100)
    return Math.max(0, Math.min(100, usage))
  }

  ipcMain.handle('system:get-metrics', async (): Promise<SystemMetrics> => {
    const memUsage = process.memoryUsage()
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const memPercent = Math.round((usedMem / totalMem) * 100)

    const cpus = os.cpus()
    const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU'
    const cpuPercent = getCpuUsage()

    return {
      appMemory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
      },
      systemMemory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercent: memPercent,
      },
      cpu: {
        model: cpuModel,
        cores: cpus.length,
        usagePercent: cpuPercent,
        arch: os.arch(),
      },
    }
  })

  // 自定义窗口控制
  ipcMain.handle('window:minimize', () => {
    win?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    } else {
      win.maximize()
      return true
    }
  })

  ipcMain.handle('window:close', () => {
    win?.close()
  })

  ipcMain.handle('window:is-maximized', () => {
    return win?.isMaximized() ?? false
  })
}
