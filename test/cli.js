import { assert } from 'chai'
import Parser from '../src/Parser'
import cli from '../src/cli'

describe('Parser', function () {
  describe('constructor', function () {
    it('should set private fields', function () {
      let parser = new Parser()
      assert.deepEqual(parser._opts, [])
      assert.deepEqual(Object.keys(parser._longs), [])
      assert.deepEqual(Object.keys(parser._shorts), [])
    })
  })

  describe('register', function () {
    it('should add the declared option to its records', function () {
      let tests = [{ long: 'foo', short: 'f', hasArg: false },
                         { long: 'bar', short: null, hasArg: true }]
      let parser = new Parser()

      for (let test of tests) {
        parser.register(test.long, test.short, test.hasArg)
        let record = parser._opts[parser._opts.length - 1]
        assert.deepEqual(record, test)
        assert.equal(record, parser._longs[test.long])
        if (test.short) assert.equal(record, parser._shorts[test.short])
      }
    })
  })

  describe('parse', function () {
    it('should handle typical cli edge-cases', function () {
      let parser = new Parser()
      parser.register('recursive', 'r', false)
      parser.register('file', 'f', true)
      parser.command('mode', 'assemblies', 'a')
      parser.command('mode', 'templates')
      parser.command('action', 'create')

      let tests = [
        { args: '--recursive',
          opts: [ {recursive: null} ],
          tgts: [] },
        { args: '-r',
          opts: [ {recursive: null} ],
          tgts: [] },
        { args: '--recursive file.txt',
          opts: [ {recursive: null} ],
          tgts: [ 'file.txt' ] },
        { args: '-r file.txt',
          opts: [ {recursive: null} ],
          tgts: [ 'file.txt' ] },

        { args: '--file file.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [] },
        { args: '--file=file.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [] },
        { args: '-f file.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [] },
        { args: '-ffile.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [] },

        { args: '--recursive=invalid.txt',
          fail: 'UNNECESSARY_ARGUMENT' },
        { args: '-rinvalid.txt',
          fail: 'INVALID_OPTION' },

        { args: '--invalid',
          fail: 'INVALID_OPTION' },
        { args: '-i',
          fail: 'INVALID_OPTION' },

        { args: '-r file1.txt file2.txt',
          opts: [ {recursive: null} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt file2.txt -r',
          opts: [ {recursive: null} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt -r file2.txt',
          opts: [ {recursive: null} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },

        { args: '--recursive file1.txt file2.txt',
          opts: [ {recursive: null} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt file2.txt --recursive',
          opts: [ {recursive: null} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt --recursive file2.txt',
          opts: [ {recursive: null} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },

        { args: '--file file.txt file1.txt file2.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt --file file.txt file2.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt file2.txt --file file.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },

        { args: '--file=file.txt file1.txt file2.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt --file=file.txt file2.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt file2.txt --file=file.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },

        { args: '-f file.txt file1.txt file2.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt -f file.txt file2.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt file2.txt -f file.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },

        { args: '-ffile.txt file1.txt file2.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt -ffile.txt file2.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },
        { args: 'file1.txt file2.txt -ffile.txt',
          opts: [ {file: 'file.txt'} ],
          tgts: [ 'file1.txt', 'file2.txt' ] },

        { args: '-r -- file1.txt -f file.txt file2.txt',
          opts: [ {recursive: null} ],
          tgts: [ 'file1.txt', '-f', 'file.txt', 'file2.txt' ] },
        { args: '-r -',
          opts: [ {recursive: null} ],
          tgts: [ '-' ] },
        { args: '-f -',
          opts: [ {file: '-'} ],
          tgts: [] },
        { args: '-f -- -r',
          opts: [ {file: '--'}, {recursive: null} ],
          tgts: [] },

        { args: 'assemblies create',
          cmds: { mode: 'assemblies', action: 'create' },
          opts: [],
          tgts: [] },
        { args: 'templates',
          cmds: { mode: 'templates' },
          opts: [],
          tgts: [] },
        { args: 'a create',
          cmds: { mode: 'assemblies', action: 'create' },
          opts: [],
          tgts: [] },
        { args: 'assemblies create templates',
          cmds: { mode: 'assemblies', action: 'create' },
          opts: [],
          tgts: [ 'templates' ] }
      ]

      for (let test of tests) {
        let result = parser.parse(test.args.split(/\s+/))

        if (typeof test.fail !== 'undefined') {
          assert.propertyVal(result, 'error', test.fail)
          continue
        }

        assert.notProperty(result, 'error')

        let opts = result.options.map(opt => ({ [opt.name]: opt.value || null }))

        if (test.cmds) assert.deepEqual(test.cmds, result.commands)

        assert.deepEqual(test.opts, opts)

        assert.deepEqual(test.tgts, result.targets)
      }
    })
  })
})

describe('Cli', function () {
  it('should validate and interpret arguments appropriately', function () {
    let tests = [
      { args: '',
        rslt: { mode: 'register' } },
      { args: 'register',
        rslt: { mode: 'register' } },
      { args: 'register target',
        rslt: { error: 'INVALID_ARGUMENT' } },
      { args: 'register --watch',
        rslt: { error: 'INVALID_OPTION' } },

      { args: 'assemblies create --steps steps.json',
        rslt: { mode: 'assemblies',
          action: 'create',
          template: false,
          steps: 'steps.json',
          recursive: false,
          watch: false,
          fields: {},
          inputs: [],
          output: null } },
      { args: '--steps steps.json',
        rslt: { mode: 'assemblies',
          action: 'create',
          steps: 'steps.json' } },
      { args: '--template 5',
        rslt: { mode: 'assemblies',
          action: 'create',
          template: '5',
          steps: false } },
      { args: '-t5 --watch',
        rslt: { error: 'MISSING_ARGUMENT' } },
      { args: '-t5 --watch -ia',
        rslt: { watch: true } },
      { args: '-t5 --recursive',
        rslt: { recursive: true } },
      { args: '-t5 -ffoo=bar=baz -fa=b -fc=d',
        rslt: { fields: { foo: 'bar=baz', a: 'b', c: 'd' } } },
      { args: '-t5 -ia -ib -oc',
        rslt: { inputs: ['a', 'b'],
          output: 'c' } },
      { args: 'assemblies create',
        rslt: { error: 'INVALID_OPTION' } },
      { args: '--template 5 --steps steps.json',
        rslt: { error: 'INVALID_OPTION' } },
      { args: '-t5 -oa -ob',
        rslt: { error: 'INVALID_OPTION' } },

      { args: 'assemblies list',
        rslt: { mode: 'assemblies',
          action: 'list',
          before: undefined,
          after: undefined,
          keywords: [],
          fields: undefined } },
      { args: 'assemblies list -b 2016-09-11',
        rslt: { before: '2016-09-11' } },
      { args: 'assemblies list -a 2016-09-11',
        rslt: { after: '2016-09-11' } },
      { args: 'assemblies list --keywords=foo,bar --keywords=baz,qux',
        rslt: { keywords: ['foo', 'bar', 'baz', 'qux'] } },
      { args: 'assemblies list --fields foo,bar',
        reslt: { fields: ['foo', 'bar'] } },
      { args: 'assemblies list -a 2016-09-11 -a 2016-09-12',
        rslt: { error: 'INVALID_OPTION' } },
      { args: 'assemblies list --fields foo,bar --fields baz,qux',
        reslt: { error: 'INVALID_OPTION' } },

      { args: 'assemblies get a b c',
        rslt: { mode: 'assemblies',
          action: 'get',
          assemblies: ['a', 'b', 'c'] } },
      { args: 'assemblies get',
        rslt: { error: 'MISSING_ARGUMENT' } },
      { args: 'assemblies get --recursive',
        rslt: { error: 'INVALID_OPTION' } },

      { args: 'assemblies delete a b c',
        rslt: { mode: 'assemblies',
          action: 'delete',
          assemblies: ['a', 'b', 'c'] } },
      { args: 'assemblies delete',
        rslt: { error: 'MISSING_ARGUMENT' } },
      { args: 'assemblies delete --recursive',
        rslt: { error: 'INVALID_OPTION' } },

      { args: 'assemblies replay a b c',
        rslt: { mode: 'assemblies',
          action: 'replay',
          assemblies: ['a', 'b', 'c'],
          reparse: false,
          fields: {},
          steps: false } },
      { args: 'assemblies replay --reparse-template a',
        rslt: { reparse: true } },
      { args: 'assemblies replay -fa=b a',
        rslt: { fields: { a: 'b' } } },
      { args: 'assemblies replay',
        rslt: { error: 'MISSING_ARGUMENT' } },
      { args: 'assemblies replay --recursive',
        rslt: { error: 'INVALID_OPTION' } },

      { args: 'templates create foo',
        rslt: { mode: 'templates',
          action: 'create',
          name: 'foo',
          file: '-' } },
      { args: 'templates create foo steps.json',
        rslt: { name: 'foo',
          file: 'steps.json' } },
      { args: 'templates create',
        rslt: { error: 'MISSING_ARGUMENT' } },
      { args: 'templates create a b c',
        rslt: { error: 'INVALID_ARGUMENT' } },

      { args: 'templates get a',
        rslt: { mode: 'templates',
          action: 'get',
          templates: ['a'] } },
      { args: 'templates get a b',
        rslt: { templates: ['a', 'b'] } },
      { args: 'templates get',
        rslt: { error: 'MISSING_ARGUMENT' } },

      { args: 'templates modify foo',
        rslt: { mode: 'templates',
          action: 'modify',
          template: 'foo',
          name: undefined,
          file: '-' } },
      { args: 'templates modify foo steps.json',
        rslt: { template: 'foo',
          file: 'steps.json' } },
      { args: 'templates modify foo -n bar steps.json',
        rslt: { template: 'foo',
          name: 'bar',
          file: 'steps.json' } },
      { args: 'templates modify',
        rslt: { error: 'MISSING_ARGUMENT' } },
      { args: 'templates modify a b c',
        rslt: { error: 'INVALID_ARGUMENT' } },

      { args: 'templates delete a',
        rslt: { mode: 'templates',
          action: 'delete',
          templates: ['a'] } },
      { args: 'templates delete a b',
        rslt: { templates: ['a', 'b'] } },
      { args: 'templates delete',
        rslt: { error: 'MISSING_ARGUMENT' } },

      { args: 'templates list',
        rslt: { mode: 'templates',
          action: 'list',
          before: undefined,
          after: undefined,
          sort: 'created',
          order: 'desc',
          fields: undefined } },
      { args: 'templates list --before 2016-09-13 --after 2015-09-13',
        rslt: { before: '2016-09-13',
          after: '2015-09-13' } },
      { args: 'templates list --fields id,created',
        rslt: { fields: ['id', 'created'] } },
      { args: 'templates list --order=asc',
        rslt: { order: 'asc' } },
      { args: 'templates list --order=invalid',
        rslt: { error: 'INVALID_OPTION' } },
      { args: 'templates list --sort=name',
        rslt: { sort: 'name' } },
      { args: 'templates list --sort=invalid',
        rslt: { error: 'INVALID_OPTION' } },

      { args: 'bills get',
        rslt: { mode: 'bills',
          action: 'get',
          months: [`${new Date().getUTCFullYear()}-${new Date().getUTCMonth() + 1}`] } },
      { args: 'bills get 2016-08 2016-07',
        rslt: { months: ['2016-08', '2016-07'] } },
      { args: 'bills get invalid',
        rslt: { error: 'INVALID_ARGUMENT' } }
    ]

    for (let test of tests) {
      let args = test.args.split(/\s+/)
      let result = cli(args.filter(arg => arg.trim() !== '').length === 0 ? [] : args)
      if (args[0] === '--edit-template') console.log(result)
      for (let key in test.rslt) {
        if (!test.rslt.hasOwnProperty(key)) continue
        assert.deepEqual(test.rslt[key], result[key],
                   `expected result.${key} to be ${JSON.stringify(test.rslt[key])}; was ${result[key]}\nargs: ${test.args}\nresult: ${JSON.stringify(result)}\n`)
      }
    }
  })
})
