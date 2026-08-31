import React, { useState, useEffect } from 'react'
import {
  Minus,
  Square,
  Copy,
  X,
  Zap,
  FolderGit2,
} from 'lucide-react'
import { ProjectItem } from '../types'

interface TitleBarProps {
  currentProject: ProjectItem | null
}

export const TitleBar: React.FC<TitleBarProps> = ({ currentProject }) => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (window.electronAPI?.isMaximized) {
      window.electronAPI.isMaximized().then(setIsMaximized)
    }

    if (window.electronAPI?.onMaximizedChange) {
      const unsub = window.electronAPI.onMaximizedChange((maximized) => {
        setIsMaximized(maximized)
      })
      return () => {
        unsub()
      }
    }
  }, [])

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow()
  }

  const handleMaximize = async () => {
    if (window.electronAPI?.maximizeWindow) {
      const res = await window.electronAPI.maximizeWindow()
      setIsMaximized(res)
    }
  }

  const handleClose = () => {
    window.electronAPI?.closeWindow()
  }

  const handleDoubleClick = () => {
    handleMaximize()
  }

  return (
    <header
      onDoubleClick={handleDoubleClick}
      className="h-9 w-full bg-dark-950 border-b border-dark-600/70 flex items-center justify-between px-3 select-none flex-shrink-0 z-50 draggable-header"
    >
      {/* 左侧：Logo 与品牌 */}
      <div className="flex items-center space-x-2.5 non-draggable">
        <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-accent-blue to-accent-purple flex items-center justify-center shadow-sm shadow-accent-blue/30">
          <Zap className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-bold text-dark-100 tracking-wider flex items-center gap-1.5">
          LaunchPad
          <span className="text-[9px] px-1 py-0.2 rounded bg-dark-700/90 text-dark-400 font-normal">
            Desktop
          </span>
        </span>
      </div>

      {/* 中间：当前项目信息提示 (拖拽区域) */}
      <div className="flex items-center space-x-2 text-xs text-dark-400 font-mono pointer-events-none truncate max-w-[40%]">
        {currentProject ? (
          <div className="flex items-center space-x-1.5 truncate">
            <FolderGit2 className="w-3.5 h-3.5 text-accent-blue flex-shrink-0" />
            <span className="text-dark-200 truncate font-semibold">
              {currentProject.name}
            </span>
            <span className="text-dark-500 text-[11px] truncate">
              ({currentProject.path})
            </span>
          </div>
        ) : (
          <span className="text-dark-500 text-[11px]">未打开项目</span>
        )}
      </div>

      {/* 右侧：原生级自定义窗口控制按钮 */}
      <div className="flex items-center space-x-1 non-draggable">
        {/* 最小化 */}
        <button
          onClick={handleMinimize}
          title="最小化"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-dark-800 text-dark-400 hover:text-dark-100 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* 最大化 / 还原 */}
        <button
          onClick={handleMaximize}
          title={isMaximized ? '向下还原' : '最大化'}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-dark-800 text-dark-400 hover:text-dark-100 transition-colors"
        >
          {isMaximized ? (
            <Copy className="w-3 h-3 rotate-180" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </button>

        {/* 关闭 */}
        <button
          onClick={handleClose}
          title="关闭"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-rose-600 text-dark-400 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  )
}
