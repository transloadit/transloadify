import process from 'node:process'

export default class Parser {
  constructor() {
    this._opts = []
    this._longs = {}
    this._shorts = {}
    this._commands = {}
  }

  register(long, short, hasArg) {
    const record = { long, short, hasArg }
    this._opts.push(record)
    this._longs[long] = record
    if (short) this._shorts[short] = record
  }

  command(field, name, ...aliases) {
    if (!this._commands[field]) {
      this._commands[field] = []
    }
    aliases.push(name)
    this._commands[field].push({ name, aliases })
  }

  parse(argv) {
    let args = argv
    if (args == null) args = Array.from(process.argv.slice(2))

    return this._parse(args, {}, [], [])
  }

  _parse(args, cmds, opts, tgts) {
    if (args.length === 0) return { commands: cmds, options: opts, targets: tgts }

    const arg = args.shift()

    if (arg === '--') {
      while (args.length > 0) tgts.push(args.shift())
      return this._parse(args, cmds, opts, tgts)
    }

    if (arg.startsWith('--')) return this._parseLong(arg, args, cmds, opts, tgts)
    if (arg !== '-' && arg.startsWith('-')) return this._parseShort(arg, args, cmds, opts, tgts)
    if (this._isCommand(cmds, arg)) return this._parseCommand(arg, args, cmds, opts, tgts)

    tgts.push(arg)

    return this._parse(args, cmds, opts, tgts)
  }

  _parseLong(arg, args, cmds, opts, tgts) {
    let name
    let value
    arg.replace(/^--([^=]*)(?:=([\s\S]*))?$/, (_$0, $1, $2) => {
      name = $1
      value = $2
    })
    if (name == null) throw new Error('failed parsing long argument')

    if (!Object.hasOwn(this._longs, name)) {
      return {
        error: 'INVALID_OPTION',
        option: name,
        message: `invalid option supplied: '${arg}'`,
      }
    }

    const { hasArg } = this._longs[name]

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

    opts.push({ name, value: args.shift() })
    return this._parse(args, cmds, opts, tgts)
  }

  _parseShort(arg, args, cmds, opts, tgts) {
    const chars = Array.from(arg.slice(1))

    do {
      const opt = chars.shift()

      if (!Object.hasOwn(this._shorts, opt)) {
        return {
          error: 'INVALID_OPTION',
          option: opt,
          message: `invalid option supplied: '${arg}' ('${opt}')`,
        }
      }

      const { long: name, hasArg } = this._shorts[opt]
      if (!hasArg) opts.push({ name })
      else {
        if (chars.length === 0) {
          if (args.length === 0) {
            return {
              error: 'MISSING_ARGUMENT',
              option: name,
              message: `no argument supplied: '${arg}'`,
            }
          }

          opts.push({ name, value: args.shift() })
        } else {
          opts.push({ name, value: chars.join('') })
        }
        break
      }
    } while (chars.length > 0)

    return this._parse(args, cmds, opts, tgts)
  }

  _isCommand(cmds, arg) {
    for (const field in this._commands) {
      for (const command of this._commands[field]) {
        if (command.aliases.indexOf(arg) !== -1) {
          if (field in cmds) return false
          return true
        }
      }
    }

    return false
  }

  _parseCommand(arg, args, cmds, opts, tgts) {
    for (const field in this._commands) {
      for (const command of this._commands[field]) {
        if (command.aliases.indexOf(arg) !== -1) {
          cmds[field] = command.name
          return this._parse(args, cmds, opts, tgts)
        }
      }
    }

    throw new Error('unreachable')
  }
}
