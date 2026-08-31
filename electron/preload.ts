import { contextBridge, ipcRenderer } from 'electron'
import { ProjectItem, RunningTask, PortConflictInfo, SystemEnvInfo } from '../src/types'

const api = {
  // 对话框与扫描
  openDirectoryDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-directory'),
  scanProject: (folderPath: string): Promise<ProjectItem> => ipcRenderer.invoke('project:scan', folderPath),

  // 脚本控制
  runScript: (args: {
    projectId: string
    scriptName: string
    projectPath: string
    packageManager: string
    customArgs?: string
  }): Promise<{ success: boolean; taskId: string; message?: string }> => ipcRenderer.invoke('script:run', args),

  stopScript: (taskId: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('script:stop', taskId),
  getRunningTasks: (): Promise<RunningTask[]> => ipcRenderer.invoke('script:get-running-tasks'),
  getTaskLogs: (taskId: string): Promise<string[]> => ipcRenderer.invoke('script:get-task-logs', taskId),

  // 端口管理
  getProcessByPort: (port: number) => ipcRenderer.invoke('port:get-process', port),
  killPort: (port: number): Promise<{ success: boolean; pid?: number; message?: string }> => ipcRenderer.invoke('port:kill', port),

  // 系统与外部工具
  openPath: (folderPath: string) => ipcRenderer.invoke('shell:open-path', folderPath),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  openVSCode: (folderPath: string): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('shell:open-vscode', folderPath),
  getSystemEnv: (): Promise<SystemEnvInfo> => ipcRenderer.invoke('system:get-env'),

  // 自定义窗口控制
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: (): Promise<boolean> => ipcRenderer.invoke('window:maximize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),

  // 监听事件
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
    const handler = (_: any, isMaximized: boolean) => callback(isMaximized)
    ipcRenderer.on('window:maximized', handler)
    return () => ipcRenderer.removeListener('window:maximized', handler)
  },

  onTerminalData: (callback: (payload: { taskId: string; data: string }) => void) => {
    const handler = (_: any, payload: { taskId: string; data: string }) => callback(payload)
    ipcRenderer.on('terminal:data', handler)
    return () => ipcRenderer.removeListener('terminal:data', handler)
  },

  onTaskStatusChange: (callback: (task: RunningTask) => void) => {
    const handler = (_: any, task: RunningTask) => callback(task)
    ipcRenderer.on('task:status-change', handler)
    return () => ipcRenderer.removeListener('task:status-change', handler)
  },

  onPortConflict: (callback: (conflict: PortConflictInfo) => void) => {
    const handler = (_: any, conflict: PortConflictInfo) => callback(conflict)
    ipcRenderer.on('port:conflict', handler)
    return () => ipcRenderer.removeListener('port:conflict', handler)
  },
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
