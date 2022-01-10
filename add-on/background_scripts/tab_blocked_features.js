
(function () {
    const {browserLib, reportsLib} = window.WEB_API_MANAGER;
    const rootObject = browserLib.getRootObject();

    const blockingReport = reportsLib.init();

    rootObject.tabs.onCreated.addListener(tab => {
        blockingReport.initTabReport(tab.id);
    });

    rootObject.tabs.onRemoved.addListener(tabId => {
        blockingReport.deleteTabReport(tabId);
    });

    rootObject.webNavigation.onCommitted.addListener(details => {
        const {tabId, frameId, url} = details;
        blockingReport.initFrameReport(tabId, frameId, url);
    });

  
    const reportBlockedFeature = (tabId, frameId, featureName) => {
        blockingReport.recordBlockedFeature(tabId, frameId, featureName);
    };

  
    const getBlockReport = () => blockingReport;

  
    const getTabReport = tabId => blockingReport.getTabReport(tabId);

    window.WEB_API_MANAGER.tabBlockedFeaturesLib = {
        reportBlockedFeature,
        getBlockReport,
        getTabReport,
    };
}());
