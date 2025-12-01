import process from 'node:process'
import { Transloadit as TransloaditClient } from 'transloadit'
import * as assemblies from './assemblies.js'
import * as bills from './bills.js'
import cli from './cli.js'
import help from './help.js'
import * as notifications from './notifications.js'
import OutputCtl from './OutputCtl.js'
import * as templates from './templates.js'

const invocation = cli()

const output = new OutputCtl(invocation)

if (invocation.error) {
  output.error(invocation.message)
  process.exitCode = 1
} else {
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
  if (['help', 'version', 'register'].indexOf(invocation.mode) === -1) {
    if (!process.env.TRANSLOADIT_KEY || !process.env.TRANSLOADIT_SECRET) {
      output.error(
        'Please provide API authentication in the environment variables TRANSLOADIT_KEY and TRANSLOADIT_SECRET',
      )
      process.exitCode = 1
    } else {
      client = new TransloaditClient({
        authKey: process.env.TRANSLOADIT_KEY,
        authSecret: process.env.TRANSLOADIT_SECRET,
      })
    }
  }

  if (!process.exitCode) {
    command(output, client, invocation)
  }
}
