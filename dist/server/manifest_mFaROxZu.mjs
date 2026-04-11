import { d as decodeKey } from './chunks/astro/server_Duwb4HEG.mjs';
import { N as NOOP_MIDDLEWARE_FN } from './chunks/astro-designed-error-pages_BJdSplhW.mjs';

function sanitizeParams(params) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, value.normalize().replace(/#/g, "%23").replace(/\?/g, "%3F")];
      }
      return [key, value];
    })
  );
}
function getParameter(part, params) {
  if (part.spread) {
    return params[part.content.slice(3)] || "";
  }
  if (part.dynamic) {
    if (!params[part.content]) {
      throw new TypeError(`Missing parameter: ${part.content}`);
    }
    return params[part.content];
  }
  return part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]");
}
function getSegment(segment, params) {
  const segmentPath = segment.map((part) => getParameter(part, params)).join("");
  return segmentPath ? "/" + segmentPath : "";
}
function getRouteGenerator(segments, addTrailingSlash) {
  return (params) => {
    const sanitizedParams = sanitizeParams(params);
    let trailing = "";
    if (addTrailingSlash === "always" && segments.length) {
      trailing = "/";
    }
    const path = segments.map((segment) => getSegment(segment, sanitizedParams)).join("") + trailing;
    return path || "/";
  };
}

function deserializeRouteData(rawRouteData) {
  return {
    route: rawRouteData.route,
    type: rawRouteData.type,
    pattern: new RegExp(rawRouteData.pattern),
    params: rawRouteData.params,
    component: rawRouteData.component,
    generate: getRouteGenerator(rawRouteData.segments, rawRouteData._meta.trailingSlash),
    pathname: rawRouteData.pathname || void 0,
    segments: rawRouteData.segments,
    prerender: rawRouteData.prerender,
    redirect: rawRouteData.redirect,
    redirectRoute: rawRouteData.redirectRoute ? deserializeRouteData(rawRouteData.redirectRoute) : void 0,
    fallbackRoutes: rawRouteData.fallbackRoutes.map((fallback) => {
      return deserializeRouteData(fallback);
    }),
    isIndex: rawRouteData.isIndex,
    origin: rawRouteData.origin
  };
}

function deserializeManifest(serializedManifest) {
  const routes = [];
  for (const serializedRoute of serializedManifest.routes) {
    routes.push({
      ...serializedRoute,
      routeData: deserializeRouteData(serializedRoute.routeData)
    });
    const route = serializedRoute;
    route.routeData = deserializeRouteData(serializedRoute.routeData);
  }
  const assets = new Set(serializedManifest.assets);
  const componentMetadata = new Map(serializedManifest.componentMetadata);
  const inlinedScripts = new Map(serializedManifest.inlinedScripts);
  const clientDirectives = new Map(serializedManifest.clientDirectives);
  const serverIslandNameMap = new Map(serializedManifest.serverIslandNameMap);
  const key = decodeKey(serializedManifest.key);
  return {
    // in case user middleware exists, this no-op middleware will be reassigned (see plugin-ssr.ts)
    middleware() {
      return { onRequest: NOOP_MIDDLEWARE_FN };
    },
    ...serializedManifest,
    assets,
    componentMetadata,
    inlinedScripts,
    clientDirectives,
    routes,
    serverIslandNameMap,
    key
  };
}

