import { app, BrowserWindow, ipcMain, dialog, shell, screen } from 'electron'
import path from 'node:path'
import os from 'node:os'
import { exec } from 'node:child_process'
import util from 'node:util'
import { scanProject } from './projectScanner'
import { processManager } from './processManager'
import { getProcessByPort, killPort } from './portManager'
import { FloatingAnchor, FloatingModeState, SystemEnvInfo, SystemMetrics } from '../src/types'

const execPromise = util.promisify(exec)

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null = null
const preload = path.join(__dirname, './preload.js')
const url = process.env.VITE_DEV_SERVER_URL

/* -------------------------------------------------------------------------- */
/*                            悬浮快捷方式窗口 (Floating)                       */
/* -------------------------------------------------------------------------- */

/** 悬浮图标尺寸（图标窗口永远保持这个尺寸，不做缩放） */
const FLOATING_ICON_SIZE = 72
/** 展开面板尺寸 */
const FLOATING_PANEL_WIDTH = 340
const FLOATING_PANEL_HEIGHT = 320
/** 鼠标离开图标/面板多久后收起 */
const FLOATING_COLLAPSE_DELAY = 260

/**
 * 悬浮模式使用两个窗口：
 * - floatingIconWin：72x72 图标窗口，收起/展开过程中尺寸和位置都不变
 * - floatingPanelWin：340x320 面板窗口，只在展开时显示
 *
 * 之前用同一个窗口在图标和面板之间 setBounds 缩放。Windows 上缩放透明窗口的
 * 那一两帧会先显示旧画面（图标跑到扩大后窗口的左上角）再重绘，看起来就是「闪一下」。
 * 拆成两个窗口后，展开/收起全程没有任何窗口缩放的可见过程：面板先在隐藏状态下
 * 摆好位置、渲染好第一帧，再显示出来，图标始终由图标窗口按原位绘制。
 */
let floatingIconWin: BrowserWindow | null = null
let floatingPanelWin: BrowserWindow | null = null
let floatingExpanded = false
/** 图标当前所在的屏幕矩形 */
let floatingIconBounds: Electron.Rectangle | null = null
/** 面板贴在图标哪一侧 */
let floatingAnchor: FloatingAnchor = { horizontal: 'right', vertical: 'top' }
/** 当前悬浮模式的快捷方式数据（悬浮窗挂载时可主动拉取） */
let floatingState: FloatingModeState | null = null

let dragTimer: NodeJS.Timeout | null = null
let collapseTimer: NodeJS.Timeout | null = null
let revealTimer: NodeJS.Timeout | null = null
let iconHovered = false
let panelHovered = false
/** 等面板渲染进程按锚点画好第一帧的回调 */
let panelReadyResolvers: Array<() => void> = []

const floatingWindowOptions: Electron.BrowserWindowConstructorOptions = {
  show: false,
  frame: false,
  transparent: true,
  backgroundColor: '#00000000',
  resizable: false,
  maximizable: false,
  minimizable: false,
  fullscreenable: false,
  hasShadow: false,
  skipTaskbar: true,
  alwaysOnTop: true,
  webPreferences: {
    preload,
    nodeIntegration: false,
    contextIsolation: true,
    // 面板窗口创建后一直隐藏，关闭后台节流它才能提前把第一帧画好
    backgroundThrottling: false,
  },
}

function loadFloatingPage(target: BrowserWindow, mode: 'icon' | 'panel') {
  if (url) {
    target.loadURL(`${url.replace(/\/+$/, '')}/floating.html?mode=${mode}`)
  } else {
    target.loadFile(path.join(process.env.DIST!, 'floating.html'), { query: { mode } })
  }
}

