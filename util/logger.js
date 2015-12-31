'use strict';
var chalk = require('chalk');

exports.logError = function (errorMessage) {
  console.log('[pkgcache] ' + chalk.red('[ERROR] ') + errorMessage);
};

exports.logInfo = function (message) {
  console.log('[pkgcache] ' + chalk.cyan('[INFO] ') + message);
};

