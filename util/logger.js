'use strict';
var chalk = require('chalk');

exports.logError = function (errorMessage) {
  console.log('[npm-cache] ' + chalk.red('[ERROR] ') + errorMessage);
};

exports.logInfo = function (message) {
  console.log('[npm-cache] ' + chalk.cyan('[INFO] ') + message);
};