function createFloatingWindows(state: FloatingModeState) {
  floatingState = state

  const cursor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursor)
  const x = workArea.x + workArea.width - FLOATING_ICON_SIZE - 28
  const y = workArea.y + Math.round(workArea.height * 0.18)

  floatingExpanded = false
  floatingIconBounds = { x, y, width: FLOATING_ICON_SIZE, height: FLOATING_ICON_SIZE }
  floatingAnchor = computeAnchor(floatingIconBounds, workArea)

  // 面板窗口从进入悬浮模式起就一直显示（内容是透明的），只是鼠标穿透。
  // 这样它始终是「已显示」状态，展开时不需要 show/hide，也就不会因为窗口
  // 第一次显示要等合成器上屏而把 CSS 揭示动画的前几十毫秒吃掉。
  const panel = new BrowserWindow({
    ...floatingWindowOptions,
    width: FLOATING_PANEL_WIDTH,
    height: FLOATING_PANEL_HEIGHT,
    x: x + FLOATING_ICON_SIZE - FLOATING_PANEL_WIDTH,
    y,
    title: 'LaunchPad 快捷方式面板',
  })
  floatingPanelWin = panel
  panel.setAlwaysOnTop(true, 'screen-saver')
  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // 收起状态下整块面板都是透明的，必须让鼠标事件穿过去，否则会挡住桌面
  panel.setIgnoreMouseEvents(true)
  processManager.addWindow(panel)
  panel.webContents.on('did-finish-load', () => {
    if (floatingState && !panel.isDestroyed()) {
      panel.webContents.send('floating:state', floatingState)
    }
  })
  loadFloatingPage(panel, 'panel')
  panel.once('ready-to-show', () => {
    if (!panel.isDestroyed()) panel.showInactive()
  })
  panel.on('closed', () => {
    processManager.removeWindow(panel)
    if (floatingPanelWin === panel) floatingPanelWin = null
    clearFloatingTimers()
    panelReadyResolvers = []
  })

  const icon = new BrowserWindow({
    ...floatingWindowOptions,
    width: FLOATING_ICON_SIZE,
    height: FLOATING_ICON_SIZE,
    x,
    y,
    title: 'LaunchPad 悬浮图标',
  })
  floatingIconWin = icon
  icon.setAlwaysOnTop(true, 'screen-saver')
  icon.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  processManager.addWindow(icon)
  icon.webContents.on('did-finish-load', () => {
    if (floatingState && !icon.isDestroyed()) {
      icon.webContents.send('floating:state', floatingState)
    }
  })
  loadFloatingPage(icon, 'icon')
  icon.once('ready-to-show', () => {
    // 用 showInactive 避免抢走当前前台应用的焦点
    if (icon.isDestroyed()) return
    icon.showInactive()
    icon.moveTop()
  })
  icon.on('closed', () => {
    stopFloatingDrag()
    clearFloatingTimers()
    processManager.removeWindow(icon)
    if (floatingIconWin === icon) floatingIconWin = null
    if (floatingPanelWin && !floatingPanelWin.isDestroyed()) floatingPanelWin.close()
    floatingExpanded = false
    floatingIconBounds = null
    floatingAnchor = { horizontal: 'right', vertical: 'top' }
    floatingState = null
    if (win && !win.isDestroyed()) {
      if (!win.isVisible()) win.show()
      win.focus()
      win.webContents.send('floating:mode-change', false)
    }
  })
}

/**
 * 按图标当前位置决定展开方向：图标在哪半边屏幕，面板就朝另一边生长。
 * 图标靠左 → 贴面板左边（向右展开）；靠右 → 贴右边（向左展开）。
 */
function computeAnchor(
  icon: Electron.Rectangle,
  workArea: Electron.Rectangle
): FloatingAnchor {
  const centerX = icon.x + icon.width / 2
  const centerY = icon.y + icon.height / 2
  return {
    horizontal: centerX < workArea.x + workArea.width / 2 ? 'left' : 'right',
    vertical: centerY < workArea.y + workArea.height / 2 ? 'top' : 'bottom',
  }
}

/** 根据图标矩形 + 锚点计算展开后的窗口矩形（图标始终停在原屏幕位置） */
function getExpandedFloatingBounds(
  icon: Electron.Rectangle,
  anchor: FloatingAnchor
): Electron.Rectangle {
  const { workArea } = screen.getDisplayMatching(icon)
  const width = Math.min(FLOATING_PANEL_WIDTH, workArea.width)
  const height = Math.min(FLOATING_PANEL_HEIGHT, workArea.height)

  const rawX = anchor.horizontal === 'right' ? icon.x + icon.width - width : icon.x
  const rawY = anchor.vertical === 'bottom' ? icon.y + icon.height - height : icon.y

  return {
    x: Math.min(Math.max(rawX, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(rawY, workArea.y), workArea.y + workArea.height - height),
    width,
    height,
  }
}

function clearFloatingTimers() {
  if (collapseTimer) {
    clearTimeout(collapseTimer)
    collapseTimer = null
  }
  if (revealTimer) {
    clearTimeout(revealTimer)
    revealTimer = null
  }
}

/** 收起：面板窗口不隐藏，只清空内容并恢复鼠标穿透，图标窗口始终在原位 */
function hideFloatingPanel() {
  clearFloatingTimers()
  floatingExpanded = false
  panelHovered = false
  const panel = floatingPanelWin
  if (!panel || panel.isDestroyed()) return
  panel.setIgnoreMouseEvents(true)
  if (!panel.webContents.isDestroyed()) {
    panel.webContents.send('floating:panel-reset')
  }
}

function waitForPanelReady(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      const index = panelReadyResolvers.indexOf(finish)
      if (index >= 0) panelReadyResolvers.splice(index, 1)
      resolve()
    }
    panelReadyResolvers.push(finish)
    // 渲染进程异常时兜底，避免面板一直不显示
    setTimeout(finish, 300)
  })
}

