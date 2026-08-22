/**
 * The renderer runs with context isolation on and no Node access. This exposes
 * the few specific things the pages need from the main process, never a
 * general bridge.
 *
 * Backup and restore live here rather than in a Server Action for a concrete
 * reason: a Server Action runs inside the Next.js child process, which is
 * connected to the very database being replaced -- and on Windows a directory
 * cannot be renamed while anything has a file open inside it.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  dataFolder: () => ipcRenderer.invoke('data-folder'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  backup: () => ipcRenderer.invoke('backup-to-folder'),
  restore: () => ipcRenderer.invoke('restore-from-folder'),
});
