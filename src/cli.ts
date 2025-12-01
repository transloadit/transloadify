import type { ParseResult } from './Parser.ts'
import Parser, { isParseError } from './Parser.ts'

interface ParsedOption {
  name: string
  value?: string
}

interface CLIError {
  error: string
  option?: string
  message: string
}

interface CLIResult {
  error?: undefined
  mode?: string
  action?: string
  logLevel?: number
  jsonMode?: boolean
  [key: string]: unknown
}

type CLIOutput = CLIError | CLIResult

type ConstraintFn = (opts: ParsedOption[], tgts: string[]) => CLIError | undefined
type OptionPredicate = (opt: ParsedOption) => boolean
type SubcommandHandler = (opts: ParsedOption[], tgts: string[]) => CLIOutput
type SubcommandMap = { [key: string]: SubcommandHandler }

const parser = new Parser()

parser.command('mode', 'register')
parser.command('mode', 'assemblies', 'assembly', 'a')
parser.command('mode', 'templates', 'template', 't')
parser.command(
  'mode',
  'assembly-notifications',
  'assembly-notification',
  'notifications',
  'notification',
  'n',
)
parser.command('mode', 'bills', 'bill', 'b')

parser.command('action', 'create', 'new', 'c')
parser.command('action', 'delete', 'cancel', 'd')
parser.command('action', 'modify', 'edit', 'alter', 'm')
parser.command('action', 'replay', 'r')
parser.command('action', 'list', 'l')
parser.command('action', 'get', 'info', 'view', 'display', 'g')
parser.command('action', 'sync', 's')

parser.register('steps', null, true)
parser.register('template', 't', true)
parser.register('field', 'f', true)
parser.register('watch', 'w', false)
parser.register('recursive', 'r', false)
parser.register('input', 'i', true)
parser.register('output', 'o', true)
parser.register('delete-after-processing', 'd', false)
parser.register('reprocess-stale', null, false)
parser.register('after', 'a', true)
parser.register('before', 'b', true)
parser.register('keywords', null, true)
parser.register('fields', null, true)
parser.register('reparse-template', null, false)
parser.register('notify-url', null, true)
parser.register('sort', null, true)
parser.register('order', null, true)
parser.register('name', 'n', true)
parser.register('failed', null, false)
parser.register('successful', null, false)
parser.register('verbose', 'v', false)
parser.register('quiet', 'q', false)
parser.register('json', 'j', false)
parser.register('version', null, false)
parser.register('help', 'h', false)

export default function cli(...args: (string[] | null | undefined)[]): CLIOutput {
  const firstArg = args[0]
  const result = parser.parse(firstArg ?? undefined)
  if (isParseError(result)) return result

  const parseResult = result as ParseResult
  const { commands, options, targets } = parseResult

  const err = generalValidation(options)
  if (err != null) return err

  return modeDispatch(commands, options, targets)
}

function generalValidation(options: ParsedOption[]): CLIError | undefined {
  for (const option of options) {
    if (option.name === 'field' && option.value && !option.value.match(/^[^=]+=[\s\S]*$/)) {
      return {
        error: 'INVALID_OPTION',
        option: option.name,
        message: `invalid argument for --field: '${option.value}'`,
      }
    }

    if (option.name === 'after' || option.name === 'before') {
      // TODO reject invalid dates
    }

    if (
      option.name === 'sort' &&
      option.value &&
      ['id', 'name', 'created', 'modified'].indexOf(option.value) === -1
    ) {
      return {
        error: 'INVALID_OPTION',
        option: option.name,
        message: 'invalid argument for --sort',
      }
    }

    if (option.name === 'order' && option.value && ['asc', 'desc'].indexOf(option.value) === -1) {
      return {
        error: 'INVALID_OPTION',
        option: option.name,
        message: 'invalid argument for --order',
      }
    }

    if (
      option.name === 'verbosity' &&
      option.value &&
      ['0', '1', '2'].indexOf(option.value) === -1
    ) {
      return {
        error: 'INVALID_OPTION',
        option: option.name,
        message: 'invalid argument for --verbosity',
      }
    }
  }
  return undefined
}

