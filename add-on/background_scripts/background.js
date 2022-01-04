/*global sjcl*/
(function () {
    "use strict";
    const {preferencesLib, constants, messagesLib} = window.WEB_API_MANAGER;
    const {cookieEncodingLib, proxyBlockLib, httpHeadersLib} = window.WEB_API_MANAGER;
    const {browserLib, enums} = window.WEB_API_MANAGER;
    const rootObject = browserLib.getRootObject();

    preferencesLib.load(loadedPrefs => {
        messagesLib.register(loadedPrefs); 
    });
    const updateBrowserActionBadge = tabId => {
        browserLib.getAllFrames({tabId}, frameResults => {
            const frameHosts = frameResults
                .map(frame => {
                    if (frame.errorOccurred === true) {
                        return false;
                    }
                    return window.URI.parse(frame.url).host;
                })
                .filter(url => !!url);

            const uniqueHosts = Array.from(new Set(frameHosts));
            rootObject.browserAction.setBadgeText({
                text: uniqueHosts.length.toString(),
                tabId,
            });
        });
    };

    rootObject.tabs.onUpdated.addListener(tabId => {
        updateBrowserActionBadge(tabId);
    });
    rootObject.tabs.onActivated.addListener(activeInfo => {
        updateBrowserActionBadge(activeInfo.tabId);
    });

    rootObject.webRequest.onCompleted.addListener(details => {
        browserLib.queryTabs({active: true}, activeTabs => {
            activeTabs.forEach(aTab => {
                if (aTab.tabId === details.tabId) {
                    updateBrowserActionBadge(details.tabId);
                }
            });
        });
    }, {urls: ["<all_urls>"]});

    const requestFilter = {
        urls: ["<all_urls>"],
        types: ["main_frame", "sub_frame"],
    };

    const cookieRemoverRegex = new RegExp(constants.cookieName + "=.*?;");

  
    rootObject.webRequest.onBeforeSendHeaders.addListener(details => {
        const newHeaders = details.requestHeaders.map(header => {
            if (header.name.indexOf("Cookie") === -1) {
                return header;
            }

            const cookieValue = header.value;
            header.value = cookieValue.replace(cookieRemoverRegex, "").trim();
            return header;
        });

        return {
            requestHeaders: newHeaders,
        };
    }, requestFilter, ["blocking", "requestHeaders"]);

    rootObject.webRequest.onHeadersReceived.addListener(details => {
        const prefs = preferencesLib.get();
        if (prefs === undefined) {
            return;
        }

 
        const url = details.url;
        const matchingRule = prefs.getRuleForUrl(url);
        const standardIdsToBlock = matchingRule.getStandardIds();
        const shouldLog = prefs.getShouldLog();
        const blockCrossFrame = prefs.getBlockCrossFrame();

        const randBytes = sjcl.random.randomWords(4);
        const randNonce = sjcl.codec.base64.fromBits(randBytes);
        const encodedOptions = cookieEncodingLib.toCookieValue(
            standardIdsToBlock,
            shouldLog,
            blockCrossFrame,
            randNonce
        );

        rootObject.cookies.set({
            url,
            name: constants.cookieName,
            value: encodedOptions,
        });
        if (standardIdsToBlock.length === 0 &&
                shouldLog !== enums.ShouldLogVal.PASSIVE) {
            return;
        }

        const cspDynamicPolicyHeaders = details.responseHeaders
            .filter(httpHeadersLib.isHeaderCSPScriptSrcWithOutUnsafeInline);

        if (cspDynamicPolicyHeaders.length === 1) {
            const [ignore, scriptHash] = proxyBlockLib.generateScriptPayload(
                standardIdsToBlock,
                shouldLog,
                blockCrossFrame,
                randNonce
            );

            const newCSPValue = httpHeadersLib.createCSPInstructionWithHashAllowed(
                cspDynamicPolicyHeaders[0].value,
                "sha256-" + scriptHash
            );

            if (newCSPValue !== false) {
                cspDynamicPolicyHeaders[0].value = newCSPValue;
            }
        }

        return {
            responseHeaders: details.responseHeaders,
        };
    }, requestFilter, ["blocking", "responseHeaders"]);
}());
