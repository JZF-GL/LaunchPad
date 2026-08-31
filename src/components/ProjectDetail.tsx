import React, { useState } from 'react'
import {
  Play,
  Square,
  RotateCw,
  FolderOpen,
  Code2,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Settings2,
  CheckCircle2,
  AlertTriangle,
  LayoutGrid,
  Zap,
} from 'lucide-react'
import { ProjectItem, RunningTask } from '../types'
import { getFrameworkBadgeClass } from '../utils/colors'

interface ProjectDetailProps {
  project: ProjectItem
  runningTasks: RunningTask[]
  onRunScript: (scriptName: string, customArgs?: string) => void
  onStopScript: (taskId: string) => void
  onRefreshProject: () => void
  onOpenFolder: (path: string) => void
  onOpenVSCode: (path: string) => void
  onChangePackageManager: (pm: 'pnpm' | 'npm' | 'yarn' | 'bun') => void
  onKillPort: (port: number) => Promise<{ success: boolean; message?: string }>
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({
  project,
  runningTasks,
  onRunScript,
  onStopScript,
  onRefreshProject,
  onOpenFolder,
  onOpenVSCode,
  onChangePackageManager,
  onKillPort,
}) => {
  const [quickPort, setQuickPort] = useState('')
  const [portMessage, setPortMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [portLoading, setPortLoading] = useState(false)
  const [expandedCustomArgs, setExpandedCustomArgs] = useState<string | null>(null)
  const [customArgsMap, setCustomArgsMap] = useState<Record<string, string>>({})
  const [viewMode, setViewMode] = useState<'standard' | 'simple'>(() => {
    try {
      const saved = localStorage.getItem('launchpad_scripts_view_mode')
      if (saved === 'simple' || saved === 'standard') return saved
    } catch {}
    return 'standard'
  })

  const handleToggleViewMode = (mode: 'standard' | 'simple') => {
    setViewMode(mode)
    try {
      localStorage.setItem('launchpad_scripts_view_mode', mode)
    } catch {}
  }

  const scripts = Object.entries(project.scripts || {})

  const getScriptTask = (scriptName: string) => {
    const taskId = `${project.id}::${scriptName}`
    return runningTasks.find((t) => t.taskId === taskId)
  }

  const handleManualKillPort = async () => {
    const port = parseInt(quickPort, 10)
    if (!port || isNaN(port)) {
      setPortMessage({ text: '请输入合法的端口号 (1-65535)', isError: true })
      return
    }

    setPortLoading(true)
    setPortMessage(null)
    try {
      const res = await onKillPort(port)
      setPortMessage({
        text: res.message || (res.success ? `端口 ${port} 释放成功` : `未能释放端口 ${port}`),
        isError: !res.success,
      })
    } catch (e: any) {
      setPortMessage({ text: e.message || '释放失败', isError: true })
    } finally {
      setPortLoading(false)
    }
  }

  return (
    <div className="flex flex-col bg-dark-900 p-4 space-y-4">
      {/* 顶部项目概览 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-dark-100 flex items-center gap-2">
              {project.name}
            </h2>
            <div className="flex items-center gap-1.5">
              {project.frameworks.map((fw) => (
                <span
                  key={fw}
                  className={`text-[10px] px-2 py-0.5 rounded font-mono border ${getFrameworkBadgeClass(
                    fw
                  )}`}
                >
                  {fw}
                </span>
              ))}
            </div>
          </div>
          <div className="text-xs text-dark-400 font-mono mt-1 flex items-center gap-2">
            <span>{project.path}</span>
          </div>
        </div>

        {/* 顶部快捷操作 */}
        <div className="flex items-center gap-2">
          {/* 包管理器切换 */}
          <div className="flex items-center bg-dark-950 border border-dark-600 rounded-md px-2 py-1 text-xs">
            <span className="text-dark-400 mr-1.5">包管理:</span>
            <select
              value={project.packageManager}
              onChange={(e) => onChangePackageManager(e.target.value as any)}
              className="bg-transparent text-dark-200 focus:outline-none cursor-pointer font-mono font-medium"
            >
              <option value="pnpm" className="bg-dark-900 text-dark-100">pnpm</option>
              <option value="npm" className="bg-dark-900 text-dark-100">npm</option>
              <option value="yarn" className="bg-dark-900 text-dark-100">yarn</option>
              <option value="bun" className="bg-dark-900 text-dark-100">bun</option>
            </select>
          </div>

          <button
            onClick={() => onOpenFolder(project.path)}
            title="在文件管理器中打开"
            className="p-1.5 rounded-md bg-dark-800 hover:bg-dark-700 text-dark-300 border border-dark-600 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            onClick={() => onOpenVSCode(project.path)}
            title="在 VSCode 中打开"
            className="p-1.5 rounded-md bg-dark-800 hover:bg-dark-700 text-dark-300 border border-dark-600 transition-colors"
          >
            <Code2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRefreshProject}
            title="重新扫描 package.json"
            className="p-1.5 rounded-md bg-dark-800 hover:bg-dark-700 text-dark-300 border border-dark-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 端口清理辅助栏 */}
      <div className="flex flex-wrap items-center justify-between bg-dark-950/80 border border-dark-600/50 rounded-lg p-2.5 px-3 text-xs gap-2">
        <div className="flex items-center gap-2 text-dark-300">
          <ShieldAlert className="w-4 h-4 text-accent-amber" />
          <span className="font-medium text-dark-200">端口占用清理工具:</span>
          <span className="text-[11px] text-dark-400">
            遇到端口冲突时可在此一键释放残留进程
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-dark-400 font-mono">Port:</span>
            <input
              type="number"
              placeholder="如 3000 / 5173"
              value={quickPort}
              onChange={(e) => setQuickPort(e.target.value)}
              className="w-28 bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-dark-100 font-mono focus:outline-none focus:border-accent-blue"
            />
          </div>
          <button
            onClick={handleManualKillPort}
            disabled={portLoading || !quickPort}
            className="px-2.5 py-1 rounded bg-dark-800 hover:bg-rose-900/60 hover:text-rose-300 hover:border-rose-700 text-dark-200 border border-dark-600 text-xs font-medium transition-all disabled:opacity-50"
          >
            {portLoading ? '清理中...' : '释放该端口'}
          </button>
        </div>

        {portMessage && (
          <div
            className={`w-full text-xs px-2.5 py-1 rounded mt-1 flex items-center gap-1.5 ${
              portMessage.isError
                ? 'bg-rose-950/70 border border-rose-800/80 text-rose-300'
                : 'bg-emerald-950/70 border border-emerald-800/80 text-emerald-300'
            }`}
          >
            {portMessage.isError ? (
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            )}
            <span>{portMessage.text}</span>
          </div>
        )}
      </div>

      {/* package.json Scripts 指令区 */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold text-dark-300 tracking-wider uppercase flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-accent-blue" />
            package.json 运行指令 ({scripts.length})
          </span>

          <div className="flex items-center gap-2.5">
            {!project.packageJsonExists && (
              <span className="text-xs text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                未找到 package.json 文件
              </span>
            )}

            {/* 模式切换器 */}
            <div className="flex items-center bg-dark-950 border border-dark-600 rounded-md p-0.5 text-xs">
              <button
                onClick={() => handleToggleViewMode('standard')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all text-xs font-medium ${
                  viewMode === 'standard'
                    ? 'bg-dark-750 text-dark-100 shadow-sm border border-dark-600/60'
                    : 'text-dark-400 hover:text-dark-200'
                }`}
                title="标准模式：显示命令详情与参数配置"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>标准</span>
              </button>
              <button
                onClick={() => handleToggleViewMode('simple')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all text-xs font-medium ${
                  viewMode === 'simple'
                    ? 'bg-dark-750 text-dark-100 shadow-sm border border-dark-600/60'
                    : 'text-dark-400 hover:text-dark-200'
                }`}
                title="简易模式：仅显示指令名称和运行按钮"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>简易</span>
              </button>
            </div>
          </div>
        </div>

        {scripts.length === 0 ? (
          <div className="text-xs text-dark-500 py-4 text-center border border-dashed border-dark-600/60 rounded-lg">
            该项目中没有配置任何 npm scripts
          </div>
        ) : viewMode === 'simple' ? (
          /* 简易模式：只显示名称和运行/停止按钮 */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {scripts.map(([scriptName]) => {
              const task = getScriptTask(scriptName)
              const isRunning = task?.status === 'running'
              const isStopping = task?.status === 'stopping'
              const isCommonDev = ['dev', 'start', 'serve'].includes(scriptName.toLowerCase())

              return (
                <div
                  key={scriptName}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${
                    isRunning
                      ? 'bg-dark-800/90 border-accent-green/60 shadow-sm shadow-accent-green/5'
                      : isCommonDev
                      ? 'bg-dark-850 border-dark-600/80 hover:border-dark-500'
                      : 'bg-dark-900 border-dark-600/50 hover:border-dark-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 mr-2">
                    {isRunning && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse-glow flex-shrink-0" />
                    )}
                    <span
                      className={`text-xs font-bold font-mono truncate ${
                        isRunning ? 'text-accent-green' : 'text-dark-100'
                      }`}
                      title={scriptName}
                    >
                      {scriptName}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isRunning ? (
                      <>
                        <button
                          onClick={() => onRunScript(scriptName, customArgsMap[scriptName])}
                          title="重启"
                          className="p-1 rounded bg-dark-700 hover:bg-dark-600 text-dark-200 transition-colors"
                        >
                          <RotateCw className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onStopScript(task.taskId)}
                          disabled={isStopping}
                          title="停止"
                          className="flex items-center gap-1 px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                          <Square className="w-2.5 h-2.5 fill-current" />
                          {isStopping ? '停止中' : '停止'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onRunScript(scriptName, customArgsMap[scriptName])}
                        title={`运行 ${scriptName}`}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all active:scale-[0.98] ${
                          isCommonDev
                            ? 'bg-accent-green hover:bg-emerald-600 text-dark-950 shadow-sm shadow-accent-green/20'
                            : 'bg-dark-750 hover:bg-dark-700 text-dark-100 border border-dark-600'
                        }`}
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        运行
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* 标准详细模式 */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {scripts.map(([scriptName, command]) => {
              const task = getScriptTask(scriptName)
              const isRunning = task?.status === 'running'
              const isStopping = task?.status === 'stopping'
              const isCommonDev = ['dev', 'start', 'serve'].includes(scriptName.toLowerCase())

              return (
                <div
                  key={scriptName}
                  className={`relative flex flex-col justify-between p-3 rounded-lg border transition-all ${
                    isRunning
                      ? 'bg-dark-800/90 border-accent-green/60 shadow-lg shadow-accent-green/5'
                      : isCommonDev
                      ? 'bg-dark-850 border-dark-600/80 hover:border-dark-500'
                      : 'bg-dark-900 border-dark-600/50 hover:border-dark-600'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold font-mono ${
                          isRunning ? 'text-accent-green' : 'text-dark-100'
                        }`}
                      >
                        {scriptName}
                      </span>
                      {isCommonDev && !isRunning && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                          Dev
                        </span>
                      )}
                    </div>

                    {/* 运行状态提示 */}
                    {isRunning && (
                      <span className="flex items-center gap-1 text-[10px] text-accent-green font-mono">
                        <span className="animate-pulse-glow w-1.5 h-1.5 rounded-full bg-accent-green"></span>
                        运行中 (PID: {task.pid})
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-dark-400 font-mono truncate mb-3 bg-dark-950 px-2 py-1 rounded border border-dark-700/50" title={command}>
                    {command}
                  </div>

                  {/* 自定义参数输入 (可选展开) */}
                  {expandedCustomArgs === scriptName && (
                    <div className="mb-2">
                      <input
                        type="text"
                        placeholder="追加参数，例如: --port 8080"
                        value={customArgsMap[scriptName] || ''}
                        onChange={(e) =>
                          setCustomArgsMap({
                            ...customArgsMap,
                            [scriptName]: e.target.value,
                          })
                        }
                        className="w-full bg-dark-950 border border-dark-600 rounded px-2 py-1 text-xs text-dark-200 font-mono focus:outline-none focus:border-accent-blue"
                      />
                    </div>
                  )}

                  {/* 操作按钮组 */}
                  <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                    <button
                      onClick={() =>
                        setExpandedCustomArgs(
                          expandedCustomArgs === scriptName ? null : scriptName
                        )
                      }
                      title="自定义启动参数"
                      className="p-1 rounded text-dark-400 hover:text-dark-200 hover:bg-dark-700 transition-colors"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      {isRunning ? (
                        <>
                          {/* 重启按钮 */}
                          <button
                            onClick={() =>
                              onRunScript(scriptName, customArgsMap[scriptName])
                            }
                            title="重新启动"
                            className="flex items-center gap-1 px-2 py-1 rounded bg-dark-700 hover:bg-dark-600 text-dark-200 text-xs font-medium transition-colors"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            重启
                          </button>

                          {/* 停止按钮 (高亮核心功能) */}
                          <button
                            onClick={() => onStopScript(task.taskId)}
                            disabled={isStopping}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-md shadow-rose-900/30 transition-all active:scale-[0.98] disabled:opacity-50"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            {isStopping ? '终止中...' : '停止运行'}
                          </button>
                        </>
                      ) : (
                        /* 启动运行按钮 */
                        <button
                          onClick={() =>
                            onRunScript(scriptName, customArgsMap[scriptName])
                          }
                          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all active:scale-[0.98] ${
                            isCommonDev
                              ? 'bg-accent-green hover:bg-emerald-600 text-dark-950 shadow-md shadow-accent-green/20'
                              : 'bg-dark-750 hover:bg-dark-700 text-dark-100 border border-dark-600'
                          }`}
                        >
                          <Play className="w-3 h-3 fill-current" />
                          运行
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
