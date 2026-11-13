import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import {
  Trash2,
  Square,
  Terminal as TerminalIcon,
  Copy,
  Check,
} from 'lucide-react'
import { RunningTask } from '../types'

interface TerminalViewProps {
  activeTaskId: string | null
  runningTasks: RunningTask[]
  onStopTask: (taskId: string) => void
  onSelectTask: (taskId: string) => void
  onOpenExternal: (url: string) => void
}

interface TerminalRecord {
  term: XTerm
  fitAddon: FitAddon
  /** 该任务专属的渲染容器，切换任务时只做显示 / 隐藏 */
  wrapper: HTMLDivElement
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  activeTaskId,
  runningTasks,
  onStopTask,
  onSelectTask,
  onOpenExternal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const termInstanceMap = useRef<Map<string, TerminalRecord>>(new Map())
  const [copied, setCopied] = useState(false)

  // 链接回调保持最新，同时避免它变化导致终端被重建
  const onOpenExternalRef = useRef(onOpenExternal)
  useEffect(() => {
    onOpenExternalRef.current = onOpenExternal
  }, [onOpenExternal])

  /**
   * 每个任务使用独立的容器 + 独立的 xterm 实例，切换任务时只切换容器的显隐。
   *
   * 之前是共用一个容器 + 每次切换都调用 term.open()，但 xterm 的 open() 对已经
   * 打开过的实例是空操作，而容器又被 innerHTML 清空了，所以切回去就是一片空白。
   * 现在容器和实例都常驻，隐藏的终端继续接收输出，切回来直接显示缓冲区内容。
   */
  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    if (!activeTaskId) {
      termInstanceMap.current.forEach((record) => {
        record.wrapper.style.display = 'none'
      })
      return
    }

