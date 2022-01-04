
(function () {
    "use strict";

    const {browserLib, tabBlockedFeaturesLib, blockRulesLib} = window.WEB_API_MANAGER;
    const rootObject = browserLib.getRootObject();

    const onMessageListener = (preferences, request, sender, sendResponse) => {
        const [label, data] = request;


        if (label === "updatePreferenceRules") {
            const {operation, ruleJSON} = data;
            const rule = blockRulesLib.fromJSON(ruleJSON);
            if (operation === "delete") {
                preferences.deleteRule(rule.pattern);
                return;
            }
            if (operation === "add") {
                preferences.addRule(rule);
                return;
            }
            if (operation === "update") {
                preferences.upcertRule(rule.pattern, rule.getStandardIds());
                return;
            }
        }

        if (label === "updatePreferencesBlockCrossFrame") {
            const {blockCrossFrame} = data;
            preferences.setBlockCrossFrame(blockCrossFrame);
            return;
        }

        if (label === "updatePreferencesShouldLog") {
            const {shouldLog} = data;
            preferences.setShouldLog(shouldLog);
            return;
        }

  
        if (label === "updatePreferencesTemplate") {
            const {template} = data;
            preferences.setTemplate(template);
            return;
        }

        if (label === "getPreferences") {
            sendResponse(["getPreferencesResponse", preferences.toJSON()]);
            return;
        }

        if (label === "getPreferencesAndFrames") {
            browserLib.queryTabs({active: true, currentWindow: true}, tabs => {
                if (tabs.length === 0) {
                    return;
                }
                browserLib.getAllFrames({tabId: tabs[0].id}, frameResults => {
                    const frameHosts = frameResults
                        .map(frame => {
                            if (frame.errorOccurred === true) {
                                return false;
                            }

                            return window.URI.parse(frame.url).host;
                        })
                        .filter(url => !!url);

                    const uniqueHosts = Array.from(new Set(frameHosts));
                    const data = {
                        prefsJSON: preferences.toJSON(),
                        uniqueHosts,
                    };

                    rootObject.runtime.sendMessage(["getPreferencesAndFramesResponse", data]);
                });
            });
            return;
        }

        if (label === "openReportPage") {
            browserLib.queryTabs({active: true, currentWindow: true}, tabs => {
                const visibileTabId = tabs[0].id;
                rootObject.tabs.create({
                    url: `/pages/report/report.html?tabId=${visibileTabId}`,
                });
            });
            return;
        }

        if (label === "toggleBlocking") {
            const {action, hostName} = data;
            let numBlockedStandardsForHost;
            if (action === "block") {
                preferences.deleteRule(hostName);
                const defaultStdIds = preferences.getDefaultRule().getStandardIds();
                numBlockedStandardsForHost = defaultStdIds.length;
            } else if (action === "allow") {
                preferences.upcertRule(hostName, []);
                numBlockedStandardsForHost = 0;
            }

            sendResponse(["toggleBlockingResponse", numBlockedStandardsForHost]);
            return;
        }

        
        if (label === "blockedFeature") {
            const {feature} = data;
            tabBlockedFeaturesLib.reportBlockedFeature(
                sender.tab.id,
                sender.frameId,
                feature
            );
            return;
        }

        if (label === "blockedFeaturesReport") {
            if (!data || data.tabId === undefined) {
                const reportData = tabBlockedFeaturesLib.getBlockReport().toJSON();
                sendResponse(["blockedFeaturesReportResponse", reportData]);
                return;
            }

            const tabReport = tabBlockedFeaturesLib.getTabReport(data.tabId);
            sendResponse(["blockedFeaturesReportResponse", tabReport && tabReport.toJSON()]);
            return;
        }

        throw `Received unexpected message type: ${label}.  Passed data: ${JSON.stringify(data)}`;
    };

    const register = preferences => {
        rootObject.runtime.onMessage.addListener(onMessageListener.bind(undefined, preferences));
    };

    window.WEB_API_MANAGER.messagesLib = {
        register,
    };
}());
