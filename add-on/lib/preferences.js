/**
 * Methods and state for tracking all user set preferences in the application.
 *
 * This module is effectivly methods for managing the singleton data, and for
 * syncronizing it with the database.
 */
(function () {
    "use strict";
    const {constants, enums, browserLib, blockRulesLib, migrationLib} = window.WEB_API_MANAGER;
    const defaultPattern = constants.defaultPattern;
    const rootObject = browserLib.getRootObject();
    const storageKey = "webApiManager";

    /**
     *  Singleton, disk-sync'ed representation of the users preferences.
     * @param {?Preferences}
     */
    let instance;

    /**
     * Wraps a function, so that whenever the wrapped function returns,
     * the preferences object is resynced with the database.
     *
     * @param {function} func
     *   A function to wrap.
     *
     * @return {*}
     *   The same results as calling the provided function.
     */
    const resync = func => {
        return function () {
            const funcResult = func.apply(undefined, arguments);

            if (instance !== undefined) {
                const storageFormat = instance.toStorage();
                const storageObject = Object.create(null);
                storageObject[storageKey] = storageFormat;
                rootObject.storage.sync.set(storageObject);
            }

            return funcResult;
        };
    };

    /**
     * Initilizes a Preferences object
     *
     * @param {Array.object} blockRulesRaw
     *   The underlying data representation of all the blocking rules
     *   the user has set.  This will be equal to an array of the results
     *   of calling BlockRule.toData
     * @param {?ShouldLogVal} shouldLog
     *   Either a valid ShouldLog enum value, describing how logging should
     *   be performed, or undefined, in which case shouldLog.NONE is used,
     *   indicating no logging should be performed.
     * @param {?Array.number} template
     *   An optional array of standard ids that can be used as a template
     *   rule, that can applied to other domains / patterns.
     * @param {?boolean} blockCrossFrame
     *   A boolean value, describing whether cross frame access should be
     *   blocked.  Defaults to false.
     * @param {?Array.string} blockedFeatures
     *   An array of strings representing key paths to features in the DOM
     *   that should be blocked.
     * @param {?boolean} syncWithDb
     *   A boolean value, describing whether the given preferences object
     *   should automatically be kept in sync with the underlying, persistant
     *   data store.  If no value is provided, will not sync.
     *
     * @return {Preferences}
     *   An initilized, preferences object.
     */
    const init = (blockRulesRaw = [], shouldLog, template, blockCrossFrame, blockedFeatures, syncWithDb) => {
        let shouldLogLocal = shouldLog || enums.shouldLog.NONE;
        let templateLocal = template.slice() || [];
        let blockCrossFrameLocal = !!blockCrossFrame;
        let blockedFeaturesLocal = blockedFeatures || [];

        let defaultRule;
        const nonDefaultRules = [];
        blockRulesRaw.map(blockRulesLib.fromData).forEach(rule => {
            if (rule.pattern === defaultPattern) {
                defaultRule = rule;
                return;
            }
            nonDefaultRules.push(rule);
        });

        // If the blocking rule was not in the set of rules loaded from
        // storage, then create a new, empty blocking rule for it.
        if (defaultRule === undefined) {
            defaultRule = blockRulesLib.init(defaultPattern, []);
        }

        // Create a map from the pattern for each blocking rule, to the
        // blocking rule itself.
        const patternsToRulesMap = nonDefaultRules
            .reduce((collection, rule) => {
                collection[rule.pattern] = rule;
                return collection;
            }, Object.create(null));

        const getAllRules = () => {
            const allRules = Object.values(patternsToRulesMap).concat([defaultRule]);
            return allRules;
        };

        const getRuleForUrl = url => {
            const matchingRule = Object.values(patternsToRulesMap)
                .find(br => br.isMatchingUrl(url));
            return matchingRule || defaultRule;
        };

        const getRuleForHost = host => {
            const matchingRule = Object.values(patternsToRulesMap)
                .find(br => br.isMatchingHost(host));
            return matchingRule || defaultRule;
        };

        const getRuleForPattern = pattern => {
            if (pattern === defaultPattern) {
                return defaultRule;
            }
            return patternsToRulesMap[pattern];
        };

        const deleteRule = matchPattern => {
            if (patternsToRulesMap[matchPattern] === undefined) {
                return false;
            }

            delete patternsToRulesMap[matchPattern];
            return true;
        };

        const addRule = blockRule => {
            if (blockRule.pattern === constants.defaultPattern) {
                return false;
            }

            if (patternsToRulesMap[blockRule.pattern] !== undefined) {
                return false;
            }

            patternsToRulesMap[blockRule.pattern] = blockRule;
            return true;
        };

        const upcertRule = (pattern, standardIds) => {
            if (pattern === defaultPattern) {
                defaultRule.setStandardIds(standardIds);
                return false;
            }

            const isNewRule = patternsToRulesMap[pattern] === undefined;

            if (isNewRule) {
                addRule(blockRulesLib.init(pattern, standardIds));
            } else {
                const existingRule = patternsToRulesMap[pattern];
                existingRule.setStandardIds(standardIds);
            }

            return isNewRule;
        };

        const setShouldLog = newShouldLog => {
            enums.utils.assertValidEnum(enums.ShouldLogVal, newShouldLog);
            shouldLogLocal = newShouldLog;
        };

        const getShouldLog = () => shouldLogLocal;

        const getTemplate = () => {
            return templateLocal.slice();
        };

        const setTemplate = templateStandardIds => {
            templateLocal = templateStandardIds.slice();
        };

        const getBlockCrossFrame = () => blockCrossFrameLocal;

        const setBlockCrossFrame = blockCrossFrame => {
            blockCrossFrameLocal = !!blockCrossFrame;
        };

        const toJSON = () => {
            const rulesData = getAllRules().map(rule => rule.toData());

            return JSON.stringify({
                rules: rulesData,
                shouldLog: getShouldLog(),
                template: getTemplate(),
                blockCrossFrame: getBlockCrossFrame(),
            });
        };

        const toStorage = () => {
            return {
                schema: constants.schemaVersion,
                rules: getAllRules().map(rule => rule.toData()),
                shouldLog: getShouldLog(),
                template: getTemplate(),
                blockCrossFrame: getBlockCrossFrame(),
            };
        };

        const response = {
            getDefaultRule: () => defaultRule,
            getNonDefaultRules: () => Object.values(patternsToRulesMap),
            getRuleForPattern,
            getAllRules,
            getRuleForUrl,
            getRuleForHost,
            deleteRule,
            addRule,
            upcertRule,
            setShouldLog,
            getShouldLog,
            getTemplate,
            setTemplate,
            getBlockCrossFrame,
            setBlockCrossFrame,
            toStorage,
            toJSON,
        };

        if (syncWithDb === true) {
            const modifyingMethods = ["deleteRule", "addRule", "upcertRule",
                "setShouldLog", "setBlockCrossFrame"];
            modifyingMethods.forEach(methodName => {
                response[methodName] = resync(response[methodName]);
            });
        }

        Object.freeze(response);
        return response;
    };

    /**
     * Populates the user's preferences from permanant storage, and registers
     * that the instance returned from this call is the one "true"
     * representation of the preferences (e.g. the one that is kept in
     * sync with the database).
     *
     * This is distinct from the Preferences object returned from
     * the `preferencesLib.fromJSON`, which returns an identically interfaced
     * object, but which is not mirrored in storage.
     *
     * @param {?function} callback
     *   An optional callback function that, if provided, will be called with
     *   the loaded preferences object once its initilized from persistant
     *   storage.
     *
     * @return {undefined}
     */
    const load = callback => {
        const fromStorage = storedData => {
            const [success, migratedData] = migrationLib.applyMigrations(storedData);

            if (success !== true) {
                throw "Stored preferences did not match a known format";
            }

            // Default preferences to use, if we weren't able to load
            // any stored prefernces from disk / sync.
            let blockRulesRaw = [];
            let template = [];
            let shouldLog = enums.ShouldLogVal.NONE;
            let blockCrossFrame = false;
            let blockedFeatures = [];

            if (migratedData &&
                    migratedData[storageKey] &&
                    migratedData[storageKey].rules) {
                blockRulesRaw = migratedData[storageKey].rules;
                shouldLog = migratedData[storageKey].shouldLog;
                template = migratedData[storageKey].template;
                blockCrossFrame = !!migratedData[storageKey].blockCrossFrame;
                blockedFeatures = migratedData[storageKey].blockedFeatures;
            }

            instance = init(blockRulesRaw, shouldLog, template, blockCrossFrame,
                            blockedFeatures, true);

            if (callback !== undefined) {
                callback(instance);
            }
        };

        rootObject.storage.sync.get(storageKey, fromStorage);
    };

    /**
     * Returns the global preferences singleton.
     *
     * Changes made to this instance are kept in sync with the database.
     *
     * Callers should call to `loadFromStorage` before calling this method.
     *
     * @return {?Preferences}
     *   Returns a singleton preferences object if one has been loaded from
     *   storage, or undefined if no such instance has been loaded yet.
     */
    const get = () => instance;

    /**
     * Creates a Preferences object from a JSON string.  The returned
     * object is intended to be used read only, and will not have any changes
     * reflected in persistant storage.
     *
     * @param {string} jsonString
     *   A JSON string encoding a set of user preferences, likely generated
     *   from `Preferences.toJSON`.
     *
     * @return {Preferences}
     *   A Preferences object.
     *
     * @throws If provided JSON string is not a valid serilization of
     *   preferences data.
     */
    const fromJSON = jsonString => {
        const data = JSON.parse(jsonString);
        if (typeof data !== "object" || Array.isArray(data) === true) {
            throw `Invalid preferences JSON: ${jsonString} does not encode an object.`;
        }

        if (data.rules === undefined || Array.isArray(data.rules) === false) {
            throw `Invalid preferences JSON: ${jsonString} does not have an array for a "rules" property.`;
        }

        enums.utils.assertValidEnum(enums.ShouldLogVal, data.shouldLog);

        if (Array.isArray(data.template) === false) {
            throw `Invalid preferences JSON: ${jsonString} does not have an array for a rule template.`;
        }

        const {rules, shouldLog, template, blockCrossFrame, featureExceptions, blockedFeatures} = data;
        return init(rules, shouldLog, template, blockCrossFrame, blockedFeatures, false);
    };

    /**
     * Returns a new preferences object, with no non-default state.  This is
     * mainly only used for testing.
     *
     * @return {Preferences}
     *   An empty preferences object.
     */
    const initNew = () => {
        return init([], enums.ShouldLogVal.NONE, []);
    };

    window.WEB_API_MANAGER.preferencesLib = {
        load,
        get,
        fromJSON,
        initNew,
    };
}());
