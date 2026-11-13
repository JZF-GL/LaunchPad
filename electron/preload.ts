import { contextBridge, ipcRenderer } from 'electron'
import {
  ProjectItem,
  RunningTask,
  PortConflictInfo,
  SystemEnvInfo,
  SystemMetrics,
  FloatingAnchor,
  FloatingModeState,
} from '../src/types'

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
  getSystemMetrics: (): Promise<SystemMetrics> => ipcRenderer.invoke('system:get-metrics'),

  // 自定义窗口控制
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: (): Promise<boolean> => ipcRenderer.invoke('window:maximize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),

  // 悬浮快捷方式模式
  enterFloatingMode: (state: FloatingModeState): Promise<boolean> => ipcRenderer.invoke('floating:enter', state),
  exitFloatingMode: (): Promise<boolean> => ipcRenderer.invoke('floating:exit'),
  getFloatingState: (): Promise<FloatingModeState | null> => ipcRenderer.invoke('floating:get-state'),
  /** 图标 / 面板鼠标进出，主进程据此展开或收起 */
  setFloatingHover: (source: 'icon' | 'panel', hovering: boolean): void =>
    ipcRenderer.send('floating:hover', source, hovering),
  /** 点击图标切换展开 / 收起 */
  toggleFloating: (): void => ipcRenderer.send('floating:toggle'),
  /** 面板已按锚点画好第一帧 */
  notifyPanelReady: (): void => ipcRenderer.send('floating:panel-ready'),
  /** 面板收回动画结束 */
  notifyPanelCollapsed: (): void => ipcRenderer.send('floating:panel-collapsed'),
  startFloatingDrag: (): void => ipcRenderer.send('floating:drag-start'),
  endFloatingDrag: (): void => ipcRenderer.send('floating:drag-end'),

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

  /** 主窗口监听悬浮模式切换结果 */
  onFloatingModeChange: (callback: (active: boolean) => void) => {
    const handler = (_: any, active: boolean) => callback(active)
    ipcRenderer.on('floating:mode-change', handler)
    return () => ipcRenderer.removeListener('floating:mode-change', handler)
  },

  /** 悬浮窗监听快捷方式数据更新 */
  onFloatingState: (callback: (state: FloatingModeState) => void) => {
    const handler = (_: any, state: FloatingModeState) => callback(state)
    ipcRenderer.on('floating:state', handler)
    return () => ipcRenderer.removeListener('floating:state', handler)
  },

  /** 面板窗口：主进程算好锚点，让面板按方向摆好布局 */
  onFloatingPanelExpand: (callback: (anchor: FloatingAnchor) => void) => {
    const handler = (_: any, anchor: FloatingAnchor) => callback(anchor)
    ipcRenderer.on('floating:panel-expand', handler)
    return () => ipcRenderer.removeListener('floating:panel-expand', handler)
  },

  /** 面板窗口：可以开始裁切揭示动画了 */
  onFloatingPanelReveal: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('floating:panel-reveal', handler)
    return () => ipcRenderer.removeListener('floating:panel-reveal', handler)
  },

  /** 面板窗口：开始收起动画 */
  onFloatingPanelCollapse: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('floating:panel-collapse', handler)
    return () => ipcRenderer.removeListener('floating:panel-collapse', handler)
  },

  /** 面板窗口：已被隐藏，可以清空内部状态 */
  onFloatingPanelReset: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('floating:panel-reset', handler)
    return () => ipcRenderer.removeListener('floating:panel-reset', handler)
  },
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
