/**
 * @license
 * Copyright 2016 Yahoo Inc. All rights reserved.
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
 * @fileoverview Bootstraps the looking glass.
 */
goog.provide('e2e.ext.ui.glass.bootstrap');

goog.require('e2e.ext.ui.Glass');


/**
 * Specifies whether the looking glass has been bootstrapped.
 * @type {boolean}
 */
e2e.ext.ui.glass.bootstrap = false;

if (!goog.isDef(window.glass)) {
  window.glass = new e2e.ext.ui.Glass();
  window.glass.decorate(document.documentElement);
  e2e.ext.ui.glass.bootstrap = true;
}
