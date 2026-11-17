import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Zap,
  Play,
  Square,
  RotateCw,
  Maximize2,
  Pin,
  Loader2,
} from 'lucide-react'
import { FloatingAnchor, FloatingModeState, RunningTask, ShortcutItem } from '../types'

/** 与主进程 FLOATING_ICON_SIZE / FLOATING_PANEL_WIDTH / FLOATING_PANEL_HEIGHT 保持一致 */
const ICON_SIZE = 42
const PANEL_WIDTH = 340
const PANEL_HEIGHT = 320
/** 揭示 / 收回动画时长 (ms) */
const EXPAND_MS = 220
const COLLAPSE_MS = 170

/**
 * 悬浮面板窗口（340x320）
 *
 * 面板由主进程在隐藏状态下摆好位置、渲染出第一帧后才显示，展开/收起只是
 * 一个固定尺寸裁切盒的宽高过渡，窗口本身不缩放也不移动，所以不会出现闪帧。
 * 展开方向由主进程按图标位置决定（锚点），面板贴到对应的角。
 */
export const FloatingDock: React.FC = () => {
  const [modeState, setModeState] = useState<FloatingModeState>({
    shortcuts: [],
    currentProjectId: null,
  })
  const [tasks, setTasks] = useState<RunningTask[]>([])
  const [expanded, setExpanded] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [anchor, setAnchor] = useState<FloatingAnchor>({ horizontal: 'right', vertical: 'top' })
  const [busyIds, setBusyIds] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)

  const dragRef = useRef({ active: false, started: false, startX: 0, startY: 0 })
  const collapseTimerRef = useRef<number | null>(null)
  const expandedRef = useRef(false)

  /* ------------------------------ 数据订阅 ------------------------------ */
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.getRunningTasks().then(setTasks)
    api.getFloatingState().then((state) => {
      if (state) setModeState(state)
    })

    const unsubState = api.onFloatingState((state) => setModeState(state))
    const unsubTask = api.onTaskStatusChange((task) => {
      setTasks((prev) => {
        if (task.status === 'stopped' || task.status === 'error') {
          return prev.filter((t) => t.taskId !== task.taskId)
        }
        const index = prev.findIndex((t) => t.taskId === task.taskId)
        if (index >= 0) {
          const next = [...prev]
          next[index] = task
          return next
        }
        return [...prev, task]
      })
    })

    return () => {
      unsubState()
      unsubTask()
    }
  }, [])

  /* --------------------------- 展开 / 收起（由主进程驱动） --------------------------- */
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const clearCollapseTimer = () => {
      if (collapseTimerRef.current) {
        window.clearTimeout(collapseTimerRef.current)
        collapseTimerRef.current = null
      }
    }

    const unsubExpand = api.onFloatingPanelExpand((nextAnchor) => {
      clearCollapseTimer()
      expandedRef.current = true
      setAnchor(nextAnchor)
      setRevealed(false)
      setExpanded(true)
      // 等按新锚点画好（此时窗口还没显示），再通知主进程可以显示面板了
      requestAnimationFrame(() => {
        requestAnimationFrame(() => api.notifyPanelReady())
      })
    })

    const unsubReveal = api.onFloatingPanelReveal(() => {
      clearCollapseTimer()
      expandedRef.current = true
      setRevealed(true)
    })

    const unsubCollapse = api.onFloatingPanelCollapse(() => {
      setRevealed(false)
      clearCollapseTimer()
      collapseTimerRef.current = window.setTimeout(() => {
        collapseTimerRef.current = null
        api.notifyPanelCollapsed()
      }, COLLAPSE_MS + 20)
    })

    const unsubReset = api.onFloatingPanelReset(() => {
      clearCollapseTimer()
      expandedRef.current = false
      dragRef.current = { active: false, started: false, startX: 0, startY: 0 }
      setDragging(false)
      setRevealed(false)
      setExpanded(false)
    })

    return () => {
      clearCollapseTimer()
      unsubExpand()
      unsubReveal()
      unsubCollapse()
      unsubReset()
    }
  }, [])

  /* ------------------------------- 拖拽 ------------------------------- */
  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    dragRef.current = {
      active: true,
      started: false,
      startX: e.screenX,
      startY: e.screenY,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag.active || drag.started) return
    if (Math.hypot(e.screenX - drag.startX, e.screenY - drag.startY) > 4) {
      drag.started = true
      setDragging(true)
      // 主进程会立刻隐藏面板并开始移动图标窗口
      window.electronAPI?.startFloatingDrag()
    }
  }

  const endDrag = (commit: boolean) => {
    const drag = dragRef.current
    if (!drag.active && !drag.started) return
    const wasDragging = drag.started
    drag.active = false
    drag.started = false
    setDragging(false)
    if (wasDragging) {
      window.electronAPI?.endFloatingDrag()
    } else if (commit) {
      // 没有发生位移 → 视为点击，切换展开 / 收起
      window.electronAPI?.toggleFloating()
    }
  }

  useEffect(() => {
    const handleBlur = () => endDrag(false)
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [])

  /* ------------------------------ 快捷操作 ------------------------------ */
  const handleToggleScript = async (shortcut: ShortcutItem) => {
    const api = window.electronAPI
    if (!api) return

    const task = tasks.find((t) => t.taskId === shortcut.id)
    setBusyIds((prev) => (prev.includes(shortcut.id) ? prev : [...prev, shortcut.id]))

    try {
      if (task && (task.status === 'running' || task.status === 'stopping')) {
        await api.stopScript(shortcut.id)
      } else {
        await api.runScript({
          projectId: shortcut.projectId,
          scriptName: shortcut.scriptName,
          projectPath: shortcut.projectPath,
          packageManager: shortcut.packageManager,
          customArgs: shortcut.customArgs,
        })
      }
    } finally {
      window.setTimeout(() => {
        setBusyIds((prev) => prev.filter((id) => id !== shortcut.id))
      }, 400)
    }
  }

  const handleExit = () => {
    window.electronAPI?.exitFloatingMode()
  }

  /* ------------------------------ 数据整理 ------------------------------ */
  const sortedShortcuts = useMemo(() => {
    const list = [...modeState.shortcuts]
    list.sort((a, b) => {
      const aCurrent = a.projectId === modeState.currentProjectId ? 0 : 1
      const bCurrent = b.projectId === modeState.currentProjectId ? 0 : 1
      if (aCurrent !== bCurrent) return aCurrent - bCurrent
      return b.createdAt - a.createdAt
    })
    return list
  }, [modeState])

  const runningCount = tasks.filter((t) => t.status === 'running' || t.status === 'stopping').length

  /** 面板窗口内没有拖动需求，这里只声明交互属性 */
  const dragProps = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: () => endDrag(true),
    onPointerCancel: () => endDrag(false),
  }

  /** 锚点决定面板贴住窗口的哪条边 */
  const panelPosition = `${anchor.vertical === 'bottom' ? 'bottom-0' : 'top-0'} ${
    anchor.horizontal === 'right' ? 'right-0' : 'left-0'
  }`

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      onMouseEnter={() => {
        // 收起状态下窗口是鼠标穿透的，这里只在展开时上报，避免误触发
        if (expanded) window.electronAPI?.setFloatingHover('panel', true)
      }}
      onMouseLeave={() => window.electronAPI?.setFloatingHover('panel', false)}
    >
      {expanded && (
        // 裁切盒：窗口尺寸固定，靠它从图标角把面板「揭示」出来
        <div
          className={`absolute overflow-hidden ${panelPosition}`}
          style={{
            width: revealed ? PANEL_WIDTH : ICON_SIZE,
            height: revealed ? PANEL_HEIGHT : ICON_SIZE,
            transition: revealed
              ? `width ${EXPAND_MS}ms cubic-bezier(0.22, 1, 0.36, 1), height ${EXPAND_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
              : `width ${COLLAPSE_MS}ms cubic-bezier(0.4, 0, 1, 1), height ${COLLAPSE_MS}ms cubic-bezier(0.4, 0, 1, 1)`,
          }}
        >
          <div
            className={`absolute w-[340px] h-[320px] rounded-2xl bg-dark-900/95 backdrop-blur-md border border-dark-600/80 overflow-hidden ${panelPosition}`}
          >
            <div
              className={`h-full flex ${
                anchor.vertical === 'bottom' ? 'flex-col-reverse' : 'flex-col'
              }`}
            >
              {/* 顶部：项目信息 + 返回主界面（图标占用锚点角，这里让出图标尺寸） */}
              <header
                className={`h-[56px] flex-shrink-0 flex items-center gap-2 bg-dark-950/60 border-dark-600/60 ${
                  anchor.horizontal === 'right' ? 'pl-3 pr-[50px]' : 'pl-[50px] pr-3'
                } ${anchor.vertical === 'bottom' ? 'border-t' : 'border-b'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-dark-100 tracking-wide">
                    <Pin className="w-3 h-3 text-accent-amber" />
                    快捷方式
                  </div>
                  <div className="text-[10px] text-dark-400 font-mono truncate mt-0.5">
                    {modeState.currentProjectName || '全部项目'} · {sortedShortcuts.length} 个快捷按钮
                  </div>
                </div>

                <button
                  onClick={handleExit}
                  title="返回主界面"
                  className="non-draggable p-1.5 rounded-md bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-dark-100 border border-dark-600 transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </header>

              {/* 快捷按钮列表 */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                {sortedShortcuts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-4">
                    <Pin className="w-6 h-6 text-dark-600 mb-2" />
                    <p className="text-[11px] text-dark-400 font-medium">还没有快捷方式</p>
                    <p className="text-[10px] text-dark-500 mt-1 leading-relaxed">
                      回到主界面，点击运行按钮左侧的图钉图标，即可把指令添加到悬浮窗
                    </p>
                  </div>
                ) : (
                  sortedShortcuts.map((shortcut) => {
                    const task = tasks.find((t) => t.taskId === shortcut.id)
                    const running = task?.status === 'running'
                    const stopping = task?.status === 'stopping'
                    const busy = busyIds.includes(shortcut.id)
                    const isCurrent = shortcut.projectId === modeState.currentProjectId

                    return (
                      <button
                        key={shortcut.id}
                        onClick={() => handleToggleScript(shortcut)}
                        disabled={busy}
                        title={`${shortcut.projectName} · ${shortcut.scriptName}`}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all active:scale-[0.99] disabled:opacity-70 ${
                          running
                            ? 'bg-dark-800/90 border-accent-green/50'
                            : isCurrent
                            ? 'bg-dark-850 border-dark-600/70 hover:border-accent-blue/60 hover:bg-dark-800'
                            : 'bg-dark-900/80 border-dark-600/50 hover:border-dark-500 hover:bg-dark-850'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            running ? 'bg-accent-green animate-pulse-glow' : 'bg-dark-600'
                          }`}
                        />

                        <span className="flex-1 min-w-0">
                          <span
                            className={`block text-xs font-bold font-mono truncate ${
                              running ? 'text-accent-green' : 'text-dark-100'
                            }`}
                          >
                            {shortcut.scriptName}
                          </span>
                          <span className="block text-[10px] text-dark-500 font-mono truncate">
                            {shortcut.projectName}
                          </span>
                        </span>

                        {busy ? (
                          <Loader2 className="w-3.5 h-3.5 text-dark-400 animate-spin flex-shrink-0" />
                        ) : running ? (
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <span className="p-1 rounded bg-dark-700 text-dark-300">
                              <RotateCw className="w-3 h-3" />
                            </span>
                            <span className="flex items-center gap-1 px-1.5 py-1 rounded bg-rose-600 text-white text-[10px] font-semibold">
                              <Square className="w-2.5 h-2.5 fill-current" />
                              {stopping ? '停止中' : '停止'}
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-1 rounded bg-accent-green text-dark-950 text-[10px] font-bold flex-shrink-0">
                            <Play className="w-2.5 h-2.5 fill-current" />
                            运行
                          </span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/*
        面板里的图标：正常情况下由上面的图标窗口绘制并盖住这一块，
        这里再画一份是为了面板窗口因点击被系统提到前面时外观保持一致。
      */}
      <div
        {...dragProps}
        title={dragging ? '松开结束拖动' : '按住拖动可移动位置'}
        className={`absolute z-10 w-[42px] h-[42px] rounded-xl bg-gradient-to-tr from-accent-blue via-accent-purple to-accent-cyan border border-white/20 flex items-center justify-center cursor-grab active:cursor-grabbing ${panelPosition}`}
        style={{ opacity: expanded ? 1 : 0, pointerEvents: expanded ? 'auto' : 'none' }}
      >
        <Zap className="w-[18px] h-[18px] text-white drop-shadow" />
        {runningCount > 0 && (
          <span className="absolute bottom-0.5 right-0.5 min-w-[13px] h-[13px] px-0.5 rounded-full bg-accent-green text-dark-950 text-[8px] font-bold flex items-center justify-center border border-dark-900">
            {runningCount}
          </span>
        )}
      </div>
    </div>
  )
}
