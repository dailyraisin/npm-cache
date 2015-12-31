'use strict';

var fs = require('fs-extra');
var path = require('path');
var logger = require('../util/logger');
var shell = require('shelljs');
var which = require('which');
var targz = require('tar.gz');
var Decompress = require('decompress');
var osName = require('os-name');
var chalk = require('chalk');
var bytes = require('bytes');
var s3 = require('s3');
var ProgressBar = require('cli-progress-bar');

function CacheDependencyManager (config) {
    this.config = config;
    this.client = null;
    this.bar = new ProgressBar();

    //stub uploader and downloader out to define the functions
    this.uploader = {
        progressAmount: 0,
        progressTotal: 0
    };
    this.downloader = {
        progressAmount: 0,
        progressTotal: 0
    };

    if (this.s3Enabled()) {
        this.client = s3.createClient({
            s3Options: {
                accessKeyId: this.config.s3Config.accessKeyId,
                secretAccessKey: this.config.s3Config.secretAccessKey
            }
        });
    }
}

// Given a path relative to process' current working directory,
// returns a normalized absolute path
var getAbsolutePath = function (relativePath) {
  return path.resolve(process.cwd(), relativePath);
};

CacheDependencyManager.prototype.cacheLogInfo = function (message) {
  logger.logInfo('[' + this.config.cliName + '] ' + message);
};

CacheDependencyManager.prototype.cacheLogError = function (error) {
  logger.logError('[' + this.config.cliName + '] ' + error);
};


CacheDependencyManager.prototype.installDependencies = function () {
  var error = null;
  var installCommand = this.config.installCommand + ' ' + this.config.installOptions;
  installCommand = installCommand.trim();
  this.cacheLogInfo('running [' + installCommand + ']...');
  if (shell.exec(installCommand).code !== 0) {
    error = 'error running ' + this.config.installCommand;
    this.cacheLogError(error);
  } else {
    this.cacheLogInfo('installed ' + this.config.cliName + ' dependencies, now archiving');
  }
  return error;
};

CacheDependencyManager.prototype.startArchiveDependencies = function (cacheDirectory, cachePath, s3cachePath, next) {
    var self = this;
    self.archiveDependencies(cacheDirectory, cachePath, function onArchived (archiveError) {
        if (self.s3Enabled()) {
            logger.logInfo('s3 enabled, I will upload the archive');

            self.uploader = self.client.uploadFile({
                localFile: cachePath,
                s3Params: {
                    Bucket: self.config.s3Config.bucketName,
                    Key: s3cachePath
                }
            });
            self.uploader.on('error', self.uploaderError(next));
            self.uploader.on('progress', self.progress(self.uploader, 'Uploading to s3'));
            self.uploader.on('end', self.uploaderEnd(s3cachePath, next));
        }
        else {
            next(archiveError);
        }
    });
};

CacheDependencyManager.prototype.archiveDependencies = function (cacheDirectory, cachePath, callback) {
  var self = this;
  var error = null;
  var installedDirectory = getAbsolutePath(this.config.installDirectory);
  this.cacheLogInfo('archiving dependencies from ' + installedDirectory);

  if (!fs.existsSync(installedDirectory)) {
    this.cacheLogInfo('skipping archive. Install directory does not exist.');
    return error;
  }

  // Make sure cache directory is created
  fs.mkdirsSync(cacheDirectory);

  new targz().compress(
    installedDirectory,
    cachePath,
    function onCompressed (compressErr) {
      if (compressErr) {
        error = 'error tar-ing ' + installedDirectory;
        self.cacheLogError(error);
      } else {
        self.cacheLogInfo('installed and archived dependencies');
      }
      callback(error);
    }
  );
};

