import { exec } from 'node:child_process'
import util from 'node:util'

const execPromise = util.promisify(exec)

export interface PortProcessInfo {
  port: number
  pid: number
  processName: string
}

/**
 * 获取指定端口的占用 PID 及进程名
 */
export async function getProcessByPort(port: number): Promise<PortProcessInfo | null> {
  const isWin = process.platform === 'win32'
  try {
    if (isWin) {
      // Windows: netstat -ano -p tcp
      const { stdout } = await execPromise(`netstat -ano -p tcp | findstr :${port}`)
      const lines = stdout.split('\r\n').map(l => l.trim()).filter(Boolean)
      
      for (const line of lines) {
        // 匹配 LISTENING 状态或确切匹配端口
        const parts = line.split(/\s+/)
        if (parts.length >= 4) {
          const localAddr = parts[1]
          const state = parts[3]
          const pidStr = parts[parts.length - 1]
          
          if (localAddr.endsWith(`:${port}`) && (state === 'LISTENING' || state === 'ESTABLISHED' || !isNaN(Number(pidStr)))) {
            const pid = parseInt(pidStr, 10)
            if (pid && pid > 0) {
              let processName = 'Unknown'
              try {
                const { stdout: taskOut } = await execPromise(`tasklist /fi "PID eq ${pid}" /fo csv /nh`)
                const taskLine = taskOut.trim()
                if (taskLine) {
                  const match = taskLine.match(/^"([^"]+)"/)
                  if (match) {
                    processName = match[1]
                  }
                }
              } catch {
                // ignore
              }
              return { port, pid, processName }
            }
          }
        }
      }
    } else {
      // macOS / Linux
      const { stdout } = await execPromise(`lsof -i :${port} -t`)
      const pids = stdout.trim().split('\n').filter(Boolean)
      if (pids.length > 0) {
        const pid = parseInt(pids[0], 10)
        let processName = 'Unknown'
        try {
          const { stdout: psOut } = await execPromise(`ps -p ${pid} -o comm=`)
          processName = psOut.trim() || 'Unknown'
        } catch {
          // ignore
        }
        return { port, pid, processName }
      }
    }
  } catch {
    // Port not in use or command error
  }
  return null
}

/**
 * 杀死占用指定端口的进程
 */
export async function killPort(port: number): Promise<{ success: boolean; pid?: number; message?: string }> {
  const isWin = process.platform === 'win32'
  try {
    const info = await getProcessByPort(port)
    if (!info) {
      return { success: true, message: `端口 ${port} 未被占用或已释放` }
    }

    if (isWin) {
      await execPromise(`taskkill /F /PID ${info.pid} /T`)
    } else {
      await execPromise(`kill -9 ${info.pid}`)
    }

    return {
      success: true,
      pid: info.pid,
      message: `已成功终止占用端口 ${port} 的进程: ${info.processName} (PID: ${info.pid})`,
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      message: `释放端口 ${port} 失败: ${errorMsg}`,
    }
  }
}
