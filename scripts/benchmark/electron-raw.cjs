const { ipcRenderer } = require("electron");
ipcRenderer.on("benchmark:port", (/** @type {Electron.IpcRendererEvent} */ event) => {
  window.postMessage({ type: "benchmark:port" }, "*", event.ports);
});
