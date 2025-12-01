import process from 'node:process'
import { Transloadit as TransloaditClient } from 'transloadit'
import * as assemblies from './assemblies.ts'
import * as bills from './bills.ts'
import cli from './cli.ts'
import help from './help.ts'
import * as notifications from './notifications.ts'
import OutputCtl, { type IOutputCtl } from './OutputCtl.ts'
import * as templates from './templates.ts'
import 'dotenv/config'

interface CLIResult {
  error?: string
  message?: string
  mode?: string
  action?: string
  logLevel?: number
  jsonMode?: boolean
  inputs?: string[]
  [key: string]: unknown
}

type CommandHandler = (
  output: IOutputCtl,
  client: TransloaditClient | undefined,
  invocation: CLIResult,
) => void | Promise<void>

// Allow handlers that require non-nullable client or have different invocation types
type FlexibleCommandHandler = (
  output: IOutputCtl,
  client: TransloaditClient | TransloaditClient | undefined,
  invocation: unknown,
) => void | Promise<void>

interface CommandMap {
  [key: string]: CommandHandler | FlexibleCommandHandler | CommandMap
}

function isCLIResult(value: unknown): value is CLIResult {
  return typeof value === 'object' && value !== null
}

const cliOutput = cli()
if (!isCLIResult(cliOutput)) {
  console.error('CLI returned invalid result')
  process.exitCode = 1
} else {
  const invocation = cliOutput

  const output = new OutputCtl({
    logLevel: invocation.logLevel,
    jsonMode: invocation.jsonMode,
  })

  if (invocation.error) {
    output.error(invocation.message)
    process.exitCode = 1
  } else {
    const commands: CommandMap = {
      assemblies: assemblies as unknown as CommandMap,
      templates: templates as unknown as CommandMap,
      'assembly-notifications': notifications as unknown as CommandMap,
      bills: bills as unknown as CommandMap,
      help: help as unknown as FlexibleCommandHandler,
    }

    let command: CommandHandler | FlexibleCommandHandler | CommandMap | undefined = invocation.mode
      ? commands[invocation.mode]
      : undefined
    if (invocation.action && command && typeof command === 'object') {
      command = command[invocation.action] as CommandHandler | FlexibleCommandHandler | undefined
    }

    if (typeof command !== 'function') {
      if (invocation.mode === 'register') {
        command = help as unknown as FlexibleCommandHandler
      } else {
        output.error(
          `Command not implemented or invalid: ${invocation.mode}${invocation.action ? ` ${invocation.action}` : ''}`,
        )
        process.exitCode = 1
      }
    }

    // Default to stdin if no inputs are provided and we are not in a TTY
    if (
      invocation.mode === 'assemblies' &&
      invocation.action === 'create' &&
      invocation.inputs &&
      invocation.inputs.length === 0 &&
      !process.stdin.isTTY
    ) {
      invocation.inputs = ['-']
    }

    let client: TransloaditClient | undefined
    if (
      ['help', 'version', 'register'].indexOf(invocation.mode ?? '') === -1 &&
      !process.exitCode
    ) {
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

    if (!process.exitCode && typeof command === 'function') {
      command(output, client, invocation)
    }
  }
}
