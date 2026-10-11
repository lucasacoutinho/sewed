const { ipcRenderer } = require("electron");
ipcRenderer.on("benchmark:port", (event) => {
  window.postMessage({ type: "benchmark:port" }, "*", event.ports);
});
