export interface ProjectItem {
  id: string
  name: string
  path: string
  packageJsonExists: boolean
  scripts: Record<string, string>
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun'
  frameworks: string[]
  createdAt: number
}

/**
 * 快捷方式（悬浮窗中的一个快捷按钮）
 * 由某个项目的某个 script 生成，保存项目快照以便悬浮窗独立运行
 */
export interface ShortcutItem {
  id: string // `${projectId}::${scriptName}`
  projectId: string
  projectName: string
  projectPath: string
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun'
  scriptName: string
  customArgs?: string
  createdAt: number
}

/** 进入悬浮窗模式时从主窗口同步给悬浮窗的数据 */
export interface FloatingModeState {
  shortcuts: ShortcutItem[]
  currentProjectId: string | null
  currentProjectName?: string
}

/**
 * 悬浮图标的锚点：展开时图标固定在展开面板的哪个角，
 * 面板朝锚点的反方向生长。
 */
export interface FloatingAnchor {
  horizontal: 'left' | 'right'
  vertical: 'top' | 'bottom'
}

export interface RunningTask {
  taskId: string // `${projectId}::${scriptName}`
  projectId: string
  scriptName: string
  command: string
  pid?: number
  startTime: number
  status: 'running' | 'stopping' | 'stopped' | 'error'
  exitCode?: number | null
  memoryUsage?: number // 进程树占用物理内存 (bytes)
}

export interface PortConflictInfo {
  taskId: string
  projectId: string
  scriptName: string
  port: number
  pid?: number
  processName?: string
  message: string
}

export interface SystemEnvInfo {
  nodeVersion: string
  pnpmVersion?: string
  npmVersion?: string
  yarnVersion?: string
  bunVersion?: string
  platform: string
}

export interface SystemMetrics {
  appMemory: {
    rss: number
    heapUsed: number
    heapTotal: number
  }
  systemMemory: {
    total: number
    free: number
    used: number
    usagePercent: number
  }
  cpu: {
    model: string
    cores: number
    usagePercent: number
    arch: string
  }
}
