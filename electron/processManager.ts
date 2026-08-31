import { spawn, ChildProcess } from 'node:child_process'
import treeKill from 'tree-kill'
import { BrowserWindow } from 'electron'
import { RunningTask, PortConflictInfo } from '../src/types'
import { getProcessByPort } from './portManager'

export class ProcessManager {
  private tasks = new Map<string, {
    task: RunningTask
    process: ChildProcess
    outputBuffer: string[]
  }>()

  private win: BrowserWindow | null = null

  setWindow(win: BrowserWindow) {
    this.win = win
  }

  getRunningTasks(): RunningTask[] {
    return Array.from(this.tasks.values()).map(item => item.task)
  }

  getTask(taskId: string): RunningTask | undefined {
    return this.tasks.get(taskId)?.task
  }

  getTaskLogs(taskId: string): string[] {
    return this.tasks.get(taskId)?.outputBuffer || []
  }

  async runScript(
    projectId: string,
    scriptName: string,
    projectPath: string,
    packageManager: string,
    customArgs?: string
  ): Promise<{ success: boolean; taskId: string; message?: string }> {
    const taskId = `${projectId}::${scriptName}`

    // 如果已经在运行，先停止
    if (this.tasks.has(taskId)) {
      await this.stopScript(taskId)
    }

    const command = `${packageManager} run ${scriptName}${customArgs ? ` ${customArgs}` : ''}`
    const isWin = process.platform === 'win32'
    
    // Windows 下通过 cmd.exe /s /c 启动以保证环境变量和 .cmd 脚本支持
    const shellCmd = isWin ? 'cmd.exe' : (process.env.SHELL || '/bin/sh')
    const shellArgs = isWin ? ['/d', '/s', '/c', command] : ['-c', command]

    try {
      const child = spawn(shellCmd, shellArgs, {
        cwd: projectPath,
        env: {
          ...process.env,
          FORCE_COLOR: '1', // 强制保持 ANSI 颜色输出
          NPM_CONFIG_COLOR: 'always',
        },
        windowsHide: true,
      })

      const taskInfo: RunningTask = {
        taskId,
        projectId,
        scriptName,
        command,
        pid: child.pid,
        startTime: Date.now(),
        status: 'running',
      }

      this.tasks.set(taskId, {
        task: taskInfo,
        process: child,
        outputBuffer: [],
      })

      this.notifyTaskStatusChange(taskInfo)

      const handleData = (data: Buffer | string) => {
        const text = data.toString()
        const record = this.tasks.get(taskId)
        if (record) {
          record.outputBuffer.push(text)
          if (record.outputBuffer.length > 3000) {
            record.outputBuffer.shift()
          }
        }
        
        // 推送终端输出
        this.win?.webContents.send('terminal:data', { taskId, data: text })

        // 智能分析端口占用
        this.detectPortConflict(text, taskId, projectId, scriptName)
      }

      child.stdout?.on('data', handleData)
      child.stderr?.on('data', handleData)

      child.on('error', (err) => {
        const errorMsg = `\r\n\x1b[31m[LaunchPad 进程启动错误]: ${err.message}\x1b[0m\r\n`
        handleData(errorMsg)
        
        const record = this.tasks.get(taskId)
        if (record) {
          record.task.status = 'error'
          this.notifyTaskStatusChange(record.task)
        }
      })

      child.on('close', (code) => {
        const record = this.tasks.get(taskId)
        if (record) {
          record.task.status = 'stopped'
          record.task.exitCode = code
          this.notifyTaskStatusChange(record.task)
          this.tasks.delete(taskId)
        }
        const exitMsg = `\r\n\x1b[90m[LaunchPad 进程已结束，退出码: ${code}]\x1b[0m\r\n`
        this.win?.webContents.send('terminal:data', { taskId, data: exitMsg })
      })

      return { success: true, taskId }
    } catch (e: any) {
      return { success: false, taskId, message: e.message }
    }
  }

  async stopScript(taskId: string): Promise<{ success: boolean; message?: string }> {
    const record = this.tasks.get(taskId)
    if (!record || !record.process.pid) {
      return { success: true, message: '进程未运行' }
    }

    record.task.status = 'stopping'
    this.notifyTaskStatusChange(record.task)

    return new Promise((resolve) => {
      const pid = record.process.pid!
      treeKill(pid, 'SIGKILL', (err) => {
        if (err) {
          console.error(`Failed to kill process tree for PID ${pid}:`, err)
        }
        record.task.status = 'stopped'
        this.notifyTaskStatusChange(record.task)
        this.tasks.delete(taskId)
        
        const stopMsg = `\r\n\x1b[33m[LaunchPad 已主动终止该进程树 (PID: ${pid})]\x1b[0m\r\n`
        this.win?.webContents.send('terminal:data', { taskId, data: stopMsg })
        
        resolve({ success: true })
      })
    })
  }

  async stopAll(): Promise<void> {
    const promises = Array.from(this.tasks.keys()).map((taskId) => this.stopScript(taskId))
    await Promise.all(promises)
  }

  private notifyTaskStatusChange(task: RunningTask) {
    this.win?.webContents.send('task:status-change', task)
  }

  /**
   * 自动从日志中识别常见端口占用报错
   */
  private async detectPortConflict(logText: string, taskId: string, projectId: string, scriptName: string) {
    // 匹配如:
    // EADDRINUSE: address already in use :::5173
    // EADDRINUSE 0.0.0.0:3000
    // Port 5173 is in use
    // Port 3000 is already in use
    // Something is already running on port 3000
    // listen EADDRINUSE: address already in use 127.0.0.1:8080
    const patterns = [
      /EADDRINUSE.*?[:\s](\d{2,5})\b/i,
      /port\s+(\d{2,5})\s+is\s+(already\s+)?in\s+use/i,
      /already\s+running\s+on\s+port\s+(\d{2,5})/i,
      /address\s+already\s+in\s+use.*?[:\s](\d{2,5})\b/i,
    ]

    for (const pattern of patterns) {
      const match = logText.match(pattern)
      if (match && match[1]) {
        const port = parseInt(match[1], 10)
        if (port > 0 && port < 65536) {
          const processInfo = await getProcessByPort(port)
          const conflict: PortConflictInfo = {
            taskId,
            projectId,
            scriptName,
            port,
            pid: processInfo?.pid,
            processName: processInfo?.processName,
            message: `检测到端口 ${port} 被占用${processInfo ? ` (占用进程: ${processInfo.processName}, PID: ${processInfo.pid})` : ''}导致运行失败。`,
          }
          this.win?.webContents.send('port:conflict', conflict)
          break
        }
      }
    }
  }
}

export const processManager = new ProcessManager()
