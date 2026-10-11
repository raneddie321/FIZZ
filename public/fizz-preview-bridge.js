/* FIZZ DEV preview bridge: forwards console output and errors to the workspace. */
(function () {
  if (window.__fizzBridge) return;
  window.__fizzBridge = true;
  var parentWin = window.parent;
  function serialize(v) {
    try {
      if (v instanceof Error) return v.stack || v.message;
      if (typeof v === "object") return JSON.stringify(v, null, 0).slice(0, 2000);
      return String(v).slice(0, 2000);
    } catch (e) {
      return String(v);
    }
  }
  function send(level, args) {
    try {
      parentWin.postMessage({ source: "fizz-preview", type: "console", level: level, args: Array.prototype.map.call(args, serialize), path: location.pathname }, "*");
    } catch (e) {}
  }
  ["log", "info", "warn", "error", "debug"].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      send(level, arguments);
      return original.apply(console, arguments);
    };
  });
  window.addEventListener("error", function (e) {
    send("error", [e.message + (e.filename ? " (" + e.filename.split("/").pop() + ":" + e.lineno + ")" : "")]);
  });
  window.addEventListener("unhandledrejection", function (e) {
    send("error", ["Unhandled promise rejection: " + serialize(e.reason)]);
  });
  window.addEventListener("load", function () {
    try {
      parentWin.postMessage({ source: "fizz-preview", type: "loaded", path: location.pathname, title: document.title }, "*");
    } catch (e) {}
  });
})();
