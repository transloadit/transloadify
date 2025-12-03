#!/usr/bin/env node

const message = `
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║   ⚠️  DEPRECATION WARNING                                                   ║
║                                                                            ║
║   The 'transloadify' package has been deprecated.                          ║
║   The CLI is now included in the official 'transloadit' package.           ║
║                                                                            ║
║   Please migrate to the new package:                                       ║
║                                                                            ║
║     npm uninstall -g transloadify                                          ║
║     npm install -g transloadit                                             ║
║                                                                            ║
║   Usage remains the same:                                                  ║
║     npx transloadit assemblies create --help                               ║
║                                                                            ║
║   Documentation: https://github.com/transloadit/node-sdk                   ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`

console.warn(message)
