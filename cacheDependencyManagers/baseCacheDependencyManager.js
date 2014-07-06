'use strict';

var fs = require('fs');
var path = require('path');
var logger = require('../util/logger');
var md5 = require('MD5');
var shell = require('shelljs');


function CacheDependencyManager (config) {
  this.config = config;
}

var getFileHash = function (filePath) {
  var file = fs.readFileSync(filePath);
  return md5(file);
};

CacheDependencyManager.prototype.cacheLogInfo = function (message) {
  logger.logInfo('[' + this.config.cliName + '] ' + message);
};

CacheDependencyManager.prototype.cacheLogError = function (error) {
  logger.logError('[' + this.config.cliName + '] ' + error);
};


CacheDependencyManager.prototype.installDependencies = function () {
  this.cacheLogInfo('installing ' + this.config.cliName + ' dependencies...');
  if (shell.exec(this.config.installCommand).code !== 0) {
    this.cacheLogError('error running ' + this.config.installCommand);
    return;
  }
  this.cacheLogInfo('installed ' + this.config.cliName + ' dependencies, now archiving');
};


CacheDependencyManager.prototype.archiveDependencies = function (cachePath) {
  var installedDirectory = this.config.installDirectory;
  this.cacheLogInfo('archiving dependencies from ' + installedDirectory);
  shell.exec('tar -zcf ' + cachePath + ' ' + installedDirectory);
  this.cacheLogInfo('done archiving');
};

CacheDependencyManager.prototype.extractDependencies = function (cachePath) {
  this.cacheLogInfo('extracting dependencies from ' + cachePath);
  shell.exec('tar -zxf ' + cachePath);
  this.cacheLogInfo('done extracting');
};

CacheDependencyManager.prototype.loadDependencies = function (cacheDirectory, callback) {
  var self = this;
  var error;

  // Check if config file for dependency manager exists
  if (! fs.existsSync(this.config.configPath)) {
    this.cacheLogInfo('Dependency config file ' + this.config.configPath + ' does not exist. Skipping install');
    callback(null);
    return;
  }
  this.cacheLogInfo('config file exists');

  // Get hash of dependency config file
  var hash = getFileHash(this.config.configPath);
  this.cacheLogInfo('hash of ' + this.config.configPath + ': ' + hash);
  // cachePath is absolute path to where local cache of dependencies is located
  var cachePath = path.resolve(cacheDirectory, hash + '.tar.gz');

  // Check if local cache of dependencies exists
  if (fs.existsSync(cachePath)) {
    this.cacheLogInfo('cache exists');
    this.extractDependencies(cachePath);
  } else { // install dependencies with CLI tool and cache
    if (! shell.which(this.config.cliName)) {
      error = 'Command line tool ' + this.config.cliName + ' not installed';
      this.cacheLogError(error);
      callback(error);
      return;
    }
    this.installDependencies();
    this.archiveDependencies(cachePath);
    self.cacheLogInfo('installed and archived dependencies');
  }
  callback(null);
};

module.exports = CacheDependencyManager;