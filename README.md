pkgcache
=========

`pkgcache` is a command line utility that caches dependencies installed via `npm`, `bower`, and `composer`.

## How the DailyRaisin Fork Differs

1. The package cache directory structure includes the OS name and node version (if relaying npm).
1. The `dependencies` and `devDependencies` are sorted before calculating a hash.
1. Optionally use AWS S3 to share your cache. Put an `.npm-cache.json` in your project directory. E.g.:

```json
{
  "accessKeyId": "...",
  "secretAccessKey": "...",
  "bucketName": "..."
}
```

It is useful for build processes that run `[npm|bower|composer] install` every time as part of their 
build process. Since dependencies don't change often, this often means slower build times. `pkgcache`
helps alleviate this problem by caching previously installed dependencies on the build machine. 
`pkgcache` can be a drop-in replacement for any build script that runs `[npm|bower|composer] install`. 

## How it Works
When you run `pkgcache install [npm|bower|composer]`, it first looks for `package.json`, `bower.json`,
or `composer.json` in the current working directory depending on which dependency manager is requested.
It then calculates the MD5 hash of the configuration file and looks for a filed named 
<MD5 of config.json>.tar.gz in the cache directory ($HOME/.package_cache by default). If the file does not
exist, `pkgcache` uses the system's installed dependency manager to install the dependencies. Once the
dependencies are installed, `pkgcache` tars the newly downloaded dependencies and stores them in the 
cache directory. The next time `pkgcache` runs and sees the same config file, it will find the tarball
in the cache directory and untar the dependencies in the current working directory.


## Installation
```bash
npm install -g pkgcache
```

## Usage
```bash
pkgcache install
```

To specify arguments to each dependency manager, add the arguments after listing the dependency manager. 

For example, to install bower components with the `--allow-root` option, and composer with the `--dry-run` option:

```bash
pkgcache install bower --allow-root composer --dry-run
```

## Examples
```bash
pkgcache install	# try to install npm, bower, and composer components
pkgcache install bower	# install only bower components
pkgcache install bower npm	# install bower and npm components
pkgcache install bower --allow-root composer --dry-run	# install bower with allow-root, and composer with --dry-run
pkgcache install --cacheDirectory /home/cache/  bower 	# install components using /home/cache as cache directory
pkgcache install --forceRefresh  bower	# force installing dependencies from package manager without cache
pkgcache clean	# cleans out all cached files in cache directory
```
