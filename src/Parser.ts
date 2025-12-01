import process from 'node:process'

interface OptionRecord {
  long: string
  short: string | null
  hasArg: boolean
}

interface CommandRecord {
  name: string
  aliases: string[]
}

interface ParsedOption {
  name: string
  value?: string
}

interface ParsedCommands {
  [key: string]: string
}

export interface ParseResult {
  commands: ParsedCommands
  options: ParsedOption[]
  targets: string[]
}

export interface ParseError {
  error: 'INVALID_OPTION' | 'UNNECESSARY_ARGUMENT' | 'MISSING_ARGUMENT'
  option: string
  message: string
}

export type ParseOutput = ParseResult | ParseError

function isParseError(result: ParseOutput): result is ParseError {
  return 'error' in result
}

export default class Parser {
  private _opts: OptionRecord[]
  private _longs: Record<string, OptionRecord>
  private _shorts: Record<string, OptionRecord>
  private _commands: Record<string, CommandRecord[]>

  constructor() {
    this._opts = []
    this._longs = {}
    this._shorts = {}
    this._commands = {}
  }

  register(long: string, short: string | null, hasArg: boolean): void {
    const record: OptionRecord = { long, short, hasArg }
    this._opts.push(record)
    this._longs[long] = record
    if (short) this._shorts[short] = record
  }

  command(field: string, name: string, ...aliases: string[]): void {
    if (!this._commands[field]) {
      this._commands[field] = []
    }
    const cmds = this._commands[field]
    if (cmds) {
      aliases.push(name)
      cmds.push({ name, aliases })
    }
  }

  parse(argv?: string[] | null): ParseOutput {
    let args = argv
    if (args == null) args = Array.from(process.argv.slice(2))

    return this._parse(args, {}, [], [])
  }

  private _parse(
    args: string[],
    cmds: ParsedCommands,
    opts: ParsedOption[],
    tgts: string[],
  ): ParseOutput {
    if (args.length === 0) return { commands: cmds, options: opts, targets: tgts }

    const arg = args.shift()
    if (arg === undefined) return { commands: cmds, options: opts, targets: tgts }

    if (arg === '--') {
      let next = args.shift()
      while (next !== undefined) {
        tgts.push(next)
        next = args.shift()
      }
      return this._parse(args, cmds, opts, tgts)
    }

    if (arg.startsWith('--')) return this._parseLong(arg, args, cmds, opts, tgts)
    if (arg !== '-' && arg.startsWith('-')) return this._parseShort(arg, args, cmds, opts, tgts)
    if (this._isCommand(cmds, arg)) return this._parseCommand(arg, args, cmds, opts, tgts)

    tgts.push(arg)

    return this._parse(args, cmds, opts, tgts)
  }

  private _parseLong(
    arg: string,
    args: string[],
    cmds: ParsedCommands,
    opts: ParsedOption[],
    tgts: string[],
  ): ParseOutput {
    let name: string | undefined
    let value: string | undefined
    arg.replace(/^--([^=]*)(?:=([\s\S]*))?$/, (_$0, $1: string, $2: string | undefined) => {
      name = $1
      value = $2
      return ''
    })
    if (name == null) throw new Error('failed parsing long argument')

    if (!Object.hasOwn(this._longs, name)) {
      return {
        error: 'INVALID_OPTION',
        option: name,
        message: `invalid option supplied: '${arg}'`,
      }
    }

    const longRecord = this._longs[name]
    if (!longRecord) throw new Error('unexpected: long record not found')
    const { hasArg } = longRecord

    if (!hasArg && value != null) {
      return {
        error: 'UNNECESSARY_ARGUMENT',
        option: name,
        message: `unnecessary argument supplied: '${arg}'`,
      }
    }

    if (!hasArg) {
      opts.push({ name })
      return this._parse(args, cmds, opts, tgts)
    }

    if (hasArg && value != null) {
      opts.push({ name, value })
      return this._parse(args, cmds, opts, tgts)
    }

    // hasArg && value == null
    if (args.length === 0) {
      return {
        error: 'MISSING_ARGUMENT',
        option: name,
        message: `no argument supplied: '${arg}'`,
      }
    }

    const nextArg = args.shift()
    if (nextArg === undefined) {
      return {
        error: 'MISSING_ARGUMENT',
        option: name,
        message: `no argument supplied: '${arg}'`,
      }
    }
    opts.push({ name, value: nextArg })
    return this._parse(args, cmds, opts, tgts)
  }

  private _parseShort(
    arg: string,
    args: string[],
    cmds: ParsedCommands,
    opts: ParsedOption[],
    tgts: string[],
  ): ParseOutput {
    const chars = Array.from(arg.slice(1))

    while (chars.length > 0) {
      const opt = chars.shift()
      if (opt === undefined) break

      if (!Object.hasOwn(this._shorts, opt)) {
        return {
          error: 'INVALID_OPTION',
          option: opt,
          message: `invalid option supplied: '${arg}' ('${opt}')`,
        }
      }

      const record = this._shorts[opt]
      if (!record) throw new Error('unexpected: short record not found')
      const { long: name, hasArg } = record
      if (!hasArg) {
        opts.push({ name })
        continue
      }

      if (chars.length === 0) {
        if (args.length === 0) {
          return {
            error: 'MISSING_ARGUMENT',
            option: name,
            message: `no argument supplied: '${arg}'`,
          }
        }

        const nextArg = args.shift()
        if (nextArg === undefined) {
          return {
            error: 'MISSING_ARGUMENT',
            option: name,
            message: `no argument supplied: '${arg}'`,
          }
        }
        opts.push({ name, value: nextArg })
      } else {
        opts.push({ name, value: chars.join('') })
      }
      break
    }

    return this._parse(args, cmds, opts, tgts)
  }

  private _isCommand(cmds: ParsedCommands, arg: string): boolean {
    for (const field in this._commands) {
      const commands = this._commands[field]
      if (!commands) continue
      for (const command of commands) {
        if (command.aliases.indexOf(arg) !== -1) {
          if (field in cmds) return false
          return true
        }
      }
    }

    return false
  }

  private _parseCommand(
    arg: string,
    args: string[],
    cmds: ParsedCommands,
    opts: ParsedOption[],
    tgts: string[],
  ): ParseOutput {
    for (const field in this._commands) {
      const commands = this._commands[field]
      if (!commands) continue
      for (const command of commands) {
        if (command.aliases.indexOf(arg) !== -1) {
          cmds[field] = command.name
          return this._parse(args, cmds, opts, tgts)
        }
      }
    }

    throw new Error('unreachable')
  }
}

export { isParseError }