function modeDispatch(
  { mode: initialMode, action: initialAction }: { mode?: string; action?: string },
  opts: ParsedOption[],
  tgts: string[],
): CLIOutput {
  let mode = initialMode
  let action = initialAction

  if (opts.filter((opt) => opt.name === 'help').length !== 0) {
    return {
      mode: 'help',
      logLevel: 1,
      jsonMode: false,
      helpMode: mode,
      helpAction: action,
    }
  }

  if (mode == null) {
    if (action != null) mode = 'assemblies'
    else if (opts.length === 0) mode = 'register'
    else if (opts.filter((opt) => opt.name === 'version').length !== 0) mode = 'version'
    else {
      mode = 'assemblies'
      action = 'create'
    }
  }

  const verbosity = getVerbosity(opts)

  const noJsonFlag = opts.filter((opt) => opt.name !== 'json')
  const jsonMode = opts.length !== noJsonFlag.length
  const filteredOpts = noJsonFlag

  let handler: SubcommandHandler | SubcommandMap | undefined = subcommands[mode]
  if (action != null) {
    if (!(typeof handler === 'object' && action in handler)) {
      return {
        error: 'INVALID_COMMAND',
        message: `mode '${mode}' does not support the action '${action}'`,
      }
    }
    handler = (handler as SubcommandMap)[action]
  }

  if (typeof handler !== 'function') {
    return {
      error: 'INVALID_COMMAND',
      message: `mode '${mode}' requires an action (one of ${Object.keys(handler as object)})`,
    }
  }

  const result = handler(filteredOpts, tgts)

  if (!result.error) {
    const cliResult = result as CLIResult
    cliResult.logLevel = verbosity
    cliResult.jsonMode = jsonMode
    cliResult.mode = mode
    cliResult.action = action
  }

  return result
}

function getVerbosity(opts: ParsedOption[]): number {
  let result = 1
  let writeAt = 0
  for (let readFrom = 0; readFrom < opts.length; readFrom++) {
    const opt = opts[readFrom]
    if (!opt) continue
    if (opt.name === 'verbose') result = 2
    else if (opt.name === 'quiet') result = 0
    else opts[writeAt++] = opt
  }
  opts.splice(writeAt)
  return result
}

function allowOptions(
  optClassFn: OptionPredicate,
  msgfn: (opt: ParsedOption) => string,
): ConstraintFn {
  return (opts, _tgts) => {
    const invalid = opts.filter((opt) => !optClassFn(opt))
    const firstInvalid = invalid[0]
    if (invalid.length > 0 && firstInvalid) {
      return {
        error: 'INVALID_OPTION',
        message: msgfn(firstInvalid),
      }
    }
    return undefined
  }
}

function nOfOption(
  optClassFn: OptionPredicate,
  low: number,
  high: number,
  msgfn: (opt: ParsedOption | undefined) => string,
): ConstraintFn {
  return (opts, _tgts) => {
    const relevantOpts = opts.filter(optClassFn)
    if (!(low <= relevantOpts.length && relevantOpts.length <= high)) {
      return {
        error: 'INVALID_OPTION',
        message: msgfn(relevantOpts[0]),
      }
    }
    return undefined
  }
}

function exactlyOneOfOption(
  optClassFn: OptionPredicate,
  msgfn: (opt: ParsedOption | undefined) => string,
): ConstraintFn {
  return nOfOption(optClassFn, 1, 1, msgfn)
}
function atMostOneOfOption(
  optClassFn: OptionPredicate,
  msgfn: (opt: ParsedOption | undefined) => string,
): ConstraintFn {
  return nOfOption(optClassFn, 0, 1, msgfn)
}

function noTargets(msg: string): ConstraintFn {
  return (_opts, tgts) => {
    if (tgts.length > 0) {
      return {
        error: 'INVALID_ARGUMENT',
        message: msg,
      }
    }
    return undefined
  }
}
function requireTargets(msg: string): ConstraintFn {
  return (_opts, tgts) => {
    if (tgts.length === 0) {
      return {
        error: 'MISSING_ARGUMENT',
        message: msg,
      }
    }
    return undefined
  }
}
function nTargets(
  low: number,
  high: number,
  { few, many }: { few?: string; many?: string },
): ConstraintFn {
  return (_opts, tgts) => {
    if (tgts.length < low && few) {
      return {
        error: 'MISSING_ARGUMENT',
        message: few,
      }
    }
    if (tgts.length > high && many) {
      return {
        error: 'INVALID_ARGUMENT',
        message: many,
      }
    }
    return undefined
  }
}

function validate(
  opts: ParsedOption[],
  tgts: string[],
  ...constraints: ConstraintFn[]
): CLIError | undefined {
  for (const constraint of constraints) {
    const err = constraint(opts, tgts)
    if (err) return err
  }
  return undefined
}

function anyOf(...args: string[]): OptionPredicate {
  return (opt) => args.indexOf(opt.name) !== -1
}

function optget(opts: ParsedOption[], opt: string): string | boolean {
  const all = optgetall(opts, opt)
  const last = all[all.length - 1]
  return all.length > 0 && last !== undefined ? last : false
}

function optgetall(opts: ParsedOption[], name: string): (string | boolean)[] {
  const result: (string | boolean)[] = []
  for (const opt of opts) {
    if (opt.name === name) {
      result.push(opt.value != null ? opt.value : true)
    }
  }
  return result
}

