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
