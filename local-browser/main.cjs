const { app, BrowserWindow, BrowserView, ipcMain, safeStorage, shell } = require("electron");
const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");

let win, view, server, pairCode = "", sessionKey = "", browserTabs = new Map(), activeId = null;
const PORT = 47831;
const sensitive = /(?:card.?number|cc.?number|cvc|cvv|security.?code|expiry|expiration|cardholder|payment.?card|ס.?כרטיס|תוקף|קוד.?אבטחה)/i;

function id(){ return crypto.randomBytes(12).toString("hex"); }
function safeUrl(raw){
  const u = new URL(raw);
  if(!["http:","https:"].includes(u.protocol)) throw new Error("Only HTTP and HTTPS pages are allowed");
  if(u.username || u.password) throw new Error("Credentials in URLs are blocked");
  return u.href;
}
function createTab(raw){
  const url = safeUrl(raw || "https://duckduckgo.com");
  const tabId=id();
  const v=new BrowserView({webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true, javascript:true}});
  v.webContents.setWindowOpenHandler(({url})=>{ try { createTab(url); } catch{} return {action:"deny"}; });
  v.webContents.on("will-navigate",(event,url)=>{try{safeUrl(url)}catch{event.preventDefault()}});
  v.webContents.on("page-title-updated",()=>sendTabs());
  v.webContents.on("did-navigate",()=>sendTabs());
  browserTabs.set(tabId,{id:tabId,view:v});
  win.addBrowserView(v);
  v.setBounds({x:0,y:76,width:win.getContentBounds().width,height:win.getContentBounds().height-76});
  v.setAutoResize({width:true,height:true});
  v.webContents.loadURL(url);
  activeId=tabId; sendTabs(); return tabId;
}
function sendTabs(){ if(!win || win.isDestroyed()) return; win.webContents.send("tabs", [...browserTabs.values()].map(t=>({id:t.id,title:t.view.webContents.getTitle(),url:t.view.webContents.getURL(),active:t.id===activeId}))); }
function active(){const t=browserTabs.get(activeId); if(!t) throw new Error("No active tab"); return t.view.webContents;}
function scrubPage(){
  return active().executeJavaScript(`(() => {
    const secret = el => {
      const meta = [el.type,el.name,el.id,el.autocomplete,el.getAttribute('aria-label'),el.placeholder,el.labels?.[0]?.innerText].join(' ');
      return /password|cc-number|cc-exp|cc-csc|card.?number|cvv|cvc|security.?code|cardholder|payment.?card/i.test(meta) ||
        el.type === 'password' || el.autocomplete?.startsWith('cc-');
    };
    const els=[...document.querySelectorAll('a,button,input,textarea,select,[role=button]')].slice(0,180).map((el,i)=>({
      id:i+1,tag:el.tagName.toLowerCase(),type:el.type||'',label:(el.getAttribute('aria-label')||el.labels?.[0]?.innerText||el.innerText||el.placeholder||'').trim().slice(0,80),
      value:secret(el)?'':('value' in el?String(el.value||'').slice(0,50):'')
    }));
    const text=(document.body?.innerText||'').replace(/\\s+/g,' ').replace(/(?:\\b\\d[ -]*?){13,19}\\b/g,'[redacted payment-like number]').slice(0,10000);
    return {url:location.href,title:document.title,text,elements:els};
  })()`,true);
}
async function command(action,args={}){
  if(action==="open") return {tab:createTab(args.url)};
  if(action==="tabs") return [...browserTabs.values()].map(t=>({id:t.id,title:t.view.webContents.getTitle(),url:t.view.webContents.getURL(),active:t.id===activeId}));
  if(action==="switch"){ if(!browserTabs.has(args.tab)) throw new Error("Unknown tab"); activeId=args.tab; win.setTopBrowserView(browserTabs.get(activeId).view); sendTabs(); return {ok:true};}
  if(action==="close"){const t=browserTabs.get(args.tab); if(!t) return {ok:true}; win.removeBrowserView(t.view); t.view.webContents.destroy(); browserTabs.delete(args.tab); if(activeId===args.tab) activeId=browserTabs.keys().next().value||null; sendTabs(); return {ok:true};}
  const wc=active();
  if(action==="read") return scrubPage();
  if(action==="back"){if(wc.canGoBack()) wc.goBack(); return {ok:true};}
  if(action==="forward"){if(wc.canGoForward()) wc.goForward(); return {ok:true};}
  if(action==="reload"){wc.reload();return {ok:true};}
  if(action==="scroll"){return wc.executeJavaScript("window.scrollBy(0,"+(args.direction==="up"?-600:600)+")").then(()=>({ok:true}));}
  if(action==="handoff") {win.show();win.focus();return {ok:true};}
  if(["click","type","select","key","script","autofill","pay"].includes(action)) {
    if(action==="type" || action==="autofill" || action==="pay") throw new Error("Typing secrets and payments are disabled in the local agent bridge. Complete them manually in the browser.");
    if(action==="script") throw new Error("Page scripting is disabled in the local companion bridge.");
    if(action==="click") return wc.executeJavaScript(`(() => {const e=[...document.querySelectorAll('a,button,input,textarea,select,[role=button]')][${Number(args.id)-1}]; if(!e) return false; e.click(); return true})()`).then(ok=>({ok}));
    if(action==="select") return wc.executeJavaScript(`(() => {const e=[...document.querySelectorAll('select')][${Number(args.id)-1}];if(!e)return false;e.value=${JSON.stringify(String(args.value||""))};e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`).then(ok=>({ok}));
    if(action==="key" && ["Enter","Escape","Tab","ArrowDown","ArrowUp"].includes(args.key)) { wc.sendInputEvent({type:"keyDown",keyCode:args.key});wc.sendInputEvent({type:"keyUp",keyCode:args.key});return {ok:true}; }
  }
  throw new Error("Unsupported local browser action");
}
function auth(req){
  const origin=req.headers.origin||"";
  if(origin && origin!=="https://fizz.raneddie.com" && origin!=="https://fizzbrowser.vercel.app" && origin!=="http://localhost:3000") return false;
  const token=req.headers["x-fizz-local-token"]||"";
  return token.length===sessionKey.length && crypto.timingSafeEqual(Buffer.from(token),Buffer.from(sessionKey));
}
function startServer(){
  pairCode=String(crypto.randomInt(100000,999999));
  sessionKey=crypto.randomBytes(32).toString("base64url");
  server=http.createServer(async(req,res)=>{
    res.setHeader("Access-Control-Allow-Origin","https://fizz.raneddie.com");
    res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type,X-Fizz-Local-Token");
    res.setHeader("Cache-Control","no-store");
    if(req.method==="OPTIONS"){res.writeHead(204);return res.end();}
    if(!auth(req)){res.writeHead(401);return res.end(JSON.stringify({error:"Unauthorized"}));}
    try{
      if(req.method==="GET" && req.url==="/status"){res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify({ready:true,paired:Boolean(sessionKey),port:PORT}));}
      if(req.method==="POST" && req.url==="/pair"){
        let b=""; for await(const c of req)b+=c; const d=JSON.parse(b||"{}");
        if(d.code!==pairCode) {res.writeHead(403);return res.end(JSON.stringify({error:"Invalid pairing code"}));}
        res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify({token:sessionKey,expiresIn:3600}));
      }
      if(req.method==="POST" && req.url==="/command"){
        let b="";for await(const c of req)b+=c;const d=JSON.parse(b||"{}");
        const result=await command(String(d.action||""),d.args||{});
        res.writeHead(200,{"Content-Type":"application/json"});return res.end(JSON.stringify(result));
      }
      res.writeHead(404);res.end(JSON.stringify({error:"Not found"}));
    }catch(e){res.writeHead(400,{"Content-Type":"application/json"});res.end(JSON.stringify({error:String(e.message||e)}));}
  });
  server.listen(PORT,"127.0.0.1");
}
function createWindow(){
  win=new BrowserWindow({width:1280,height:850,minWidth:850,minHeight:600,title:"FIZZ Local Browser",webPreferences:{preload:path.join(__dirname,"preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.loadFile(path.join(__dirname,"renderer/index.html"));
  win.on("resize",()=>{const t=browserTabs.get(activeId);if(t)t.view.setBounds({x:0,y:76,width:win.getContentBounds().width,height:win.getContentBounds().height-76});});
  createTab("https://duckduckgo.com");
}
app.whenReady().then(()=>{startServer();createWindow();});
app.on("window-all-closed",()=>{if(server)server.close();app.quit();});
ipcMain.handle("pair-code",()=>pairCode);
ipcMain.handle("browser-command",(_,action,args)=>command(action,args));
ipcMain.handle("open-external",(_,url)=>shell.openExternal(safeUrl(url)));
