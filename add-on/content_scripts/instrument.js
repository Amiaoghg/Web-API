
(function () {
    "use strict";

    const consoleLog = window.console.log;
    const cookies2 = window.Cookies.noConflict();
    const {constants, cookieEncodingLib, enums} = window.WEB_API_MANAGER;
    const {browserLib, proxyBlockLib} = window.WEB_API_MANAGER;
    const standardsCookieName = constants.cookieName;

    const doc = window.document;
    const script = doc.createElement("script");
    const rootElm = doc.head || doc.documentElement;

 
    let domainPref;

    try {
        domainPref = cookies2.get(standardsCookieName);
        cookies2.remove(standardsCookieName, {path: window.document.location.pathname});
    } catch (e) {
       
    }

    if (!domainPref) {
        if (window.localStorage) {
            domainPref = window.localStorage[standardsCookieName];
        }
    } else {
      
        window.localStorage[standardsCookieName] = domainPref;
    }

    if (!domainPref) {
        consoleLog.call(console, `Unable to find Web API Manager settings: ${doc.location.href}`);
        return;
    }

    const decodedCookieValues = cookieEncodingLib.fromCookieValue(domainPref);
    const [standardIdsToBlock, shouldLog, blockCrossFrame, randNonce] = decodedCookieValues;

   
    if (standardIdsToBlock.length === 0 &&
            shouldLog !== enums.ShouldLogVal.PASSIVE) {
        return;
    }

    const [scriptToInject, ignore] = proxyBlockLib.generateScriptPayload(
        standardIdsToBlock,
        shouldLog,
        blockCrossFrame,
        randNonce
    );

    const eventName = "__wamEvent" + randNonce;
    doc.addEventListener(eventName, event => {
        browserLib.getRootObject().runtime.sendMessage(["blockedFeature", event.detail]);
    });

    script.appendChild(doc.createTextNode(scriptToInject));
    rootElm.appendChild(script);
}());
