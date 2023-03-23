const path = require('path')
const _ = require('lodash')

module.exports.overrideRuntime = function ({ runtime, toolkit }) {
  // if (!runtime.isDev) {
  // }
  runtime['prebuild:content'] = './_scripts/inject.sh'

  runtime.projectDir = `${__dirname}/website`

  runtime.cacheDir = path.join(runtime.projectDir, '.lanyon')
  runtime.recordsPath = path.join(runtime.cacheDir, 'records.json')
  runtime.assetsSourceDir = path.join(runtime.projectDir, 'assets')
  runtime.assetsBuildDir = path.join(runtime.assetsSourceDir, 'build')
  runtime.contentScandir = path.join(runtime.projectDir, runtime.contentScandir || '.')
  runtime.contentBuildDir = path.join(runtime.projectDir, '_site')

  return runtime
}

module.exports.overrideConfig = function ({ config, toolkit }) {
  if (config.runtime.isDev) {
    config.jekyll.url = 'http://localhost:3000'
  }

  config.jekyll.profile = true
  config.jekyll.trace = true

  if (config.runtime.isDev) {
    config.jekyll.unpublished = true
    config.jekyll.future = true
    config.jekyll.incremental = true // <-- for clarify; incremental is the default also
  } else {
    config.jekyll.incremental = false
  }

  return config
}
