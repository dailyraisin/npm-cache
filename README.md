pkgcache
=========

`pkgcache` is a command line utility that caches dependencies installed via `npm`, `bower`, and `composer`.

```bash
npm install -g pkgcache
```

## How `pkgcache` Differs from the Original `npm-cache`

1. The package cache directory structure includes the OS name and node version (if relaying npm).
1. The `dependencies` and `devDependencies` are sorted before calculating a hash so the order does not effect the hash.
1. Optionally use AWS S3 to share your cache among developers and continuous intergration. Put a `.pkgcache.json` in your project directory. E.g.:

```json
{
  "accessKeyId": "...",
  "secretAccessKey": "...",
  "bucketName": "..."
}
```

## Summary

`pkgcache` can be a drop-in replacement for any build script that runs `[npm|bower|composer] install`. 

It is useful for build processes that run `[npm|bower|composer] install` every time as part of their 
build process. Since dependencies don't change often, this often means slower build times. `pkgcache`
helps alleviate this problem by caching previously installed dependencies on the build machine. 

## How It Works

1. When you run `pkgcache install [npm|bower|composer]`, it first looks for `package.json`, `bower.json`, or `composer.json` in the current working directory depending on which dependency manager is requested.
1. It then calculates the MD5 hash of the configuration file and looks for a filed named <MD5 of config.json>.tar.gz in the cache directory (`$HOME/.pkgcache/` by default).
1. If the file does not exist, `pkgcache` uses the system's installed dependency manager to install the dependencies. 
1. Once the dependencies are installed, `pkgcache` tars the newly downloaded dependencies and stores them in the cache directory.
1. If S3 is enabled via `.pkgcache.json`, the tarball is uploaded. 
1. The next time `pkgcache` runs and sees the same config file [hash calculation], it will find the tarball in the cache directory and untar the dependencies in the current working directory.
1. If it’s unavailable in `$HOME/.pkgcache/` and S3 is enabled, attempt to download it from S3.

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