CacheDependencyManager.prototype.extractDependencies = function (cachePath, callback) {
  var self = this;
  var error = null;
  var installDirectory = getAbsolutePath(this.config.installDirectory);
  this.cacheLogInfo('clearing installed dependencies at ' + installDirectory);
  fs.removeSync(installDirectory);
  this.cacheLogInfo('...cleared');
  this.cacheLogInfo('extracting dependencies from ' + chalk.magenta(cachePath));

  new Decompress()
    .src(cachePath)
    .dest(process.cwd())
    .use(Decompress.targz())
    .run(
      function onExtracted (extractErr) {
        if (extractErr) {
          error = 'Error extracting ' + cachePath + ': ' + extractErr;
          self.cacheLogError(error);
        } else {
          self.cacheLogInfo('done extracting');
        }
        callback(error); // no error
      }
    );
};

CacheDependencyManager.prototype.progress = function (loader, message) {
    var self = this;
    return function () {
        //this.cacheLogInfo(bytes(loader.progressAmount) + ' / ' + bytes(loader.progressTotal));
        self.bar.show(message + ' ' + bytes(loader.progressTotal), this.progressAmount/this.progressTotal);
    }.bind(loader);
};

CacheDependencyManager.prototype.downloaderError = function (cacheDirectory, cachePath, s3cachePath, next) {
    var self = this;
    return function (err) {
        var critical = true;

        if (err) {
            if (/40\d/.test(err)) { //400 level errors
                if (/404/.test(err)) {
                    critical = false;
                    logger.logInfo(err);
                    logger.logInfo('Bad bucket name or the archive is not yet uploaded');
                }
                else if (/403/.test(err)) {
                    logger.logError('Check your s3 credentials');
                }

                if (critical) { //any other unknown case
                    logger.logError(err);
                    next(err);
                }
                else {
                    logger.logInfo('Continuing to install and archive locally');
                    self.installThenArchive(cacheDirectory, cachePath, s3cachePath, next);
                }
            }
            else {
                //any other error we care about
                logger.logError(err);
                next(err);
            }
        }
        else {
            //no error
            //does this even get called when there is no error?
            next('no download error but I didn’t expect to be here');
        }
    };
};

CacheDependencyManager.prototype.uploaderError = function (next) {
    return function (err) {
        logger.logError(err);
        logger.logInfo('Could not upload to s3, but local installation worked.');
        next(null); //vs. next(err);
    };
};

CacheDependencyManager.prototype.downloaderEnd = function (cachePath, next) {
    var self = this;
    return function () {
        self.cacheLogInfo(chalk.green('done downloading from s3'));
        self.cacheLogInfo('cachePath ' + chalk.magenta(cachePath));
        self.startExtraction(cachePath, next);
    };
};

CacheDependencyManager.prototype.uploaderEnd = function (s3cachePath, next) {
    var self = this;
    return function () {
        self.cacheLogInfo(chalk.green('done uploading to s3'));
        self.cacheLogInfo('s3 path ' + chalk.magenta(s3cachePath));
        next(null);
    };
};


CacheDependencyManager.prototype.startExtraction = function (cachePath, next) {
    // Try to extract dependencies
    this.extractDependencies(cachePath, function onExtracted (extractErr) {
        next(extractErr);
    });
};

CacheDependencyManager.prototype.s3Enabled = function () {
    var self = this;
    return self.config.s3Config.accessKeyId && self.config.s3Config.secretAccessKey && self.config.s3Config.bucketName;
};

CacheDependencyManager.prototype.installThenArchive = function (cacheDirectory, cachePath, s3cachePath, next) {
    var self = this;
    var error = null;
    error = self.installDependencies();
    if (error) {
        next(error);
    }
    else {
        self.startArchiveDependencies(cacheDirectory, cachePath, s3cachePath, next);
    }
};