    if (!termInstanceMap.current.has(activeTaskId)) {
      const wrapper = document.createElement('div')
      wrapper.className = 'absolute inset-0 w-full h-full'
      wrapper.style.display = 'none'
      host.appendChild(wrapper)

      const term = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        lineHeight: 1.3,
        fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
        theme: {
          background: '#090d13',
          foreground: '#e6edf3',
          cursor: '#10b981',
          black: '#090d13',
          red: '#f43f5e',
          green: '#10b981',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#8b5cf6',
          cyan: '#06b6d4',
          white: '#e6edf3',
          brightBlack: '#484f58',
          brightRed: '#fb7185',
          brightGreen: '#34d399',
          brightYellow: '#fbbf24',
          brightBlue: '#60a5fa',
          brightMagenta: '#a78bfa',
          brightCyan: '#22d3ee',
          brightWhite: '#ffffff',
        },
        convertEol: true,
      })

      const fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon((_, uri) => {
        onOpenExternalRef.current(uri)
      })

      term.loadAddon(fitAddon)
      term.loadAddon(webLinksAddon)
      term.open(wrapper)

      termInstanceMap.current.set(activeTaskId, { term, fitAddon, wrapper })

      // 补上该任务在此终端创建之前的输出
      if (window.electronAPI?.getTaskLogs) {
        window.electronAPI.getTaskLogs(activeTaskId).then((logs) => {
          logs.forEach((chunk) => term.write(chunk))
        })
      }
    }

    // 只显示当前任务的终端，其余保持挂载（缓冲区与滚动位置都不会丢）
    termInstanceMap.current.forEach((record, taskId) => {
      record.wrapper.style.display = taskId === activeTaskId ? 'block' : 'none'
    })

    const record = termInstanceMap.current.get(activeTaskId)!

    // 等容器完成布局后再 fit，避免在隐藏容器里算出错误尺寸
    const frame = requestAnimationFrame(() => {
      try {
        record.fitAddon.fit()
      } catch {}
      record.term.refresh(0, record.term.rows - 1)
      record.term.focus()
    })

    const resizeObserver = new ResizeObserver(() => {
      try {
        record.fitAddon.fit()
      } catch {}
    })
    resizeObserver.observe(host)

    const handleResize = () => {
      try {
        record.fitAddon.fit()
      } catch {}
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [activeTaskId])

  // 组件卸载时释放所有终端实例
  useEffect(() => {
    const map = termInstanceMap.current
    return () => {
      map.forEach((record) => {
        try {
          record.term.dispose()
        } catch {}
      })
      map.clear()
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [])

  // 任务结束后释放对应的终端实例（当前正在查看的那个保留，方便继续看最后的输出）
  useEffect(() => {
    const alive = new Set(runningTasks.map((t) => t.taskId))
    termInstanceMap.current.forEach((record, taskId) => {
      if (alive.has(taskId) || taskId === activeTaskId) return
      try {
        record.term.dispose()
      } catch {}
      record.wrapper.remove()
      termInstanceMap.current.delete(taskId)
    })
  }, [runningTasks, activeTaskId])

  // 监听实时日志
  useEffect(() => {
    if (!window.electronAPI?.onTerminalData) return
    const unsubscribe = window.electronAPI.onTerminalData(({ taskId, data }) => {
      const record = termInstanceMap.current.get(taskId)
      if (record) {
        record.term.write(data)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleClear = () => {
    if (!activeTaskId) return
    const record = termInstanceMap.current.get(activeTaskId)
    if (record) {
      record.term.clear()
    }
  }

  const handleCopyLogs = () => {
    if (!activeTaskId) return
    const record = termInstanceMap.current.get(activeTaskId)
    if (record) {
      // 选中全部并复制
      record.term.selectAll()
      const selection = record.term.getSelection()
      navigator.clipboard.writeText(selection)
      record.term.clearSelection()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const activeTask = runningTasks.find((t) => t.taskId === activeTaskId)

  return (
    <div className="flex-1 flex flex-col bg-dark-950 min-h-0 overflow-hidden">
      {/* 终端顶部操作与 Tab 栏 */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-900 border-b border-dark-600/60 select-none">
        {/* Tab 列表 */}
        <div className="flex items-center space-x-1 overflow-x-auto max-w-[60%]">
          {runningTasks.length === 0 ? (
            <div className="flex items-center space-x-1.5 text-xs text-dark-400 font-mono py-1 px-2">
              <TerminalIcon className="w-3.5 h-3.5" />
              <span>控制台就绪 (未运行脚本)</span>
            </div>
          ) : (
            runningTasks.map((t) => {
              const isActive = t.taskId === activeTaskId
              return (
                <button
                  key={t.taskId}
                  onClick={() => onSelectTask(t.taskId)}
                  className={`flex items-center gap-2 px-2.5 py-1 rounded text-xs font-mono transition-all border ${
                    isActive
                      ? 'bg-dark-800 text-dark-100 border-dark-500 shadow-sm'
                      : 'bg-dark-950/60 text-dark-400 border-dark-700/60 hover:text-dark-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      t.status === 'running'
                        ? 'bg-accent-green animate-pulse'
                        : 'bg-dark-500'
                    }`}
                  ></span>
                  <span>{t.scriptName}</span>
                </button>
              )
            })
          )}
        </div>

        {/* 右侧工具按钮 */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopyLogs}
            title="复制控制台输出"
            className="flex items-center gap-1 px-2 py-1 rounded bg-dark-800 hover:bg-dark-700 text-dark-300 text-xs border border-dark-600 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>

          <button
            onClick={handleClear}
            title="清空控制台"
            className="flex items-center gap-1 px-2 py-1 rounded bg-dark-800 hover:bg-dark-700 text-dark-300 text-xs border border-dark-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清屏</span>
          </button>

          {activeTask && activeTask.status === 'running' && (
            <button
              onClick={() => onStopTask(activeTask.taskId)}
              title="终止当前控制台脚本"
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-medium border border-rose-500 shadow-sm transition-all"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>停止</span>
            </button>
          )}
        </div>
      </div>

      {/* xterm 渲染容器 */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-dark-950">
        <div ref={containerRef} className="absolute inset-0 w-full h-full" />
        {!activeTaskId && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-dark-500 text-xs space-y-2 pointer-events-none">
            <TerminalIcon className="w-8 h-8 opacity-30" />
            <p>选择上方指令点击「运行」查看控制台实时输出</p>
          </div>
        )}
      </div>
    </div>
  )
}
