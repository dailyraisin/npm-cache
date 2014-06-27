var fs = require('fs');
var path = require('path');
var logger = require('../util/logger');
var md5 = require('MD5');

function BaseCacheManager (cacheDirectory) {
  this.cacheDirectory = cacheDirectory;
}

var getFileHash = function (filePath) {
  var file = fs.readFileSync(filePath);
  return md5(file);
};

BaseCacheManager.prototype.name = 'BaseCacheManager';

BaseCacheManager.prototype.getConfigPath = function () {
  logger.logError('Override getConfigPath() in subclasses!');
};

BaseCacheManager.prototype.cacheLogInfo = function (message) {
  logger.logInfo('[' + this.name + '] ' + message);
};

BaseCacheManager.prototype.cacheLogError = function (error) {
  logger.logError('[' + this.name + '] ' + error);
};

BaseCacheManager.prototype.cacheExists = function (hash) {
  var cachedPath = path.resolve(this.cacheDirectory, hash + '.tar.gz');
  return fs.existsSync(cachedPath);
};

BaseCacheManager.prototype.installDependencies = function () {
  logger.logError('Override installDependencies() in subclasses!');
};

BaseCacheManager.prototype.loadDependencies = function () {
  // Verify file exists
  if (! fs.existsSync(this.getConfigPath())) {
    this.cacheLogError('Could not find config path');
    return;
  }
  this.cacheLogInfo('config file exists');

  // Get hash of file
  var hash = getFileHash(this.getConfigPath());
  this.cacheLogInfo('hash: ' + hash);

  // Check for ~/.package_cache/{{hash}}.tar.gz
  if (this.cacheExists(hash)) {
    console.log('cache exists');
    // install from cache
  }
  else {
    this.installDependencies();
    // then cache
  }

  this.cacheLogInfo('installed dependencies');
};

module.exports = BaseCacheManager;