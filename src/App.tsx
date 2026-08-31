import React, { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { ProjectDetail } from './components/ProjectDetail'
import { TerminalView } from './components/TerminalView'
import { PortConflictModal } from './components/PortConflictModal'
import { TitleBar } from './components/TitleBar'
import { ProjectItem, RunningTask, PortConflictInfo, SystemEnvInfo } from './types'
import { FolderPlus, Boxes, HardDriveDownload } from 'lucide-react'

const STORAGE_KEY = 'launchpad_projects_v1'

export const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [conflictModal, setConflictModal] = useState<PortConflictInfo | null>(null)
  const [envInfo, setEnvInfo] = useState<SystemEnvInfo | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // 读取已保存的项目和系统环境
  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY)
      if (cached) {
        const list: ProjectItem[] = JSON.parse(cached)
        setProjects(list)
        if (list.length > 0) {
          setSelectedProjectId(list[0].id)
        }
      }
    } catch (e) {
      console.error('Failed to load cached projects', e)
    }

    if (window.electronAPI) {
      window.electronAPI.getSystemEnv().then(setEnvInfo)
      window.electronAPI.getRunningTasks().then(setRunningTasks)

      // 监听任务状态变更
      const unsubStatus = window.electronAPI.onTaskStatusChange((task) => {
        setRunningTasks((prev) => {
          const index = prev.findIndex((t) => t.taskId === task.taskId)
          if (task.status === 'stopped' || task.status === 'error') {
            return prev.filter((t) => t.taskId !== task.taskId)
          }
          if (index >= 0) {
            const next = [...prev]
            next[index] = task
            return next
          }
          return [...prev, task]
        })
      })

      // 监听端口冲突
      const unsubConflict = window.electronAPI.onPortConflict((conflict) => {
        setConflictModal(conflict)
      })

      return () => {
        unsubStatus()
        unsubConflict()
      }
    }
  }, [])

  // 保存项目列表到本地
  const saveProjects = (newProjects: ProjectItem[]) => {
    setProjects(newProjects)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProjects))
  }

  // 添加项目
  const handleAddProject = async () => {
    if (!window.electronAPI) return
    const folderPath = await window.electronAPI.openDirectoryDialog()
    if (!folderPath) return

    await addProjectByPath(folderPath)
  }

  const addProjectByPath = async (folderPath: string) => {
    const project = await window.electronAPI.scanProject(folderPath)

    // 检查是否已存在
    const exists = projects.find((p) => p.path.toLowerCase() === folderPath.toLowerCase())
    if (exists) {
      setSelectedProjectId(exists.id)
      return
    }

    const updated = [project, ...projects]
    saveProjects(updated)
    setSelectedProjectId(project.id)
  }

  // 移除项目
  const handleRemoveProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = projects.filter((p) => p.id !== projectId)
    saveProjects(updated)
    if (selectedProjectId === projectId) {
      setSelectedProjectId(updated.length > 0 ? updated[0].id : null)
    }
  }

  // 刷新当前项目
  const handleRefreshProject = async () => {
    if (!selectedProject) return
    const refreshed = await window.electronAPI.scanProject(selectedProject.path)
    const updated = projects.map((p) => (p.id === selectedProject.id ? refreshed : p))
    saveProjects(updated)
  }

  // 改变包管理器
  const handleChangePackageManager = (pm: 'pnpm' | 'npm' | 'yarn' | 'bun') => {
    if (!selectedProject) return
    const updated = projects.map((p) =>
      p.id === selectedProject.id ? { ...p, packageManager: pm } : p
    )
    saveProjects(updated)
  }

  // 运行脚本
  const handleRunScript = async (scriptName: string, customArgs?: string) => {
    if (!selectedProject) return
    const taskId = `${selectedProject.id}::${scriptName}`
    setActiveTaskId(taskId)

    await window.electronAPI.runScript({
      projectId: selectedProject.id,
      scriptName,
      projectPath: selectedProject.path,
      packageManager: selectedProject.packageManager,
      customArgs,
    })
  }

  // 停止脚本
  const handleStopScript = async (taskId: string) => {
    await window.electronAPI.stopScript(taskId)
  }

  // 杀死端口
  const handleKillPort = async (port: number) => {
    return window.electronAPI.killPort(port)
  }

  // 端口冲突后清理并重新启动
  const handleKillAndRestart = async (conflict: PortConflictInfo) => {
    // 1. 先杀掉端口
    await window.electronAPI.killPort(conflict.port)
    // 2. 停掉旧的任务（如果存在）
    await window.electronAPI.stopScript(conflict.taskId)
    // 3. 稍等 600ms 确保端口释放完毕
    await new Promise((r) => setTimeout(r, 600))
    // 4. 重启
    const proj = projects.find((p) => p.id === conflict.projectId)
    if (proj) {
      await handleRunScript(conflict.scriptName)
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null

  // 拖拽导入文件夹支持
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      const filePath = (file as any).path
      if (filePath) {
        await addProjectByPath(filePath)
      }
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex flex-col h-screen w-screen bg-dark-950 text-dark-100 font-sans select-none overflow-hidden border border-dark-600/70 shadow-2xl"
    >
      {/* 自定义顶部窗口外边框 / 标题栏 */}
      <TitleBar currentProject={selectedProject} />

      {/* 拖拽导入高亮覆盖层 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-accent-blue/15 border-2 border-dashed border-accent-blue flex flex-col items-center justify-center backdrop-blur-xs">
          <HardDriveDownload className="w-16 h-16 text-accent-blue animate-bounce mb-3" />
          <p className="text-lg font-bold text-white tracking-wide">
            释放鼠标即可添加前端项目
          </p>
          <p className="text-xs text-dark-400 mt-1">自动识别根目录 package.json</p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* 左侧侧边栏 */}
        <Sidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          runningTasks={runningTasks}
          envInfo={envInfo}
          onSelectProject={(id) => setSelectedProjectId(id)}
          onAddProject={handleAddProject}
          onRemoveProject={handleRemoveProject}
          onOpenVSCode={(path, e) => {
            e.stopPropagation()
            window.electronAPI?.openVSCode(path)
          }}
        />

        {/* 右侧主工作区 */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-dark-950">
          {selectedProject ? (
            <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
              {/* 上部：项目详情与指令面板 (支持滚动，防止被大量 scripts 撑出屏幕) */}
              <div className="flex-shrink-0 max-h-[50vh] overflow-y-auto border-b border-dark-600/60 custom-scrollbar">
                <ProjectDetail
                  project={selectedProject}
                  runningTasks={runningTasks}
                  onRunScript={handleRunScript}
                  onStopScript={handleStopScript}
                  onRefreshProject={handleRefreshProject}
                  onOpenFolder={(path) => window.electronAPI?.openPath(path)}
                  onOpenVSCode={(path) => window.electronAPI?.openVSCode(path)}
                  onChangePackageManager={handleChangePackageManager}
                  onKillPort={handleKillPort}
                />
              </div>

              {/* 下部：极客终端控制台 */}
              <div className="flex-1 min-h-[220px] flex flex-col overflow-hidden">
                <TerminalView
                  activeTaskId={activeTaskId}
                  runningTasks={runningTasks}
                  onStopTask={handleStopScript}
                  onSelectTask={(taskId) => setActiveTaskId(taskId)}
                  onOpenExternal={(url) => window.electronAPI?.openExternal(url)}
                />
              </div>
            </div>
          ) : (
            /* 空状态 */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-dark-400">
              <div className="w-20 h-20 rounded-2xl bg-dark-900 border border-dark-600/80 flex items-center justify-center mb-5 shadow-inner">
                <Boxes className="w-10 h-10 text-dark-400" />
              </div>
              <h2 className="text-xl font-bold text-dark-200 mb-2">未选择前端项目</h2>
              <p className="text-xs text-dark-400 max-w-sm mb-6 leading-relaxed">
                在左侧选择已有项目，或直接点击下方按钮从本地选取前端工程文件夹。支持自动识别 Vite、Webpack、React、Vue 等项目。
              </p>
              <button
                onClick={handleAddProject}
                className="px-5 py-2.5 rounded-lg bg-accent-blue hover:bg-accent-blue/90 text-white text-xs font-semibold flex items-center space-x-2 transition-all shadow-md shadow-accent-blue/20 cursor-pointer"
              >
                <FolderPlus className="w-4 h-4" />
                <span>选择前端项目文件夹</span>
              </button>
            </div>
          )}
        </main>
      </div>

      {/* 端口冲突报警弹窗 */}
      {conflictModal && (
        <PortConflictModal
          conflict={conflictModal}
          onClose={() => setConflictModal(null)}
          onKillAndRestart={handleKillAndRestart}
          onJustKill={async (port) => {
            await handleKillPort(port)
          }}
        />
      )}
    </div>
  )
}