const manifest = deserializeManifest({"hrefRoot":"file:///home/matiasdiez/Web/trabajo/distrizen/app/","cacheDir":"file:///home/matiasdiez/Web/trabajo/distrizen/app/node_modules/.astro/","outDir":"file:///home/matiasdiez/Web/trabajo/distrizen/app/dist/","srcDir":"file:///home/matiasdiez/Web/trabajo/distrizen/app/src/","publicDir":"file:///home/matiasdiez/Web/trabajo/distrizen/app/public/","buildClientDir":"file:///home/matiasdiez/Web/trabajo/distrizen/app/dist/client/","buildServerDir":"file:///home/matiasdiez/Web/trabajo/distrizen/app/dist/server/","adapterName":"@astrojs/node","routes":[{"file":"","links":[],"scripts":[],"styles":[],"routeData":{"type":"page","component":"_server-islands.astro","params":["name"],"segments":[[{"content":"_server-islands","dynamic":false,"spread":false}],[{"content":"name","dynamic":true,"spread":false}]],"pattern":"^\\/_server-islands\\/([^/]+?)\\/?$","prerender":false,"isIndex":false,"fallbackRoutes":[],"route":"/_server-islands/[name]","origin":"internal","_meta":{"trailingSlash":"ignore"}}},{"file":"clasificar/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/clasificar","isIndex":false,"type":"page","pattern":"^\\/clasificar\\/?$","segments":[[{"content":"clasificar","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/clasificar.astro","pathname":"/clasificar","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"settings/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/settings","isIndex":false,"type":"page","pattern":"^\\/settings\\/?$","segments":[[{"content":"settings","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/settings.astro","pathname":"/settings","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"stock/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/stock","isIndex":false,"type":"page","pattern":"^\\/stock\\/?$","segments":[[{"content":"stock","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/stock.astro","pathname":"/stock","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"swipe/index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/swipe","isIndex":false,"type":"page","pattern":"^\\/swipe\\/?$","segments":[[{"content":"swipe","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/swipe.astro","pathname":"/swipe","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}},{"file":"index.html","links":[],"scripts":[],"styles":[],"routeData":{"route":"/","isIndex":true,"type":"page","pattern":"^\\/$","segments":[],"params":[],"component":"src/pages/index.astro","pathname":"/","prerender":true,"fallbackRoutes":[],"distURL":[],"origin":"project","_meta":{"trailingSlash":"ignore"}}}],"base":"/","trailingSlash":"ignore","compressHTML":true,"componentMetadata":[["/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/clasificar.astro",{"propagation":"none","containsHead":true}],["/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/settings.astro",{"propagation":"none","containsHead":true}],["/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/stock.astro",{"propagation":"none","containsHead":true}],["/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/swipe.astro",{"propagation":"none","containsHead":true}],["/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/index.astro",{"propagation":"none","containsHead":true}]],"renderers":[],"clientDirectives":[["idle","(()=>{var l=(n,t)=>{let i=async()=>{await(await n())()},e=typeof t.value==\"object\"?t.value:void 0,s={timeout:e==null?void 0:e.timeout};\"requestIdleCallback\"in window?window.requestIdleCallback(i,s):setTimeout(i,s.timeout||200)};(self.Astro||(self.Astro={})).idle=l;window.dispatchEvent(new Event(\"astro:idle\"));})();"],["load","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).load=e;window.dispatchEvent(new Event(\"astro:load\"));})();"],["media","(()=>{var n=(a,t)=>{let i=async()=>{await(await a())()};if(t.value){let e=matchMedia(t.value);e.matches?i():e.addEventListener(\"change\",i,{once:!0})}};(self.Astro||(self.Astro={})).media=n;window.dispatchEvent(new Event(\"astro:media\"));})();"],["only","(()=>{var e=async t=>{await(await t())()};(self.Astro||(self.Astro={})).only=e;window.dispatchEvent(new Event(\"astro:only\"));})();"],["visible","(()=>{var a=(s,i,o)=>{let r=async()=>{await(await s())()},t=typeof i.value==\"object\"?i.value:void 0,c={rootMargin:t==null?void 0:t.rootMargin},n=new IntersectionObserver(e=>{for(let l of e)if(l.isIntersecting){n.disconnect(),r();break}},c);for(let e of o.children)n.observe(e)};(self.Astro||(self.Astro={})).visible=a;window.dispatchEvent(new Event(\"astro:visible\"));})();"]],"entryModules":{"\u0000noop-middleware":"_noop-middleware.mjs","\u0000virtual:astro:actions/noop-entrypoint":"noop-entrypoint.mjs","\u0000@astro-page:src/pages/clasificar@_@astro":"pages/clasificar.astro.mjs","\u0000@astro-page:src/pages/settings@_@astro":"pages/settings.astro.mjs","\u0000@astro-page:src/pages/stock@_@astro":"pages/stock.astro.mjs","\u0000@astro-page:src/pages/swipe@_@astro":"pages/swipe.astro.mjs","\u0000@astro-page:src/pages/index@_@astro":"pages/index.astro.mjs","\u0000@astrojs-ssr-virtual-entry":"entry.mjs","\u0000@astro-renderers":"renderers.mjs","\u0000@astrojs-ssr-adapter":"_@astrojs-ssr-adapter.mjs","\u0000@astrojs-manifest":"manifest_mFaROxZu.mjs","/home/matiasdiez/Web/trabajo/distrizen/app/node_modules/.pnpm/unstorage@1.17.5/node_modules/unstorage/drivers/fs-lite.mjs":"chunks/fs-lite_COtHaKzy.mjs","@astrojs/svelte/client.js":"_astro/client.svelte.DOUGWbht.js","/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/clasificar.astro?astro&type=script&index=0&lang.ts":"_astro/clasificar.astro_astro_type_script_index_0_lang.BQJkeqkH.js","/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/settings.astro?astro&type=script&index=0&lang.ts":"_astro/settings.astro_astro_type_script_index_0_lang._hn-KuFz.js","/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/stock.astro?astro&type=script&index=0&lang.ts":"_astro/stock.astro_astro_type_script_index_0_lang.CgtJQ0RH.js","/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/swipe.astro?astro&type=script&index=0&lang.ts":"_astro/swipe.astro_astro_type_script_index_0_lang.ZCHUQnIE.js","/home/matiasdiez/Web/trabajo/distrizen/app/src/pages/index.astro?astro&type=script&index=0&lang.ts":"_astro/index.astro_astro_type_script_index_0_lang.DUi9jH32.js","/home/matiasdiez/Web/trabajo/distrizen/app/src/lib/supabase.ts":"_astro/supabase.f6h4yGOA.js","astro:scripts/before-hydration.js":""},"inlinedScripts":[],"assets":["/icon-192.png","/icon-512.png","/icon.svg","/manifest.json","/sw.js","/_astro/FreshnessDot.CKD4SFAQ.js","/_astro/SettingsSheet.C-kHS0c2.css","/_astro/SettingsSheet.DVgQTVsS.js","/_astro/SyncStatus.CnYOVEhk.js","/_astro/clasificar.Bvyi7LvE.css","/_astro/clasificar.astro_astro_type_script_index_0_lang.BQJkeqkH.js","/_astro/client.svelte.DOUGWbht.js","/_astro/idb.BZDzfmqI.js","/_astro/index.CuZeYG9s.css","/_astro/index.astro_astro_type_script_index_0_lang.DUi9jH32.js","/_astro/legacy.0HFIs88M.js","/_astro/render.lJlZG2sg.js","/_astro/settings.2xJPWcIc.css","/_astro/settings.astro_astro_type_script_index_0_lang._hn-KuFz.js","/_astro/stock.BfpGo4jN.css","/_astro/stock.astro_astro_type_script_index_0_lang.CgtJQ0RH.js","/_astro/supabase.f6h4yGOA.js","/_astro/swipe.CzcdQLCd.css","/_astro/swipe.astro_astro_type_script_index_0_lang.ZCHUQnIE.js","/clasificar/index.html","/settings/index.html","/stock/index.html","/swipe/index.html","/index.html"],"buildFormat":"directory","checkOrigin":true,"allowedDomains":[],"actionBodySizeLimit":1048576,"serverIslandNameMap":[],"key":"AVjxFfJiTvn0DktAoWQLUv3d+r1o5h8nbWgq+/dfJaY=","sessionConfig":{"driver":"fs-lite","options":{"base":"/home/matiasdiez/Web/trabajo/distrizen/app/node_modules/.astro/sessions"}}});
if (manifest.sessionConfig) manifest.sessionConfig.driverModule = () => import('./chunks/fs-lite_COtHaKzy.mjs');

export { manifest };
