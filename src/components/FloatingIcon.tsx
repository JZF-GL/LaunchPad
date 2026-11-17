import React, { useEffect, useRef, useState } from 'react'
import { Zap } from 'lucide-react'
import { RunningTask } from '../types'

/** 与主进程 FLOATING_ICON_SIZE 保持一致 */
const ICON_SIZE = 42

/**
 * 悬浮图标窗口（42x42）
 *
 * 这个窗口在整个悬浮模式里尺寸和位置都不会变化（除了拖动），
 * 展开时只是把面板窗口按锚点显示在它旁边，所以不会出现窗口缩放导致的残影。
 * 它负责：悬停上报、拖动、点击切换展开/收起。
 */
export const FloatingIcon: React.FC = () => {
  const [runningCount, setRunningCount] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ active: false, started: false, startX: 0, startY: 0 })

  /* ------------------------------ 运行中数量 ------------------------------ */
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const count = (tasks: RunningTask[]) =>
      tasks.filter((t) => t.status === 'running' || t.status === 'stopping').length

    api.getRunningTasks().then((tasks) => setRunningCount(count(tasks)))

    const unsub = api.onTaskStatusChange(() => {
      api.getRunningTasks().then((tasks) => setRunningCount(count(tasks)))
    })

    return () => {
      unsub()
    }
  }, [])

  /* ------------------------------ 拖动 / 点击 ------------------------------ */
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
      // 主进程按帧跟随鼠标移动这个窗口
      window.electronAPI?.startFloatingDrag()
    }
  }

  // 指针被系统抢走（拖到别的窗口、Alt+Tab 等）时兜底结束拖动，避免卡住
  useEffect(() => {
    const handleUp = () => endDrag(true)
    const handleCancel = () => endDrag(false)
    const handleBlur = () => endDrag(false)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleCancel)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleCancel)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  return (
    <div
      className="non-draggable h-screen w-screen flex items-center justify-center"
      onMouseEnter={() => window.electronAPI?.setFloatingHover('icon', true)}
      onMouseLeave={() => window.electronAPI?.setFloatingHover('icon', false)}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
        title={dragging ? '松开结束拖动' : '悬停展开 · 按住拖动 · 点击切换'}
        style={{ width: ICON_SIZE, height: ICON_SIZE }}
        className={`relative rounded-xl bg-gradient-to-tr from-accent-blue via-accent-purple to-accent-cyan border border-white/20 flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform duration-150 ${
          dragging ? 'scale-95' : 'hover:scale-[1.03]'
        }`}
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
