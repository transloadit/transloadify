import cli from './cli.js'
import { Transloadit as TransloaditClient } from 'transloadit'
import OutputCtl from './OutputCtl.js'
import help from './help.js'
import * as assemblies from './assemblies.js'
import * as templates from './templates.js'
import * as notifications from './notifications.js'
import * as bills from './bills.js'

try {
  import('source-map-support').then((sms) => sms.install())
} catch (e) {}

let invocation = cli()

let output = new OutputCtl(invocation)

if (invocation.error) {
  output.error(invocation.message)
  process.exit(1)
}

const commands = {
  assemblies,
  templates,
  'assembly-notifications': notifications,
  bills,
  help,
}

let command = commands[invocation.mode]
if (invocation.action) command = command[invocation.action]

// Default to stdin if no inputs are provided and we are not in a TTY
if (
  invocation.mode === 'assemblies' &&
  invocation.action === 'create' &&
  invocation.inputs.length === 0 &&
  !process.stdin.isTTY
) {
  invocation.inputs = ['-']
}

let client
if (!['help', 'version', 'register'].indexOf(invocation.mode) !== -1) {
  if (!process.env.TRANSLOADIT_KEY || !process.env.TRANSLOADIT_SECRET) {
    output.error(
      'Please provide API authentication in the environment variables TRANSLOADIT_KEY and TRANSLOADIT_SECRET'
    )
    process.exit(1)
  }

  client = new TransloaditClient({
    authKey: process.env.TRANSLOADIT_KEY,
    authSecret: process.env.TRANSLOADIT_SECRET,
  })
}

command(output, client, invocation)
