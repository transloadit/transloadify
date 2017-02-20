if (process.env.NODE_ENV !== 'production') require('source-map-support').install()

import cli from './cli'
import TransloaditClient from 'transloadit'
import OutputCtl from './OutputCtl'
import help from './help'

let invocation = cli()

let output = new OutputCtl(invocation)

if (invocation.error) {
  output.error(invocation.message)
  process.exit(1)
}

const commands = {
  assemblies: require('./assemblies'),
  templates: require('./templates'),
  'assembly-notifications': require('./notifications'),
  bills: require('./bills'),
  help
}

let command = commands[invocation.mode]
if (invocation.action) command = command[invocation.action]

let client
if (!['help', 'version', 'register'].indexOf(invocation.mode) !== -1) {
  if (!process.env.TRANSLOADIT_KEY || !process.env.TRANSLOADIT_SECRET) {
    output.error('Please provide API authentication in the environment variables TRANSLOADIT_KEY and TRANSLOADIT_SECRET')
    process.exit(1)
  }

  client = new TransloaditClient({
    authKey: process.env.TRANSLOADIT_KEY,
    authSecret: process.env.TRANSLOADIT_SECRET
  })
}

command(output, client, invocation)