/** 面板渲染进程画好第一帧 */
function resolvePanelReady() {
  const resolvers = panelReadyResolvers
  panelReadyResolvers = []
  resolvers.forEach((resolve) => resolve())
}

/**
 * 展开：面板窗口一直是显示状态（透明 + 鼠标穿透），这里只需要关掉穿透、
 * 按锚点摆好布局，然后直接跑裁切揭示动画。没有 show/hide，窗口也不缩放，
 * 所以既不会闪，也不会因为等待窗口上屏而把动画开头吞掉。
 */
function expandFloating() {
  const iconWin = floatingIconWin
  const panel = floatingPanelWin
  if (!iconWin || iconWin.isDestroyed() || !panel || panel.isDestroyed()) return
  if (dragTimer) return

  if (floatingExpanded) {
    // 收起动画还没结束又移回图标：让面板直接重新展开
    clearFloatingTimers()
    if (!panel.webContents.isDestroyed()) {
      panel.webContents.send('floating:panel-reveal')
    }
    return
  }

  const icon = floatingIconBounds ?? iconWin.getBounds()
  floatingIconBounds = icon
  const { workArea } = screen.getDisplayMatching(icon)
  floatingAnchor = computeAnchor(icon, workArea)
  floatingExpanded = true

  // 隐藏窗口设位置不会有任何可见过程；面板现在一直显示，所以移动也只是空窗口在动
  panel.setBounds(getExpandedFloatingBounds(icon, floatingAnchor))
  panel.setIgnoreMouseEvents(false)

  const ready = waitForPanelReady()
  panel.webContents.send('floating:panel-expand', floatingAnchor)

  ready.then(() => {
    if (!floatingExpanded || panel.isDestroyed()) return
    // 图标窗口压在面板上面，拖动和悬停仍然由图标窗口负责
    iconWin.moveTop()
    revealTimer = setTimeout(() => {
      revealTimer = null
      if (!floatingExpanded || floatingPanelWin !== panel || panel.isDestroyed()) return
      panel.webContents.send('floating:panel-reveal')
    }, 16)
  })
}

function collapseFloating(immediate = false) {
  if (!floatingExpanded) return
  clearFloatingTimers()

  const panel = floatingPanelWin
  if (immediate || !panel || panel.isDestroyed() || !panel.isVisible()) {
    hideFloatingPanel()
    return
  }

  // 面板自己做裁切收回动画，结束后通知主进程隐藏窗口
  panel.webContents.send('floating:panel-collapse')
  // 兜底：渲染进程异常时也要能收起来
  collapseTimer = setTimeout(hideFloatingPanel, 460)
}

/** 悬停状态汇总：图标和面板都移出后才收起 */
function setFloatingHover(source: 'icon' | 'panel', hovering: boolean) {
  if (source === 'icon') iconHovered = hovering
  else panelHovered = hovering

  if (iconHovered || panelHovered) {
    if (collapseTimer) {
      clearTimeout(collapseTimer)
      collapseTimer = null
    }
    if (iconHovered) expandFloating()
    return
  }
  if (!floatingExpanded || dragTimer) return
  if (collapseTimer) clearTimeout(collapseTimer)
  collapseTimer = setTimeout(() => {
    collapseTimer = null
    if (!iconHovered && !panelHovered && !dragTimer) collapseFloating()
  }, FLOATING_COLLAPSE_DELAY)
}

function toggleFloating() {
  if (floatingExpanded) collapseFloating()
  else expandFloating()
}