function getfields(opts: ParsedOption[]): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const field of optgetall(opts, 'field')) {
    if (typeof field === 'string') {
      const segments = field.split('=')
      const key = segments[0]
      if (key) {
        fields[key] = segments.slice(1).join('=')
      }
    }
  }
  return fields
}

const subcommands: Record<string, SubcommandHandler | SubcommandMap> = {
  register(opts, tgts) {
    const err = validate(
      opts,
      tgts,

      allowOptions(anyOf('register'), (_opt) => `register doesn't accept any options`),

      noTargets('too many arguments passed to register'),
    )

    if (err) return err

    return {}
  },

  assemblies: {
    create(opts, tgts) {
      let err = validate(
        opts,
        tgts,

        allowOptions(
          anyOf(
            'steps',
            'template',
            'field',
            'watch',
            'recursive',
            'input',
            'output',
            'delete-after-processing',
            'reprocess-stale',
          ),
          (opt) => `assemblies create doesn't accept the option --${opt.name}`,
        ),

        exactlyOneOfOption(
          anyOf('steps', 'template'),
          (_opt) => 'assemblies create requires exactly one of either --steps and --template',
        ),

        atMostOneOfOption(
          anyOf('output'),
          (_opt) => 'assemblies create accepts at most one --output',
        ),

        noTargets('too many arguments passed to assemblies create'),
      )

      const inputs = optgetall(opts, 'input') as string[]

      if (inputs.length === 0 && optget(opts, 'watch')) {
        err = {
          error: 'MISSING_ARGUMENT',
          message: 'assemblies create --watch requires at least one input',
        }
      }

      if (err) return err

      return {
        steps: optget(opts, 'steps'),
        template: optget(opts, 'template'),
        fields: getfields(opts),
        watch: optget(opts, 'watch'),
        recursive: optget(opts, 'recursive'),
        output: optget(opts, 'output') || null,
        del: optget(opts, 'delete-after-processing'),
        reprocessStale: optget(opts, 'reprocess-stale'),
        inputs,
      }
    },

    list(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(
          anyOf('before', 'after', 'keywords', 'fields'),
          (opt) => `assemblies list doesn't accept the option --${opt.name}`,
        ),

        atMostOneOfOption(
          anyOf('before'),
          (opt) => `assemblies list accepts at most one of --${opt?.name}`,
        ),

        atMostOneOfOption(
          anyOf('after'),
          (opt) => `assemblies list accepts at most one of --${opt?.name}`,
        ),

        atMostOneOfOption(
          anyOf('fields'),
          (opt) => `assemblies list accepts at most one of --${opt?.name}`,
        ),

        noTargets('too many arguments passed to assemblies list'),
      )

      if (err) return err

      const keywords: string[] = []
      for (const arg of optgetall(opts, 'keywords')) {
        if (typeof arg === 'string') {
          for (const kw of arg.split(',')) keywords.push(kw)
        }
      }

      let fields: string[] | undefined
      const fieldsOpt = optget(opts, 'fields')
      if (typeof fieldsOpt === 'string') fields = fieldsOpt.split(',')

      return {
        before: optget(opts, 'before') || undefined,
        after: optget(opts, 'after') || undefined,
        fields,
        keywords,
      }
    },

    get(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(anyOf(), (opt) => `assemblies get doesn't accept the option --${opt.name}`),

        requireTargets('no assemblies specified'),
      )

      if (err) return err

      return {
        assemblies: tgts,
      }
    },

    delete(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(anyOf(), (opt) => `assemblies delete doesn't accept the option --${opt.name}`),

        requireTargets('no assemblies specified'),
      )

      if (err) return err

      return {
        assemblies: tgts,
      }
    },

    replay(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(
          anyOf('reparse-template', 'field', 'steps', 'notify-url'),
          (opt) => `assemblies replay doesn't accept the option --${opt.name}`,
        ),

        atMostOneOfOption(
          anyOf('steps'),
          (_opt) => 'too many --steps provided to assemblies replay',
        ),

        atMostOneOfOption(
          anyOf('notify-url'),
          (_opt) => 'too many --notify-urls provided to assemblies replay',
        ),

        requireTargets('no assemblies specified'),
      )

      if (err) return err

      return {
        fields: getfields(opts),
        reparse: optget(opts, 'reparse-template'),
        steps: optget(opts, 'steps'),
        notify_url: optget(opts, 'notify-url') || undefined,
        assemblies: tgts,
      }
    },
  },

  templates: {
    create(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(anyOf(), (opt) => `templates create doesn't accept the option --${opt.name}`),

        nTargets(1, 2, {
          few: 'too few arguments passed to templates create',
          many: 'too many arguments passed to templates create',
        }),
      )

      if (err) return err

      return {
        name: tgts[0],
        file: tgts.length === 2 ? tgts[1] : '-',
      }
    },

    get(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(anyOf(), (opt) => `templates create doesn't accept the option --${opt.name}`),

        requireTargets('no template specified'),
      )

      if (err) return err

      return {
        templates: tgts,
      }
    },

    modify(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(
          anyOf('name'),
          (opt) => `templates modify doesn't accept the option --${opt.name}`,
        ),

        nTargets(1, 2, {
          few: 'too few arguments passed to templates modify',
          many: 'too many arguments passed to templates modify',
        }),
      )

      if (err) return err

      return {
        template: tgts[0],
        name: optget(opts, 'name') || undefined,
        file: tgts.length === 2 ? tgts[1] : '-',
      }
    },

    delete(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(anyOf(), (opt) => `templates delete doesn't accept the option --${opt.name}`),

        requireTargets('no template specified'),
      )

      if (err) return err

      return {
        templates: tgts,
      }
    },

    list(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(
          anyOf('after', 'before', 'sort', 'order', 'fields'),
          (opt) => `templates list doesn't accept the option --${opt.name}`,
        ),

        atMostOneOfOption(
          anyOf('before'),
          (opt) => `templates list accepts at most one of --${opt?.name}`,
        ),

        atMostOneOfOption(
          anyOf('after'),
          (opt) => `templates list accepts at most one of --${opt?.name}`,
        ),

        atMostOneOfOption(
          anyOf('sort'),
          (opt) => `templates list accepts at most one of --${opt?.name}`,
        ),

        atMostOneOfOption(
          anyOf('order'),
          (opt) => `templates list accepts at most one of --${opt?.name}`,
        ),

        atMostOneOfOption(
          anyOf('fields'),
          (opt) => `templates list accepts at most one of --${opt?.name}`,
        ),

        noTargets('too many arguments passed to templates list'),
      )

      if (err) return err

      let fields: string[] | undefined
      const fieldsOpt = optget(opts, 'fields')
      if (typeof fieldsOpt === 'string') fields = fieldsOpt.split(',')

      return {
        before: optget(opts, 'before') || undefined,
        after: optget(opts, 'after') || undefined,
        sort: optget(opts, 'sort') || 'created',
        order: optget(opts, 'order') || 'desc',
        fields,
      }
    },

    sync(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(
          anyOf('recursive'),
          (opt) => `templates sync doesn't accept the option --${opt.name}`,
        ),
      )

      if (err) return err

      return {
        recursive: optget(opts, 'recursive'),
        files: tgts,
      }
    },
  },

  'assembly-notifications': {
    replay(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(
          anyOf('notify-url'),
          (opt) => `assembly-notifications replay doesn't accept the option --${opt.name}`,
        ),

        atMostOneOfOption(
          anyOf('notify-url'),
          (opt) => `assembly-notifications replay accepts at most one of --${opt?.name}`,
        ),

        requireTargets('no assemblies specified'),
      )

      if (err) return err

      return {
        notify_url: optget(opts, 'notify-url') || undefined,
        assemblies: tgts,
      }
    },

    list(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(
          anyOf('failed', 'successful'),
          (opt) => `assembly-notifications list doesn't accept the option --${opt.name}`,
        ),

        atMostOneOfOption(
          anyOf('failed', 'successful'),
          (_opt) => 'assembly-notifications accepts at most one of --failed and --successful',
        ),

        nTargets(0, 1, {
          few: undefined,
          many: 'too many assembly ids provided to assembly-notifications list',
        }),
      )

      if (err) return err

      return {
        type: optget(opts, 'failed')
          ? 'failed'
          : optget(opts, 'successful')
            ? 'successful'
            : undefined,
        assembly_id: tgts[0],
      }
    },
  },

  bills: {
    get(opts, tgts) {
      const err = validate(
        opts,
        tgts,

        allowOptions(anyOf(), (_opt) => `bills get doesn't accept any options`),
      )

      if (err) return err

      const months: string[] = []
      for (const tgt of tgts) {
        const pat = /^(\d{4})-(\d{1,2})$/
        if (!tgt.match(pat)) {
          return {
            error: 'INVALID_ARGUMENT',
            message: `invalid date format '${tgt}' (YYYY-MM)`,
          }
        }
        months.push(tgt)
      }

      if (months.length === 0) {
        const d = new Date()
        months.push(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`)
      }

      return { months }
    },
  },

  help(opts, tgts) {
    const err = validate(
      opts,
      tgts,

      allowOptions(anyOf('help'), (_opt) => `--help doesn't accept any options`),

      noTargets('too many argument passed to --help'),
    )

    if (err) return err

    return {}
  },

  version(opts, tgts) {
    const err = validate(
      opts,
      tgts,

      allowOptions(anyOf('version'), (_opt) => `--version doesn't accept any options`),

      noTargets('too many argument passed to --version'),
    )

    if (err) return err

    return {}
  },
}
