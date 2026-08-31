import React, { useState } from 'react'
import { AlertOctagon, Flame, ShieldAlert, X, RefreshCw } from 'lucide-react'
import { PortConflictInfo } from '../types'

interface PortConflictModalProps {
  conflict: PortConflictInfo | null
  onClose: () => void
  onKillAndRestart: (conflict: PortConflictInfo) => Promise<void>
  onJustKill: (port: number) => Promise<void>
}

export const PortConflictModal: React.FC<PortConflictModalProps> = ({
  conflict,
  onClose,
  onKillAndRestart,
  onJustKill,
}) => {
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)

  if (!conflict) return null

  const handleKillAndRestart = async () => {
    setLoading(true)
    setStatusText('正在清理占用端口并重新启动脚本...')
    try {
      await onKillAndRestart(conflict)
      onClose()
    } catch (e: any) {
      setStatusText(`处理失败: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleJustKill = async () => {
    setLoading(true)
    setStatusText(`正在终止占用端口 ${conflict.port} 的进程...`)
    try {
      await onJustKill(conflict.port)
      setStatusText(`端口 ${conflict.port} 释放完毕！`)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (e: any) {
      setStatusText(`清理失败: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-dark-900 border border-rose-600/50 rounded-xl shadow-2xl overflow-hidden shadow-rose-950/40 flex flex-col">
        {/* 标题栏 */}
        <div className="bg-rose-950/40 border-b border-rose-700/40 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 text-rose-400 font-semibold text-sm">
            <AlertOctagon className="w-5 h-5 text-rose-500 flex-shrink-0 animate-bounce" />
            <span>端口冲突报警 (Port Conflict)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-dark-400 hover:text-dark-100 hover:bg-dark-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体内容 */}
        <div className="p-5 space-y-4">
          <div className="flex items-start space-x-3 bg-dark-950 p-3 rounded-lg border border-dark-700">
            <ShieldAlert className="w-5 h-5 text-accent-amber flex-shrink-0 mt-0.5" />
            <div className="text-xs text-dark-200 space-y-1">
              <p className="font-semibold text-rose-300">
                脚本启动受阻：端口 {conflict.port} 已被占用
              </p>
              <p className="text-dark-400">
                {conflict.processName
                  ? `当前占用进程为: ${conflict.processName} (PID: ${conflict.pid || '未知'})`
                  : '系统中已有其他服务正在使用该端口。'}
              </p>
            </div>
          </div>

          <div className="text-xs text-dark-300">
            建议先清理占用该端口的旧进程，以便让项目顺利启动。您可以选择以下操作：
          </div>

          {statusText && (
            <div className="text-xs bg-dark-800 p-2.5 rounded border border-dark-600 font-mono text-accent-cyan flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{statusText}</span>
            </div>
          )}
        </div>

        {/* 底部按钮组 */}
        <div className="bg-dark-950 px-5 py-3.5 border-t border-dark-700 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 text-xs font-medium transition-colors"
          >
            稍后手动处理
          </button>

          <button
            onClick={handleJustKill}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-rose-300 border border-rose-800/60 text-xs font-medium transition-colors disabled:opacity-50"
          >
            仅强制释放端口
          </button>

          <button
            onClick={handleKillAndRestart}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-rose-900/30 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Flame className="w-4 h-4" />
            <span>清理端口并重新启动</span>
          </button>
        </div>
      </div>
    </div>
  )
}
