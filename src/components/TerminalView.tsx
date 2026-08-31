import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import {
  Trash2,
  Square,
  Globe,
  ExternalLink,
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

export const TerminalView: React.FC<TerminalViewProps> = ({
  activeTaskId,
  runningTasks,
  onStopTask,
  onSelectTask,
  onOpenExternal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const termInstanceMap = useRef<Map<string, { term: XTerm; fitAddon: FitAddon }>>(new Map())
  const [detectedUrls, setDetectedUrls] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  // 提取 URL 正则
  const extractUrls = (text: string) => {
    const urlRegex = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|(?:\d{1,3}\.){3}\d{1,3}):\d{2,5}(?:\/[^\s\x1b]*)?)/g
    const matches = text.match(urlRegex)
    if (matches) {
      setDetectedUrls((prev) => {
        const set = new Set([...prev, ...matches])
        return Array.from(set)
      })
    }
  }

  // 初始化或切换终端
  useEffect(() => {
    if (!containerRef.current || !activeTaskId) return

    // 如果该任务的 Terminal 还未创建
    if (!termInstanceMap.current.has(activeTaskId)) {
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
        onOpenExternal(uri)
      })

      term.loadAddon(fitAddon)
      term.loadAddon(webLinksAddon)

      termInstanceMap.current.set(activeTaskId, { term, fitAddon })

      // 获取已有历史日志
      if (window.electronAPI?.getTaskLogs) {
        window.electronAPI.getTaskLogs(activeTaskId).then((logs) => {
          logs.forEach((chunk) => {
            term.write(chunk)
            extractUrls(chunk)
          })
        })
      }
    }

    const { term, fitAddon } = termInstanceMap.current.get(activeTaskId)!

    // 挂载到 DOM
    containerRef.current.innerHTML = ''
    term.open(containerRef.current)
    try {
      fitAddon.fit()
    } catch {}

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {}
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    const handleResize = () => {
      try {
        fitAddon.fit()
      } catch {}
    }

    window.addEventListener('resize', handleResize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [activeTaskId])

  // 监听实时日志
  useEffect(() => {
    if (!window.electronAPI?.onTerminalData) return
    const unsubscribe = window.electronAPI.onTerminalData(({ taskId, data }) => {
      const record = termInstanceMap.current.get(taskId)
      if (record) {
        record.term.write(data)
      }
      if (taskId === activeTaskId) {
        extractUrls(data)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [activeTaskId])

  const handleClear = () => {
    if (!activeTaskId) return
    const record = termInstanceMap.current.get(activeTaskId)
    if (record) {
      record.term.clear()
    }
    setDetectedUrls([])
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
          {/* 检测到的 Localhost URL 快速跳转 */}
          {detectedUrls.length > 0 && (
            <div className="flex items-center gap-1.5 mr-2">
              {detectedUrls.slice(0, 2).map((url) => (
                <button
                  key={url}
                  onClick={() => onOpenExternal(url)}
                  title={`在浏览器中打开: ${url}`}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-accent-blue/15 hover:bg-accent-blue/25 text-accent-blue border border-accent-blue/30 text-xs font-mono font-medium transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[150px]">{url}</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </button>
              ))}
            </div>
          )}

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
