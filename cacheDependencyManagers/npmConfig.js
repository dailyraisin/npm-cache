'use strict';

var path = require('path');
var shell = require('shelljs');
var fs = require('fs');
var md5 = require('md5');
var logger = require('../util/logger');
var _ = require('lodash');


// Returns path to configuration file for npm. Uses
// npm-shrinkwrap.json if it exists; otherwise,
// defaults to package.json
var getNpmConfigPath = function () {
  var shrinkWrapPath = path.resolve(process.cwd(), 'npm-shrinkwrap.json');
  var packagePath = path.resolve(process.cwd(), 'package.json');
  if (fs.existsSync(shrinkWrapPath)) {
    logger.logInfo('[npm] using npm-shrinkwrap.json instead of package.json');
    return shrinkWrapPath;
  } else {
    return packagePath;
  }
};

function object2SortedArray (obj) {
    var arr = [];
    _.keys(obj).forEach(function (key) {
        arr.push(key + obj[key]);
    });
    return arr.sort();
}

function getFileHash(filePath) {
  var json = JSON.parse(fs.readFileSync(filePath));

  return md5(JSON.stringify({
    dependencies: object2SortedArray(json.dependencies),
    devDependencies: object2SortedArray(json.devDependencies)
  }));
}

module.exports = {
  cliName: 'npm',
  getCliVersion: function getNpmVersion () {
    return shell.exec('npm --version', {silent: true}).output.trim();
  },
  getNodeVersion: function getNodeVersion () {
    return shell.exec('node -v', {silent: true}).output.trim();
  },
  configPath: getNpmConfigPath(),
  installDirectory: 'node_modules',
  installCommand: 'npm install',
  getFileHash: getFileHash
};
