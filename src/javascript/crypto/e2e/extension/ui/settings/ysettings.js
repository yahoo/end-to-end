/**
 * @license
 * Copyright 2015 Yahoo Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Provides the UI for the extension's settings page.
 */
goog.provide('e2e.ext.ui.ySettings');

goog.require('e2e.async.Result');
goog.require('e2e.cipher.Algorithm');
goog.require('e2e.coname.getRealmByEmail');
goog.require('e2e.ext.constants');
goog.require('e2e.ext.constants.Actions');
goog.require('e2e.ext.constants.CssClass'); //@yahoo
goog.require('e2e.ext.constants.ElementId');
goog.require('e2e.ext.ui.Settings');
goog.require('e2e.ext.ui.dialogs.Generic');
goog.require('e2e.ext.ui.dialogs.InputType');
goog.require('e2e.ext.ui.dialogs.SyncConfirmation');
goog.require('e2e.ext.ui.templates.dialogs.importconfirmation');
goog.require('e2e.ext.utils');
goog.require('e2e.ext.utils.Error');
goog.require('e2e.ext.utils.action');
goog.require('e2e.ext.utils.text');
goog.require('e2e.openpgp.KeyRing'); //@yahoo
goog.require('e2e.signer.Algorithm');
goog.require('goog.array');
goog.require('goog.async.DeferredList');
goog.require('goog.crypt'); //@yahoo
goog.require('goog.dom');
goog.require('goog.dom.classlist'); //@yahoo
goog.require('goog.events.EventType'); //@yahoo
goog.require('goog.functions');
goog.require('goog.string');
goog.require('soy');

