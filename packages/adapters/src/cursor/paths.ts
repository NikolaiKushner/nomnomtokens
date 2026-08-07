import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Resolve Cursor's user-data directories across platforms.
 *
 * Cursor follows the VS Code layout:
 *   macOS:   ~/Library/Application Support/Cursor
 *   Linux:   ~/.config/Cursor
 *   Windows: %APPDATA%/Cursor
 */
export function cursorUserDataDir(): string {
  if (process.env.CURSOR_USER_DATA_DIR) return process.env.CURSOR_USER_DATA_DIR

  const home = homedir()
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Cursor')
  }
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return join(appdata, 'Cursor')
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'Cursor')
}

export function cursorGlobalStorageDir(userData = cursorUserDataDir()): string {
  return join(userData, 'User', 'globalStorage')
}

export function cursorStateDbPath(userData = cursorUserDataDir()): string {
  return join(cursorGlobalStorageDir(userData), 'state.vscdb')
}

export function cursorWorkspaceStorageDir(userData = cursorUserDataDir()): string {
  return join(userData, 'User', 'workspaceStorage')
}

export function cursorStateDbExists(userData = cursorUserDataDir()): boolean {
  return existsSync(cursorStateDbPath(userData))
}

/**
 * Turn a VS Code folder URI into a filesystem path.
 * `file:///Users/me/app` → `/Users/me/app`
 * Remote URIs (ssh-remote, etc.) are returned as-is for hashing/labeling.
 */
export function pathFromFolderUri(uri: string | null | undefined): string | null {
  if (!uri || typeof uri !== 'string') return null
  if (uri.startsWith('file://')) {
    try {
      return decodeURIComponent(uri.slice('file://'.length))
    } catch {
      return uri.slice('file://'.length)
    }
  }
  return uri
}

/** Last path segment for the local scopes label — never reconstruct a full path. */
export function labelFromWorkspacePath(path: string): string {
  const cleaned = path.replace(/[/\\]+$/, '')
  const parts = cleaned.split(/[/\\]/).filter(Boolean)
  const last = parts[parts.length - 1]
  if (!last) return 'workspace'
  // vscode-remote://…/home/user/proj → proj
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}