CacheDependencyManager.prototype.loadDependencies = function (finishedLoadingDependencies) {
  var self = this;
  var error = null;

  // Check if config file for dependency manager exists
  if (! fs.existsSync(this.config.configPath)) {
    this.cacheLogInfo('Dependency config file ' + this.config.configPath + ' does not exist. Skipping install');
    finishedLoadingDependencies(null);
    return;
  }
  this.cacheLogInfo('config file exists');

  // Check if package manger CLI is installed
  try {
    which.sync(this.config.cliName);
    this.cacheLogInfo('cli exists');
  }
  catch (e) {
    error = 'Command line tool ' + this.config.cliName + ' not installed';
    this.cacheLogError(error);
    finishedLoadingDependencies(error);
    return;
  }

  // Get hash of dependency config file
  var hash = this.config.getFileHash(this.config.configPath);
  var configFile = require(this.config.configPath);
  this.cacheLogInfo('hash of ' + this.config.configPath + ': ' + chalk.magenta(hash));
  // cachePath is absolute path to where local cache of dependencies is located
  var cacheDirectory = path.resolve(
        this.config.cacheDirectory,
        this.config.cliName,
        configFile.name,
        this.config.getCliVersion()
  );

  var s3cachePath = [
        this.config.cliName,
        configFile.name,
        this.config.getCliVersion(),
        hash + '.tar.gz'
  ].join('/'); //use join instead of path.resolve because the s3 paths are definitely separated with this slash

  if (this.config.cliName === 'npm') {
    cacheDirectory = path.resolve(
        this.config.cacheDirectory,
        this.config.cliName,
        configFile.name,
        osName().replace(/\s/g, '-'),
        'node-' + this.config.getNodeVersion(),
        'npm-' + this.config.getCliVersion()
    );

    s3cachePath = [
        this.config.cliName,
        configFile.name,
        osName().replace(/\s/g, '-'),
        'node-' + this.config.getNodeVersion(),
        'npm-' + this.config.getCliVersion(),
        hash + '.tar.gz'
    ].join('/'); //use join instead of path.resolve because the s3 paths are definitely separated with this slash
  }


  var cachePath = path.resolve(cacheDirectory, hash + '.tar.gz');


  // Check if local cache of dependencies exists
  if (! this.config.forceRefresh && fs.existsSync(cachePath)) {
    this.cacheLogInfo('local cache exists');
    this.cacheLogInfo('cache size ' + chalk.magenta(bytes(fs.statSync(cachePath).size)));

    this.startExtraction(cachePath, finishedLoadingDependencies);
  }
  else { // install dependencies with CLI tool and cache
    if (self.s3Enabled()) {
        self.downloader = self.client.downloadFile({
            localFile: cachePath,
            s3Params: {
                Bucket: self.config.s3Config.bucketName,
                Key: s3cachePath
            }
        });
        self.downloader.on('error', self.downloaderError(cacheDirectory, cachePath, s3cachePath, finishedLoadingDependencies));
        self.downloader.on('progress', self.progress(self.downloader, 'Downloading from s3'));
        self.downloader.on('end', self.downloaderEnd(cachePath, finishedLoadingDependencies));
    }
    else { //no s3 enabled
        // Try to install dependencies using package manager
        self.installThenArchive(cacheDirectory, cachePath, s3cachePath, finishedLoadingDependencies);
    }
  } //else (not force refresh and doesn’t exist locally
};

/**
 * Looks for available package manager configs in cacheDependencyManagers
 * directory. Returns an object with package manager names as keys
 * and absolute paths to configs as values
 *
 * Ex: {
 *  npm: /usr/local/lib/node_modules/npm-cache/cacheDependencyMangers/npmConfig.js,
 *  bower: /usr/local/lib/node_modules/npm-cache/cacheDependencyMangers/bowerConfig.js
 * }
 *
 * @return {Object} availableManagers
 */
CacheDependencyManager.getAvailableManagers = function () {
  if (CacheDependencyManager.managers === undefined) {
    CacheDependencyManager.managers = {};
    var files = fs.readdirSync(__dirname);
    var managerRegex = /(\S+)Config\.js/;
    files.forEach(
      function addAvailableManager (file) {
        var result = managerRegex.exec(file);
        if (result !== null) {
          var managerName = result[1];
          CacheDependencyManager.managers[managerName] = path.join(__dirname, file);
        }
      }
    );
  }
  return CacheDependencyManager.managers;
};

module.exports = CacheDependencyManager;