goog.scope(function() {
var ext = e2e.ext;
var constants = e2e.ext.constants;
var dialogs = e2e.ext.ui.dialogs;
var messages = e2e.ext.messages;
var panels = e2e.ext.ui.panels;
var ui = e2e.ext.ui;
var utils = e2e.ext.utils;
var syncTemplates = e2e.ext.ui.templates.dialogs.syncconfirmation;
var importTemplates = e2e.ext.ui.templates.dialogs.importconfirmation;



/**
 * Constructor for the yahoo settings page.
 * @constructor
 * @extends {e2e.ext.ui.Settings}
 */
ui.ySettings = function() {
  goog.base(this);

  /**
   * User IDs collected from all of the opened tabs
   * @type {Array.<string>}
   */
  this.uids_ = [];
};
goog.inherits(ui.ySettings, ui.Settings);


/**
 * Renders the settings page.
 * //@yahoo added key conflict resolution dialogs for email that comes thru
 * location.hash
 * @param {!Object} pgpKeys The existing PGP keys in the keyring.
 * @private
 * @suppress {accessControls}
 */
ui.ySettings.prototype.renderTemplate_ = function(pgpKeys) {

  goog.base(this, 'renderTemplate_', pgpKeys);

  //@yahoo added click handlers
  this.getHandler().
      listen(goog.dom.getElement(constants.ElementId.GENERATE_KEY),
          goog.events.EventType.CLICK,
          function() {
            document.querySelector(
                '#pgpGenerateKey button.action').click();
          }).
      listen(this.getElementByClass(constants.CssClass.TOGGLE_OPTIONS),
          goog.events.EventType.CLICK,
          function(evt) {
            var htmlElement = document.documentElement,
                liteModeCss = constants.CssClass.LITE_MODE;
            evt.target.textContent = chrome.i18n.getMessage(
                goog.dom.classlist.contains(htmlElement, liteModeCss) ?
                    'fewerOptionsLabel' :
                    'moreOptionsLabel');
            goog.dom.classlist.toggle(htmlElement, liteModeCss);
          });


  // //@yahoo User ID should always be provided through location.hash
  // if (location.hash) {
  //   var uid = utils.text.normalizeUid(
  //       decodeURIComponent(location.hash.substring(1)));
  //   if (uid) {
  //     // trigger the key resolution dialogs
  //     this.syncWithRemote(uid, 'load');
  //     this.populateSignupUid_(uid);
  //     return;
  //   }
  // }


  utils.action.getLauncher(goog.bind(function(launcher) {
    launcher = /** @type {ext.yExtensionLauncher} */ (launcher);

    // first focus on webmail
    launcher.focusOnWebmail().addCallback(function() {
      // move to a popup window if it's not in a popup yet
      chrome.tabs.getCurrent(function(tab) {
        chrome.windows.get(tab.windowId, function(win) {
          if (win.type === 'popup') {
            // shift the focus from webmail back to the settings page
            chrome.windows.update(win.id, {focused: true});
            chrome.tabs.update(tab.id, {active: true});
          } else {
            chrome.windows.create({
              tabId: tab.id,
              width: 840,
              height: 500,
              type: 'popup',
              focused: true
            });
          }
        })
      });
    })

    launcher.getUserIDs().addCallback(function(uids) {
      this.uids_ = uids;

      // trigger key resolution dialogs if any for every uid one after another
      var syncChain = new goog.async.Deferred;
      goog.array.forEach(uids, function(uid) {
        syncChain.addCallback(function() {
          return this.syncWithRemote(uid, 'load');
        }, this);
      }, this);
      syncChain.callback(true);

      this.populateUids_(uids);

    }, this);

  }, this), goog.bind(this.displayFailure_, this));


};


/**
 * Renders a new PGP key into the settings page.
 * //@yahoo used searchLocalKey() instead of searchKey()
 * @param {string} keyUid The key UID to render.
 * @param {boolean=} opt_isOverride Whether the user has acknowledged to
 *     override remote keys with local keyring.
 * @suppress {accessControls}
 * @override
 */
ui.ySettings.prototype.renderNewKey_ = function(keyUid, opt_isOverride) {
  this.pgpContext_
      // @yahoo expected to render only local keys
      // .searchKey(keyUid)
      .searchLocalKey(keyUid, e2e.openpgp.KeyRing.Type.ALL)
      .addCallback(function(pgpKeys) {
        this.keyringMgmtPanel_.addNewKey(keyUid, pgpKeys);
        this.renderPanels_();
        // @yahoo added sync with remote
        this.syncWithRemote(keyUid, opt_isOverride ? 'keygen' : 'import');
      }, this)
      .addErrback(this.displayFailure_, this);
};


/**
 * Exports the entire keyring of a particular UID to a file.
 * @param {string} keyUid The UID of the keys to export.
 * @suppress {accessControls}
 * @override
 * @private
 */
ui.ySettings.prototype.exportKey_ = function(keyUid) {
  var ctx = this.pgpContext_;

  ctx.isKeyRingEncrypted().addCallbacks(function(isEncrypted) {
    return ctx.exportUidKeyring(keyUid, true, true).
        addCallback(function(armoredKey) {
          var filename = keyUid.replace(/[\/\\]/g, '.'),
              privFilename = (isEncrypted ? '' : 'UNENCRYPTED-') +
                  filename + '-keyring-private.asc',
              pubFilename = filename + '-public.asc';

          if (!goog.string.contains(armoredKey, 'PRIVATE KEY BLOCK')) {
            return utils.writeToFile(armoredKey, function(fileUrl) {
              var anchor = document.createElement('a');
              anchor.download = pubFilename;
              anchor.href = fileUrl;
              anchor.click();
            });
          }

          return this.renderConfirmExportingPrivKeys_(keyUid).
              addCallback(function(includePrivKeys) {
                switch (includePrivKeys) {
                  case 'true':
                    return {key: armoredKey, filename: privFilename};
                  case 'false':
                    return ctx.exportUidKeyring(keyUid, true, false).
                        addCallback(function(armoredKey) {
                          return {key: armoredKey, filename: pubFilename};
                        });
                }
                return null;
              }).
              addCallback(function(exportData) {
                return exportData &&
                    utils.writeToFile(exportData.key, function(fileUrl) {
                      var anchor = document.createElement('a');
                      anchor.download = exportData.filename;
                      anchor.href = fileUrl;
                      anchor.click();
                    });
              });
        }, this);
  }, this.displayFailure_, this);
};


/**
 * Removes a PGP key.
 * @param {string} keyUid The UID of the keys to remove.
 * @param {string=} opt_fingerprintHex The specific key fingerprint to remove
 * @param {e2e.openpgp.KeyRing.Type=} opt_keyType The specific key type to
 *     remove.
 * @suppress {accessControls}
 * @override
 */
ui.ySettings.prototype.removeKey_ = function(
    keyUid, opt_fingerprintHex, opt_keyType) {

  this.renderDeleteKeysCallback_(keyUid, opt_fingerprintHex, opt_keyType).
      addCallbacks(function(confirmed) {
        if (!confirmed) {
          return;
        }
        var ctx = this.pgpContext_;
        ctx.searchPrivateKey(keyUid).addCallbacks(function(privKeys) {

          var deleteResult = opt_fingerprintHex ?
              ctx.deleteKeyByFingerprint(
                  goog.crypt.hexToByteArray(
                      opt_fingerprintHex.replace(/\s+/g, '')),
                  opt_keyType) :
              ctx.deleteKey(keyUid);

          deleteResult.addCallback(function() {
            this.keyringMgmtPanel_.removeKey(
                keyUid, opt_fingerprintHex, opt_keyType);
            this.renderPanels_();

            // @yahoo added sync with remote
            // sync is needed only for those who used to have private keys
            // but no sync is required to remove a priv key
            if (privKeys.length && (!opt_keyType ||
                opt_keyType !== e2e.openpgp.KeyRing.Type.PRIVATE)) {
              this.syncWithRemote(keyUid, 'remove');
            }
          }, this);

        }, this.displayFailure_, this);
      }, this.displayFailure_, this);
};


/**
 * Updates the keyserver as needed after key generation and import
 * @param {string} keyUid The key UID to render.
 * @param {string=} opt_intention The intention to trigger syncWithRemote
 * @return {!e2e.async.Result.<boolean>} Whether it is in sync ultimately.
 * @suppress {accessControls}
 */
ui.ySettings.prototype.syncWithRemote = function(keyUid, opt_intention) {
  // sync with remote only if such a keyUid has a private key
  var uidObj = utils.text.parseUid(keyUid);
  var constFunction = goog.functions.constant;
  if (uidObj && e2e.coname.getRealmByEmail(uidObj.email) !== null) {
    return this.pgpContext_.searchPrivateKey(keyUid).
        addCallbacks(function(privKeys) {
          if (opt_intention === 'load' || opt_intention === 'remove' ||
              privKeys.length !== 0) {
            return this.pgpContext_.syncWithRemote(keyUid,
                goog.bind(function() {
                  // No keys at both server and client. This is a new account
                  if (opt_intention === 'load' && privKeys.length === 0) {
                    this.displaySignupPanels_();
                    return e2e.async.Result.toResult(null);
                  }
                  // no reqAction when it's in-sync
                  return e2e.async.Result.toResult('noop');
                }, this),
                // make an update if the inconsistency is acknowledged
                opt_intention === 'keygen' || opt_intention === 'remove' ?
                    constFunction(
                        e2e.async.Result.toResult('overwriteRemote')) :
                    goog.bind(this.renderConfirmSyncKeysCallback_, this)).
                addCallbacks(function(reqActionResult) {
                  reqActionResult !== null && utils.showNotification(
                      chrome.i18n.getMessage('keyUpdateSuccessMsg'),
                      goog.nullFunction);
                  return reqActionResult !== null;
                }, this.displayFailure_, this);
          }
          return false;
        }, this.displayFailure_, this);
  }
  return e2e.async.Result.toResult(false);
};


/**
 * Display the Sign up panel
 * @private
 */
ui.Settings.prototype.displaySignupPanels_ = function() {
  var hiddenClass = constants.CssClass.HIDDEN;
  var signupForm = goog.dom.getElement(
      constants.ElementId.GENERATE_KEY_FORM);
  var signupPrompt = goog.dom.getElement(
      constants.ElementId.SIGNUP_PROMPT);
  goog.dom.classlist.add(signupPrompt, hiddenClass);
  goog.dom.classlist.remove(signupForm, hiddenClass);
};


/**
 * Populates the uids collected from different tabs
 * @param {!Array<string>} uids
 * @private
 */
ui.Settings.prototype.populateUids_ = function(uids) {
  var input = goog.dom.getElement(constants.ElementId.GENERATE_KEY_FORM).
      getElementsByClassName(constants.CssClass.EMAIL);

  if (input) {
    input[0].value = uids[0];
  }

  var datalistElem = goog.dom.getElement(constants.ElementId.UID_DATALIST);

  goog.array.forEach(uids, function(uid) {
    datalistElem.appendChild(
        goog.dom.createDom(goog.dom.TagName.OPTION, {value: uid}));
  });
};


/**
 * Generates a new PGP key using the information that is provided by the user.
 * Same as Settings.prototype.generateKey_ except added overwriteRemote
 * @param {panels.GenerateKey} panel The panel where the user has provided the
 *     information for the new key.
 * @param {string} name The name to use.
 * @param {string} email The email to use.
 * @param {string} comments The comments to use.
 * @param {number} expDate The expiration date to use.
 * @private
 * @return {goog.async.Deferred}
 * @suppress {accessControls}
 */
ui.ySettings.prototype.generateKeyAndOverwriteRemote_ = function(
    panel, name, email, comments, expDate) {
  var defaults = constants.KEY_DEFAULTS;
  return this.pgpContext_.generateKey(e2e.signer.Algorithm[defaults.keyAlgo],
      defaults.keyLength, e2e.cipher.Algorithm[defaults.subkeyAlgo],
      defaults.subkeyLength, name, comments, email, expDate)
      .addCallback(goog.bind(function(key) {
        this.renderNewKey_(key[0].uids[0], true); //@yahoo overwriteRemote
        panel.reset();
      }, this)).addErrback(this.displayFailure_, this);
};


/**
 * This has become the entry point to manage keys
 * @suppress {accessControls}
 * @override
 * @private
 */
ui.ySettings.prototype.generateKey_ = function(
    panel, name, email, comments, expDate) {

  var uid, normalizedUid = utils.text.normalizeUid(name ?
      name + ' <' + email + '>' :
      email);
  if (goog.isNull(normalizedUid)) {
    this.displayFailure_(new utils.Error(
        'invalid user id', 'promptInvalidUserIdError'));
    return e2e.async.Result.toResult(undefined);
  }
  uid = normalizedUid;

  return this.pgpContext_.syncWithRemote(uid,
      goog.bind(this.renderKeepExistingKeysCallback_, this),
      goog.bind(function(uid, local, common, remote) {
        var keys = local.concat(common);

        // inconsistency due to presence of remote only keys
        if (remote.length !== 0) {
          // ask if user can restore his private keys, or just want a new one
          return this.renderMatchRemoteKeysCallback_(
              uid, local, common, remote).addCallback(function(resolution) {

            switch (resolution) {
              // cancelled
              case null: return resolution;
              // user preferred to keep remote keys
              case 'importedRemote':
                // no need to ask again if only remote keys are what to keep
                if (keys.length === 0) {
                  return 'noop';
                }
                keys = keys.concat(remote);
                break;
            }
            return this.renderKeepExistingKeysCallback_(uid, keys);
          }, this);
        }

        // inconsistency solely due to presence of local only keys
        return this.renderKeepExistingKeysCallback_(uid, keys);

      }, this)).
      addCallbacks(function(reqActionResult) {
        // generate a new key and update the panel
        var parsedUid = utils.text.parseUid(uid);
        return reqActionResult !== null && this.generateKeyAndOverwriteRemote_(
            panel, parsedUid.name, parsedUid.email, comments, expDate);
      }, this.displayFailure_, this);
};


/**
 * Imports a keyring from a file and appends it to the current keyring.
 * //@yahoo let it accept string, required by FB key import
 * @param {!(File|string)} file The file to import.
 * @suppress {accessControls}
 * @override
 * @private
 */
ui.ySettings.prototype.importKeyring_ = function(file) {
  utils.readFile(file, goog.bind(function(contents) {
    // @yahoo switch to advanced mode
    var isPubKeyBlock = goog.string.contains(contents, 'PUBLIC KEY BLOCK');

    this.actionExecutor_.execute(/** @type {!messages.ApiRequest} */ ({
      action: constants.Actions.IMPORT_KEY,
      content: contents,
      passphraseCallback: goog.bind(this.renderPassphraseCallback_, this)
    }), this, goog.bind(function(res) {
      goog.array.removeDuplicates(res); //@yahoo
      if (res.length > 0) {
        utils.showNotification(
            chrome.i18n.getMessage(
                'promptImportKeyNotificationLabel', res.toString()),
            goog.bind(function() {
              goog.array.forEach(res, function(keyUid) {
                this.renderNewKey_(keyUid);
              }, this);
              this.keyringMgmtPanel_.resetControls();
            }, this));

        // @yahoo switch to advanced mode when only public key is imported
        isPubKeyBlock && goog.dom.classlist.remove(
            document.documentElement, constants.CssClass.LITE_MODE);
      } else {
        this.displayFailure_(new utils.Error(
            'Import key error', 'promptImportKeyError'));
      }
    }, this));
  }, this));
};


/**
 * Renders the UI elements needed for confirming if the user can import keys
 * to match with those published on keyserver.
 * @param {string} uid The user id being handled
 * @param {!e2e.openpgp.Keys} localOnlyKeys
 * @param {!e2e.openpgp.Keys} commonKeys
 * @param {!e2e.openpgp.Keys} remoteOnlyKeys
 * @param {boolean=} opt_isOverride Whether to show Update instead of Add Key.
 * @return {!e2e.async.Result<?string>} A promise
 * @suppress {accessControls}
 * @private
 */
ui.ySettings.prototype.renderMatchRemoteKeysCallback_ = function(
    uid, localOnlyKeys, commonKeys, remoteOnlyKeys, opt_isOverride) {
  var result = new e2e.async.Result();
  var popupElem = goog.dom.getElement(constants.ElementId.CALLBACK_DIALOG);

  var dialog = new dialogs.SyncConfirmation(
      uid,
      localOnlyKeys,
      commonKeys,
      remoteOnlyKeys,
      goog.bind(function(decision) {
        goog.dispose(dialog);
        // user chose whether to delete or keep remote keys
        switch (decision) {
          case '': // cancelled
            result.callback(null);
            break;
          case 'true':
            result.callback('overwriteRemote');
            break;
          case 'false': // import remote keys
            goog.async.DeferredList.gatherResults(
                goog.array.map(remoteOnlyKeys,
                    function(/** @type {!e2e.openpgp.Key} */ k) {
                      return this.importKey(goog.nullFunction, k.serialized);
                    }, this.pgpContext_)).
            addCallback(function() {
              // update the panels
              var uids = goog.array.flatten(goog.array.map(remoteOnlyKeys,
                  function(k) {
                    return k.uids;
                  }));
              goog.array.removeDuplicates(uids);
              goog.array.forEach(uids, function(uid) {
                this.keyringMgmtPanel_.addNewKey(uid, remoteOnlyKeys);
              }, this);
              this.renderPanels_();
              result.callback('importedRemote');
            }, this);
            break;
        }
      }, this),
      opt_isOverride);

  this.addChild(dialog, false);
  dialog.render(popupElem);

  return result;
};


/**
 * Renders the UI elements needed for confirming whether to delete keys.
 * @param {string} uid The user id being handled
 * @param {string=} opt_fingerprintHex The specific key fingerprint to remove
 * @param {e2e.openpgp.KeyRing.Type=} opt_keyType The specific key type to
 *     remove.
 * @return {!e2e.async.Result<?string>} A promise
 * @suppress {accessControls}
 * @private
 */
ui.ySettings.prototype.renderDeleteKeysCallback_ = function(
    uid, opt_fingerprintHex, opt_keyType) {

  // // skip the dialog if we have nothing to delete
  // if (keysToDelete.length === 0) {
  //   return e2e.async.Result.toResult(/** @type {?string} */ (''));
  // }
  var result = new e2e.async.Result();

  goog.async.DeferredList.gatherResults([
    this.pgpContext_.searchLocalKey(uid, e2e.openpgp.KeyRing.Type.PRIVATE),
    this.pgpContext_.searchLocalKey(uid)]).
      addCallbacks(function(keys) {
        var privKeys = keys[0], pubKeys = keys[1],
        msg = chrome.i18n.getMessage('promptDeleteKeysConfirmMessage') + '\n';

        // warn only those who will need key syncing
        if (privKeys.length) {
          // attempting to delete the last public key means opt-out
          if ((pubKeys.length && !opt_fingerprintHex) ||
              (pubKeys.length === 1 &&
              pubKeys[0].key.fingerprintHex === opt_fingerprintHex &&
              opt_keyType === e2e.openpgp.KeyRing.Type.PUBLIC)) {
            msg += '\n' + chrome.i18n.getMessage(
                'promptDeleteLastPublicKeyWarningMessage');
          }

          // attempting to delete all keys or a private key
          if (!opt_fingerprintHex ||
              opt_keyType === e2e.openpgp.KeyRing.Type.PRIVATE) {
            // TODO: deleting the last private key will void syncing
            msg += '\n' + chrome.i18n.getMessage(
                'promptDeletePrivateKeyWarningMessage');
          }
        }

        var keysToDelete = opt_fingerprintHex ?
            goog.array.filter(
                opt_keyType === e2e.openpgp.KeyRing.Type.PRIVATE ?
                    privKeys :
                    pubKeys,
                function(k) {
                  return k.key.fingerprintHex === opt_fingerprintHex;
                }) :
            privKeys.concat(pubKeys);

        // skip the dialog if we have nothing to delete
        if (keysToDelete.length === 0) {
          result.callback(undefined);
          return;
        }

        var popupElem = goog.dom.getElement(
            constants.ElementId.CALLBACK_DIALOG);
        var sanitizedHtml = importTemplates.actionConfirm({
          promptActionConfirmLabel: msg,
          keys: keysToDelete,
          keyUid: opt_fingerprintHex ? undefined : uid,
          secretKeyDescription: chrome.i18n.getMessage('secretKeyDescription'),
          publicKeyDescription: chrome.i18n.getMessage('publicKeyDescription'),
          keyFingerprintLabel: chrome.i18n.getMessage('keyFingerprintLabel')
        });
        var dialog = new dialogs.Generic(
            sanitizedHtml,
            function(decision) {
              goog.dispose(dialog);
              result.callback(goog.isDef(decision));
            },
            ui.dialogs.InputType.NONE,
            '',
            chrome.i18n.getMessage('promptOkActionLabel'),
            chrome.i18n.getMessage('actionCancelPgpAction'));

        this.addChild(dialog, false);
        dialog.render(popupElem);

      }, goog.bind(result.errback, result), this);

  return result;
};


/**
 * Renders the UI elements needed for confirming whether to keep existing keys.
 * @param {string} uid The user id being handled
 * @param {!e2e.openpgp.Keys} keysToKeep
 * @return {!e2e.async.Result<?string>} A promise
 * @private
 */
ui.ySettings.prototype.renderKeepExistingKeysCallback_ = function(
    uid, keysToKeep) {

  // skip the dialog if we have nothing to keep, for a new registration
  if (keysToKeep.length === 0) {
    return e2e.async.Result.toResult(/** @type {?string} */ ('noop'));
  }

  var result = new e2e.async.Result();
  var popupElem = goog.dom.getElement(constants.ElementId.CALLBACK_DIALOG);
  var dialog = new dialogs.Generic(
      importTemplates.importKeyConfirm({
        promptImportKeyConfirmLabel: chrome.i18n.getMessage(
            'promptAddReplaceKeysConfirmMessage'),
        keys: keysToKeep,
        secretKeyDescription: chrome.i18n.getMessage('secretKeyDescription'),
        publicKeyDescription: chrome.i18n.getMessage('publicKeyDescription'),
        keyFingerprintLabel: chrome.i18n.getMessage('keyFingerprintLabel')
      }),
      function(decision) {
        goog.dispose(dialog);

        // user choses whether to give up those keysToKeep
        switch (decision) {
          case '': decision = null; break;
          case 'true': decision = 'delete'; break;
          case 'false': decision = 'noop'; break;
        }
        result.callback(decision);
      },
      dialogs.InputType.CHECKBOX,
      chrome.i18n.getMessage('replaceKeyCheckboxLabel'),
      chrome.i18n.getMessage('promptOkActionLabel'),
      chrome.i18n.getMessage('actionCancelPgpAction'));

  this.addChild(dialog, false);
  dialog.render(popupElem);
  return result;
};


/**
 * Renders the UI elements needed for keeping key consistency locally and
 * remotely.
 * @param {string} uid The user id being handled
 * @param {!e2e.openpgp.Keys} localOnlyKeys
 * @param {!e2e.openpgp.Keys} commonKeys
 * @param {!e2e.openpgp.Keys} remoteOnlyKeys
 * @return {!e2e.async.Result<?string>} A promise
 * @private
 */
ui.ySettings.prototype.renderConfirmSyncKeysCallback_ = function(
    uid, localOnlyKeys, commonKeys, remoteOnlyKeys) {

  if (remoteOnlyKeys.length !== 0) {
    return this.renderMatchRemoteKeysCallback_(
        uid, localOnlyKeys, commonKeys, remoteOnlyKeys, true);
  }

  var result = new e2e.async.Result();
  var popupElem = goog.dom.getElement(constants.ElementId.CALLBACK_DIALOG);
  var dialog = new dialogs.Generic(
      importTemplates.importKeyConfirm({
        promptImportKeyConfirmLabel: chrome.i18n.getMessage(
            'promptKeepSyncKeysMessage'),
        keys: localOnlyKeys,
        secretKeyDescription: chrome.i18n.getMessage('secretKeyDescription'),
        publicKeyDescription: chrome.i18n.getMessage('publicKeyDescription'),
        keyFingerprintLabel: chrome.i18n.getMessage('keyFingerprintLabel')
      }),
      function(decision) {
        goog.dispose(dialog);
        // user choses whether to update the keyserver
        result.callback(goog.isDef(decision) ? 'overwriteRemote' : null);
      },
      dialogs.InputType.NONE,
      '',
      chrome.i18n.getMessage('actionOverwriteRemoteKeys'),
      chrome.i18n.getMessage('actionCancelPgpAction'));

  this.addChild(dialog, false);
  dialog.render(popupElem);
  return result;
};


/**
 * Renders the UI elements needed for confirming export of private keys
 * @param {string} uid The user id being handled
 * @return {!e2e.async.Result<string>} Whether user endorsed that.
 * @private
 */
ui.ySettings.prototype.renderConfirmExportingPrivKeys_ = function(uid) {
  var result = new e2e.async.Result();
  var popupElem = goog.dom.getElement(constants.ElementId.CALLBACK_DIALOG);
  var dialog = new dialogs.Generic(
      chrome.i18n.getMessage('promptConfirmExportingPrivKeysLabel', uid),
      function(decision) {
        goog.dispose(dialog);
        result.callback(decision);
      },
      dialogs.InputType.CHECKBOX,
      chrome.i18n.getMessage('exportPrivKeyCheckboxLabel'),
      chrome.i18n.getMessage('promptOkActionLabel'),
      chrome.i18n.getMessage('actionCancelPgpAction'));

  this.addChild(dialog, false);
  dialog.render(popupElem);
  return result;
};

});  // goog.scope
