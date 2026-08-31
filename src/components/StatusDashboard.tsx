import React, { useState, useEffect } from 'react'
import {
  Cpu,
  HardDrive,
  Activity,
  Clock,
  FolderGit2,
  Zap,
} from 'lucide-react'
import { ProjectItem, RunningTask, SystemMetrics } from '../types'
import { getFrameworkBadgeClass } from '../utils/colors'

interface StatusDashboardProps {
  currentProject: ProjectItem | null
  runningTasks: RunningTask[]
  activeTaskId: string | null
}

export const StatusDashboard: React.FC<StatusDashboardProps> = ({
  currentProject,
  runningTasks,
  activeTaskId,
}) => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [currentTime, setCurrentTime] = useState<number>(Date.now())

  // 定时采集系统指标
  useEffect(() => {
    let timer: any = null

    const fetchMetrics = async () => {
      if (window.electronAPI?.getSystemMetrics) {
        try {
          const data = await window.electronAPI.getSystemMetrics()
          setMetrics(data)
        } catch (e) {
          console.error('Failed to fetch system metrics', e)
        }
      }
    }

    fetchMetrics()
    timer = setInterval(fetchMetrics, 2000)

    return () => {
      if (timer) clearInterval(timer)
    }
  }, [])

  // 每秒刷新当前时间，用于计算运行时间
  useEffect(() => {
    const timeTimer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)

    return () => clearInterval(timeTimer)
  }, [])

  // 格式化字节大小
  const formatBytes = (bytes: number, decimals = 1): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  // 格式化时长
  const formatDuration = (startTime: number): string => {
    const totalSeconds = Math.max(0, Math.floor((currentTime - startTime) / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}时${minutes % 60}分${seconds}秒`
    }
    return `${minutes}分${seconds < 10 ? '0' : ''}${seconds}秒`
  }

  // 当前项目的运行任务
  const projectTasks = currentProject
    ? runningTasks.filter((t) => t.projectId === currentProject.id)
    : []

  // 当前项目总运行内存占用
  const projectTotalMemory = projectTasks.reduce(
    (sum, t) => sum + (t.memoryUsage || 0),
    0
  )

  return (
    <div className="flex flex-col h-full bg-dark-900/95 border-l border-dark-600/60 overflow-y-auto custom-scrollbar select-none text-xs">
      {/* 头部标题 */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-dark-950/80 border-b border-dark-600/60 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent-cyan" />
          <span className="font-bold text-dark-100 uppercase tracking-wider text-[11px]">
            项目运行与硬件监控
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
          <span className="text-[10px] text-accent-green font-mono">实时</span>
        </div>
      </div>

      <div className="p-3 space-y-3.5">
        {/* 1. 当前项目运行状态 */}
        <div className="bg-dark-950/70 border border-dark-600/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-dark-300">
            <span className="font-semibold text-dark-200 flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-accent-blue" />
              当前项目运行状态
            </span>
            <div className="flex items-center gap-1.5">
              {currentProject && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-800 text-dark-400 font-mono border border-dark-700">
                  {currentProject.packageManager}
                </span>
              )}
              {projectTasks.length > 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-green/10 text-accent-green font-mono border border-accent-green/20 font-bold">
                  {formatBytes(projectTotalMemory)}
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-800 text-dark-400 font-mono border border-dark-700">
                  未运行
                </span>
              )}
            </div>
          </div>

          {currentProject ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-dark-100 truncate text-xs" title={currentProject.name}>
                  {currentProject.name}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {currentProject.frameworks.map((fw) => (
                    <span
                      key={fw}
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono border ${getFrameworkBadgeClass(
                        fw
                      )}`}
                    >
                      {fw}
                    </span>
                  ))}
                </div>
              </div>

              {/* 项目运行内存指标条 */}
              {projectTasks.length > 0 && (
                <div className="bg-dark-900/80 rounded p-2 border border-dark-700/60 flex items-center justify-between font-mono text-[11px]">
                  <span className="text-dark-400">项目运行占用内存:</span>
                  <span className="font-bold text-accent-green">
                    {formatBytes(projectTotalMemory)}
                  </span>
                </div>
              )}

              {projectTasks.length > 0 ? (
                <div className="space-y-1.5 pt-1 border-t border-dark-700/60">
                  {projectTasks.map((task) => {
                    const isActive = task.taskId === activeTaskId
                    return (
                      <div
                        key={task.taskId}
                        className={`rounded p-2 border space-y-1 transition-colors ${
                          isActive
                            ? 'bg-dark-850/90 border-accent-blue/50 shadow-sm'
                            : 'bg-dark-900/90 border-dark-700/80'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                            <span className="font-bold text-dark-100 font-mono text-[11px]">
                              {task.scriptName}
                            </span>
                            {isActive && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-accent-blue/15 text-accent-blue border border-accent-blue/30 font-sans">
                                当前终端
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-dark-400 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-accent-amber" />
                            {formatDuration(task.startTime)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-dark-400 font-mono">
                          <span>PID: {task.pid ?? '-'}</span>
                          <span>
                            内存:{' '}
                            <strong className="text-dark-200 font-semibold">
                              {task.memoryUsage ? formatBytes(task.memoryUsage) : '计算中...'}
                            </strong>
                          </span>
                          <span className="text-accent-green">运行中</span>
                        </div>

                        <div
                          className="text-[10px] text-dark-400 font-mono truncate bg-dark-950 px-1.5 py-0.5 rounded border border-dark-800"
                          title={task.command}
                        >
                          {task.command}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-dark-500 py-2 text-center bg-dark-900/50 rounded border border-dashed border-dark-700/60">
                  当前项目暂无正在运行的任务
                </div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-dark-500 py-2 text-center">
              未选择项目
            </div>
          )}
        </div>

        {/* 2. LaunchPad 自身运行内存 */}
        <div className="bg-dark-950/70 border border-dark-600/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-dark-300">
            <span className="font-semibold text-dark-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-accent-amber" />
              LaunchPad 应用内存开销
            </span>
            <span className="text-[10px] text-accent-green font-mono bg-accent-green/10 border border-accent-green/20 px-1.5 py-0.2 rounded">
              轻量运行
            </span>
          </div>

          {metrics ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-dark-900/80 p-2 rounded border border-dark-700/60">
                <div className="text-[10px] text-dark-400">常驻内存 (RSS)</div>
                <div className="text-sm font-bold font-mono text-dark-100 mt-0.5">
                  {formatBytes(metrics.appMemory.rss)}
                </div>
              </div>
              <div className="bg-dark-900/80 p-2 rounded border border-dark-700/60">
                <div className="text-[10px] text-dark-400">已用堆 (Heap Used)</div>
                <div className="text-sm font-bold font-mono text-dark-100 mt-0.5">
                  {formatBytes(metrics.appMemory.heapUsed)}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-dark-500 py-1 text-center">指标加载中...</div>
          )}
        </div>

        {/* 3. 电脑系统内存信息 */}
        <div className="bg-dark-950/70 border border-dark-600/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-dark-300">
            <span className="font-semibold text-dark-200 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-accent-purple" />
              电脑系统运行内存
            </span>
            {metrics && (
              <span className="font-mono text-xs font-bold text-dark-200">
                {metrics.systemMemory.usagePercent}%
              </span>
            )}
          </div>

          {metrics ? (
            <div className="space-y-2">
              {/* 内存使用率进度条 */}
              <div className="w-full bg-dark-800 rounded-full h-2 overflow-hidden border border-dark-700">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    metrics.systemMemory.usagePercent > 85
                      ? 'bg-rose-500'
                      : metrics.systemMemory.usagePercent > 65
                      ? 'bg-accent-amber'
                      : 'bg-accent-purple'
                  }`}
                  style={{ width: `${metrics.systemMemory.usagePercent}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono text-dark-300">
                <div className="bg-dark-900/80 p-1.5 rounded border border-dark-700/60 text-center">
                  <div className="text-dark-400 text-[9px]">已用内存</div>
                  <div className="font-semibold text-dark-100 mt-0.5">
                    {formatBytes(metrics.systemMemory.used)}
                  </div>
                </div>
                <div className="bg-dark-900/80 p-1.5 rounded border border-dark-700/60 text-center">
                  <div className="text-dark-400 text-[9px]">可用空闲</div>
                  <div className="font-semibold text-accent-green mt-0.5">
                    {formatBytes(metrics.systemMemory.free)}
                  </div>
                </div>
                <div className="bg-dark-900/80 p-1.5 rounded border border-dark-700/60 text-center">
                  <div className="text-dark-400 text-[9px]">物理总量</div>
                  <div className="font-semibold text-dark-100 mt-0.5">
                    {formatBytes(metrics.systemMemory.total)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-dark-500 py-1 text-center">指标加载中...</div>
          )}
        </div>

        {/* 4. 电脑 CPU 信息 */}
        <div className="bg-dark-950/70 border border-dark-600/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-dark-300">
            <span className="font-semibold text-dark-200 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-accent-cyan" />
              电脑 CPU 处理器
            </span>
            {metrics && (
              <span className="font-mono text-xs font-bold text-accent-cyan">
                {metrics.cpu.usagePercent}%
              </span>
            )}
          </div>

          {metrics ? (
            <div className="space-y-2">
              {/* CPU 使用率进度条 */}
              <div className="w-full bg-dark-800 rounded-full h-2 overflow-hidden border border-dark-700">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    metrics.cpu.usagePercent > 80
                      ? 'bg-rose-500'
                      : metrics.cpu.usagePercent > 50
                      ? 'bg-accent-amber'
                      : 'bg-accent-cyan'
                  }`}
                  style={{ width: `${metrics.cpu.usagePercent}%` }}
                />
              </div>

              <div className="space-y-1 text-[10px] font-mono text-dark-300 bg-dark-900/80 p-2 rounded border border-dark-700/60">
                <div className="truncate text-dark-100 font-semibold" title={metrics.cpu.model}>
                  {metrics.cpu.model}
                </div>
                <div className="flex items-center justify-between text-dark-400 text-[9px] pt-1 border-t border-dark-800">
                  <span>架构: {metrics.cpu.arch}</span>
                  <span>{metrics.cpu.cores} 逻辑核心</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-dark-500 py-1 text-center">指标加载中...</div>
          )}
        </div>
      </div>
    </div>
  )
}
