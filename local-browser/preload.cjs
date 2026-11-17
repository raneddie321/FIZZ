const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("fizzLocal",{pairCode:()=>ipcRenderer.invoke("pair-code"),command:(action,args)=>ipcRenderer.invoke("browser-command",action,args),openExternal:url=>ipcRenderer.invoke("open-external",url),onTabs:fn=>ipcRenderer.on("tabs",(_,tabs)=>fn(tabs))});
