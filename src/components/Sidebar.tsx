import React, { useState } from 'react'
import {
  FolderPlus,
  Folder,
  Trash2,
  Code2,
  Search,
  Activity,
} from 'lucide-react'
import { ProjectItem, RunningTask, SystemEnvInfo } from '../types'
import { getFrameworkBadgeClass } from '../utils/colors'

interface SidebarProps {
  projects: ProjectItem[]
  selectedProjectId: string | null
  runningTasks: RunningTask[]
  envInfo: SystemEnvInfo | null
  onSelectProject: (projectId: string) => void
  onAddProject: () => void
  onRemoveProject: (projectId: string, e: React.MouseEvent) => void
  onOpenVSCode: (projectPath: string, e: React.MouseEvent) => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  projects,
  selectedProjectId,
  runningTasks,
  envInfo,
  onSelectProject,
  onAddProject,
  onRemoveProject,
  onOpenVSCode,
}) => {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.path.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isProjectRunning = (projectId: string) => {
    return runningTasks.some((t) => t.projectId === projectId && t.status === 'running')
  }

  return (
    <aside className="w-72 h-full min-h-0 flex flex-col bg-dark-900 border-r border-dark-600/60 select-none flex-shrink-0">
      {/* 侧边栏顶部搜索与添加操作 */}
      <div className="p-3 space-y-2 border-b border-dark-600/60 bg-dark-900/90 flex-shrink-0">
        <button
          onClick={onAddProject}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-accent-blue hover:bg-blue-600 text-white font-medium text-xs transition-all shadow-md shadow-accent-blue/20 hover:shadow-accent-blue/30 active:scale-[0.98] cursor-pointer"
        >
          <FolderPlus className="w-4 h-4" />
          添加前端项目
        </button>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder="搜索项目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-dark-950 border border-dark-600/60 rounded-md pl-8 pr-2.5 py-1.5 text-xs text-dark-200 placeholder-dark-500 focus:outline-none focus:border-accent-blue/70 transition-colors"
          />
        </div>
      </div>

      {/* 项目列表 (自适应高度滚动区) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {filteredProjects.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-dark-500">
            <Folder className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">
              {projects.length === 0 ? '暂无项目，点击上方添加' : '无匹配项目'}
            </p>
          </div>
        ) : (
          filteredProjects.map((project) => {
            const isSelected = project.id === selectedProjectId
            const running = isProjectRunning(project.id)

            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`group relative flex flex-col p-2.5 rounded-lg cursor-pointer transition-all border ${
                  isSelected
                    ? 'bg-dark-800 border-dark-500/80 shadow-sm'
                    : 'bg-transparent border-transparent hover:bg-dark-850 hover:border-dark-600/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2 min-w-0 pr-2">
                    <span className="relative flex h-2 w-2 flex-shrink-0">
                      {running ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green"></span>
                        </>
                      ) : (
                        <span className="inline-flex rounded-full h-2 w-2 bg-dark-500"></span>
                      )}
                    </span>
                    <span className="font-medium text-xs text-dark-100 truncate">
                      {project.name}
                    </span>
                  </div>

                  <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 transition-opacity">
                    <button
                      title="在 VSCode 中打开"
                      onClick={(e) => onOpenVSCode(project.path, e)}
                      className="p-1 rounded hover:bg-dark-700 text-dark-400 hover:text-accent-blue"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      title="从列表移除"
                      onClick={(e) => onRemoveProject(project.id, e)}
                      className="p-1 rounded hover:bg-dark-700 text-dark-400 hover:text-accent-rose"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-dark-400 truncate mb-1.5 font-mono">
                  {project.path}
                </div>

                {project.frameworks.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {project.frameworks.slice(0, 3).map((fw) => (
                      <span
                        key={fw}
                        className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${getFrameworkBadgeClass(
                          fw
                        )}`}
                      >
                        {fw}
                      </span>
                    ))}
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-dark-600 bg-dark-950 text-dark-400 font-mono">
                      {project.packageManager}
                    </span>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 底部环境信息 */}
      <div className="p-3 border-t border-dark-600/60 bg-dark-950/70 text-[11px] text-dark-400 space-y-1.5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-accent-green" /> 活跃进程
          </span>
          <span className="font-mono text-dark-200">
            {runningTasks.filter((t) => t.status === 'running').length}
          </span>
        </div>
        {envInfo && (
          <div className="flex items-center justify-between text-[10px] text-dark-500 font-mono">
            <span>Node {envInfo.nodeVersion}</span>
            <span>{envInfo.pnpmVersion ? `pnpm ${envInfo.pnpmVersion}` : `npm ${envInfo.npmVersion}`}</span>
          </div>
        )}
      </div>
    </aside>
  )
}
