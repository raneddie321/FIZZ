/* FIZZ DEV design inspector: lets the workspace select elements and preview style edits. */
(function () {
  if (window.__fizzInspector) return;
  window.__fizzInspector = true;
  var parentWin = window.parent;
  var hoverBox = document.createElement("div");
  var selectBox = document.createElement("div");
  [hoverBox, selectBox].forEach(function (b) {
    b.setAttribute("data-fizz-injected", "");
    b.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;border-radius:2px;transition:all 60ms ease-out;display:none;";
  });
  hoverBox.style.outline = "1.5px dashed #22c3dc";
  selectBox.style.outline = "2px solid #0b8fa8";
  selectBox.style.background = "rgba(34,195,220,0.08)";
  document.documentElement.appendChild(hoverBox);
  document.documentElement.appendChild(selectBox);
  var selected = null;

  function isInjected(el) {
    return el && el.hasAttribute && el.hasAttribute("data-fizz-injected");
  }
  // Path of element-child indices from <html>, skipping nodes FIZZ injected.
  function pathOf(el) {
    var path = [];
    while (el && el !== document.documentElement) {
      var parent = el.parentElement;
      if (!parent) return null;
      var idx = 0;
      for (var i = 0; i < parent.children.length; i++) {
        var c = parent.children[i];
        if (c === el) break;
        if (!isInjected(c)) idx++;
      }
      path.unshift(idx);
      el = parent;
    }
    return path;
  }
  function elementAt(path) {
    var el = document.documentElement;
    for (var i = 0; i < path.length; i++) {
      var kids = Array.prototype.filter.call(el.children, function (c) { return !isInjected(c); });
      el = kids[path[i]];
      if (!el) return null;
    }
    return el;
  }
  function place(box, el) {
    if (!el) { box.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
  }
  var STYLE_KEYS = ["color", "backgroundColor", "fontSize", "fontWeight", "fontFamily", "lineHeight", "textAlign", "padding", "margin", "borderRadius", "border", "width", "height", "display", "gap", "justifyContent", "alignItems", "flexDirection", "opacity"];
  function describe(el) {
    var cs = getComputedStyle(el);
    var computed = {};
    STYLE_KEYS.forEach(function (k) { computed[k] = cs[k]; });
    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) attrs[el.attributes[i].name] = el.attributes[i].value;
    var onlyText = el.children.length === 0;
    return {
      path: pathOf(el),
      tagName: el.tagName.toLowerCase(),
      attributes: attrs,
      inlineStyle: el.getAttribute("style") || "",
      computed: computed,
      text: onlyText ? (el.textContent || "").slice(0, 2000) : null,
      outerHTML: el.outerHTML.slice(0, 4000),
      file: location.pathname,
    };
  }
  document.addEventListener("mousemove", function (e) {
    var el = e.target;
    if (!el || isInjected(el) || el === document.documentElement) return;
    place(hoverBox, el);
  }, true);
  document.addEventListener("click", function (e) {
    var el = e.target;
    if (!el || isInjected(el)) return;
    e.preventDefault();
    e.stopPropagation();
    selected = el;
    place(selectBox, el);
    parentWin.postMessage({ source: "fizz-inspector", type: "select", element: describe(el) }, "*");
  }, true);
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);
  window.addEventListener("scroll", function () { place(selectBox, selected); }, true);
  window.addEventListener("resize", function () { place(selectBox, selected); });
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.source !== "fizz-workspace") return;
    if (d.type === "apply-style" && d.path) {
      var el = elementAt(d.path);
      if (!el) return;
      Object.keys(d.style || {}).forEach(function (k) { el.style[k] = d.style[k]; });
      if (typeof d.text === "string" && el.children.length === 0) el.textContent = d.text;
      place(selectBox, el);
      parentWin.postMessage({ source: "fizz-inspector", type: "select", element: describe(el) }, "*");
    }
    if (d.type === "select-path" && d.path) {
      var target = elementAt(d.path);
      if (target) {
        selected = target;
        place(selectBox, target);
        target.scrollIntoView({ block: "nearest" });
        parentWin.postMessage({ source: "fizz-inspector", type: "select", element: describe(target) }, "*");
      }
    }
    if (d.type === "clear") { selected = null; place(selectBox, null); }
  });
  parentWin.postMessage({ source: "fizz-inspector", type: "ready", file: location.pathname }, "*");
})();
