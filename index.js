#! /usr/bin/env node
'use strict';

var fs = require('fs-extra');
var path = require('path');
var parser = require('nomnom');
var async = require('async');
var glob = require('glob');
var chalk = require('chalk');

var logger = require('./util/logger');
var ParseUtils = require('./util/parseUtils');
var CacheDependencyManager = require('./cacheDependencyManagers/cacheDependencyManager');

// Main entry point for npm-cache
var main = function () {
  // Parse CLI Args
  parser.command('install')
    .callback(installDependencies)
    .option('forceRefresh', {
      abbr: 'r',
      flag: true,
      default: false,
      help: 'force installing dependencies from package manager without cache'
    })
    .help('install specified dependencies');

  parser.command('clean')
    .callback(cleanCache)
    .help('clear cache directory');

  parser.option('cacheDirectory', {
    default: process.env.NPM_CACHE_DIR || path.resolve(process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE, '.package_cache'),
    abbr: 'c',
    help: 'directory where dependencies will be cached'
  });

  parser.option('version', {
    abbr: 'v',
    help: 'displays version info and exit',
    flag: true,
    callback: function () {
      var packagePath = path.resolve(__dirname, 'package.json');
      var packageFile = fs.readFileSync(packagePath);
      var packageParsed = JSON.parse(packageFile);
      console.log(packageParsed.version);
      process.exit(0);
    }
  });


  var examples = [
    'Examples:',
    '\tnpm-cache install\t# try to install npm, bower, and composer components',
    '\tnpm-cache install bower\t# install only bower components',
    '\tnpm-cache install bower npm\t# install bower and npm components',
    '\tnpm-cache install bower --allow-root composer --dry-run\t# install bower with allow-root, and composer with --dry-run',
    '\tnpm-cache install --cacheDirectory /home/cache/ bower \t# install components using /home/cache as cache directory',
    '\tnpm-cache install --forceRefresh  bower\t# force installing dependencies from package manager without cache',
    '\tnpm-cache clean\t# cleans out all cached files in cache directory'
  ];
  parser.help(examples.join('\n'));

  var npmCacheArgs = ParseUtils.getNpmCacheArgs();
  parser.parse(npmCacheArgs);
};

// Creates cache directory if it does not exist yet
var prepareCacheDirectory = function (cacheDirectory) {
  logger.logInfo(chalk.magenta('using ' + cacheDirectory + ' as cache directory'));
  if (! fs.existsSync(cacheDirectory)) {
    // create directory if it doesn't exist
    fs.mkdirsSync(cacheDirectory);
    logger.logInfo(chalk.magenta('creating cache directory'));
  }
};

// npm-cache command handlers

// main method for installing specified dependencies
var installDependencies = function (opts) {
  prepareCacheDirectory(opts.cacheDirectory);

  var availableManagers = CacheDependencyManager.getAvailableManagers();
  var managerArguments = ParseUtils.getManagerArgs();
  var managers = Object.keys(managerArguments);

  var s3ConfigFileName = '.npm-cache.json';
  var s3ConfigPath = path.join(process.cwd(), s3ConfigFileName);
  var s3Config = {};

  async.series([
      function findS3Config (next) {
          fs.access(s3ConfigPath, fs.R_OK, function fileRead (err) {
              if (err) {
                  logger.logInfo(s3ConfigFileName + ' not found. Local cache only.');
                  //actually no big deal! the s3 config is not required!
                  next(null);
              }
              else { //the file was found
                  logger.logInfo(s3ConfigFileName + ' found');

                  try {
                      s3Config = require(s3ConfigPath);
                  }
                  catch (error) {
                      logger.logError(error);
                      next(error);
                  }

                  if (s3Config.accessKeyId && s3Config.secretAccessKey && s3Config.bucketName) {
                      //everything is okay, we have the right values in the config file
                      next(null);
                  }
                  else {
                      next('.npm-cache.json requires the S3 accessKeyId, secretAccessKey, and bucketName');
                  }
              }
          });
      },
      function eachManager (next) {
          async.each(
            managers,
            function startManager (managerName, callback) {
              var managerConfig = require(availableManagers[managerName]);
              managerConfig.cacheDirectory = opts.cacheDirectory;
              managerConfig.forceRefresh = opts.forceRefresh;
              managerConfig.installOptions = managerArguments[managerName];
              managerConfig.s3Config = s3Config;
              var manager = new CacheDependencyManager(managerConfig);
              manager.loadDependencies(callback);
            },
            function onInstalled (error) {
              if (error === null) {
                logger.logInfo(chalk.green('successfully installed all dependencies'));
                next(null);
                process.exit(0);
              } else {
                logger.logError(chalk.red('error installing dependencies'));
                next(null);
                process.exit(1);
              }
            }
          );
      }],
      function seriesReportError (err) {
          if (err) {
              logger.logError(err);
              process.exit(1);
          }
      }
  );
};

// Removes all cached dependencies from cache directory
var cleanCache = function (opts) {
  prepareCacheDirectory(opts.cacheDirectory);

  // Get all *.tar.gz files recursively in cache directory
  var candidateFileNames = glob.sync(opts.cacheDirectory + '/**/*.tar.gz');

  // Filter out unlikely npm-cached files (non-md5 file names)
  var md5Regexp = /\/[0-9a-f]{32}\.tar\.gz/i;
  var cachedFiles = candidateFileNames.filter(
    function isCachedFile (fileName) {
      return md5Regexp.test(fileName);
    }
  );

  // Now delete all cached files!
  cachedFiles.forEach(function (fileName) {
    fs.unlinkSync(fileName);
  });
  logger.logInfo(chalk.green('cleaned ' + cachedFiles.length + ' files from cache directory'));
};


main();