/** 拖拽：主进程按帧跟随鼠标移动图标窗口，避免 renderer 跨窗口取坐标 */
function startFloatingDrag() {
  const iconWin = floatingIconWin
  if (!iconWin || iconWin.isDestroyed()) return

  stopFloatingDrag()
  clearFloatingTimers()
  iconHovered = false
  panelHovered = false
  // 展开状态开始拖动：瞬间收起面板（此时面板只剩图标区域，隐藏无视觉差异）
  if (floatingExpanded) collapseFloating(true)

  const cursor = screen.getCursorScreenPoint()
  const icon = floatingIconBounds ?? iconWin.getBounds()
  const offsetX = cursor.x - icon.x
  const offsetY = cursor.y - icon.y
  const size = FLOATING_ICON_SIZE

  dragTimer = setInterval(() => {
    if (!floatingIconWin || floatingIconWin.isDestroyed()) {
      stopFloatingDrag()
      return
    }
    const point = screen.getCursorScreenPoint()
    const { workArea } = screen.getDisplayNearestPoint(point)
    const x = Math.round(
      Math.min(Math.max(point.x - offsetX, workArea.x), workArea.x + workArea.width - size)
    )
    const y = Math.round(
      Math.min(Math.max(point.y - offsetY, workArea.y), workArea.y + workArea.height - size)
    )
    floatingIconWin.setBounds({ x, y, width: size, height: size })
    // 同步记录图标位置，拖动过程中就展开也能拿到正确的锚点
    floatingIconBounds = { x, y, width: size, height: size }
  }, 16)
}

function stopFloatingDrag() {
  if (!dragTimer) return
  clearInterval(dragTimer)
  dragTimer = null

  const iconWin = floatingIconWin
  if (!iconWin || iconWin.isDestroyed()) return

  // 记住拖动后的图标位置，并按新位置更新展开方向
  const icon = iconWin.getBounds()
  floatingIconBounds = icon
  floatingExpanded = false
  floatingAnchor = computeAnchor(icon, screen.getDisplayMatching(icon).workArea)
}

function exitFloatingMode() {
  clearFloatingTimers()
  stopFloatingDrag()
  floatingExpanded = false

  const panel = floatingPanelWin
  if (panel && !panel.isDestroyed()) panel.close()

  const iconWin = floatingIconWin
  if (!iconWin || iconWin.isDestroyed()) {
    floatingIconWin = null
    return
  }
  iconWin.close()
}

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
    if (floatingIconWin) {
      floatingIconWin.showInactive()
      return
    }
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
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

  /* -------------------- 悬浮快捷方式模式 -------------------- */

  // 进入悬浮模式：隐藏主窗口（任务栏图标一并收起），显示悬浮图标
  ipcMain.handle('floating:enter', async (_, state: FloatingModeState) => {
    if (!win) return false
    if (!floatingIconWin) {
      createFloatingWindows(state)
    } else {
      floatingState = state
      const targets = [floatingIconWin, floatingPanelWin]
      for (const target of targets) {
        if (target && !target.isDestroyed()) {
          target.webContents.send('floating:state', state)
        }
      }
    }
    win.webContents.send('floating:mode-change', true)
    win.hide()
    return true
  })

  // 退出悬浮模式：关闭悬浮窗，恢复主窗口
  ipcMain.handle('floating:exit', async () => {
    exitFloatingMode()
    return true
  })

  // 悬浮窗当前数据（悬浮窗渲染进程挂载时主动拉取，避免错过事件）
  ipcMain.handle('floating:get-state', async () => {
    return floatingState
  })

  // 图标 / 面板的鼠标进出，主进程据此展开或收起
  ipcMain.on('floating:hover', (_, source: 'icon' | 'panel', hovering: boolean) => {
    setFloatingHover(source, hovering)
  })

  // 点击图标（未发生拖动）时切换展开 / 收起
  ipcMain.on('floating:toggle', () => {
    toggleFloating()
  })

  // 面板渲染进程已按锚点画好第一帧
  ipcMain.on('floating:panel-ready', () => {
    resolvePanelReady()
  })

  // 面板收回动画结束
  ipcMain.on('floating:panel-collapsed', () => {
    hideFloatingPanel()
  })

  // 悬浮图标拖拽（主进程按帧跟随鼠标）
  ipcMain.on('floating:drag-start', () => {
    startFloatingDrag()
  })

  ipcMain.on('floating:drag-end', () => {
    stopFloatingDrag()
  })
}
