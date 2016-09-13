import { assert } from "chai";
import Parser from "../src/Parser";
import cli from "../src/cli";

describe("Parser", function () {
    describe("constructor", function () {
        it("should set private fields", function () {
            let parser = new Parser();
            assert.deepEqual(parser._opts, []);
            assert.deepEqual(Object.keys(parser._longs), []);
            assert.deepEqual(Object.keys(parser._shorts), []);
        });
    });

    describe("register", function () {
        it("should add the declared option to its records", function () {
            let tests = [{ long: "foo", short: "f", hasArg: false },
                         { long: "bar", short: null, hasArg: true }];
            let parser = new Parser();

            for (let test of tests) {
                parser.register(test.long, test.short, test.hasArg);
                let record = parser._opts[parser._opts.length - 1];
                assert.deepEqual(record, test);
                assert.equal(record, parser._longs[test.long]);
                if (test.short) assert.equal(record, parser._shorts[test.short]);
            }
        });
    });

    describe("parse", function () {
        it("should handle typical cli edge-cases", function () {
            let parser = new Parser();
            parser.register("recursive", "r", false);
            parser.register("file", "f", true);

            let tests = [
                { args: "--recursive",
                  opts: [ {recursive: null} ],
                  tgts: [] },
                { args: "-r",
                  opts: [ {recursive: null} ],
                  tgts: [] },
                { args: "--recursive file.txt",
                  opts: [ {recursive: null} ],
                  tgts: [ "file.txt" ] },
                { args: "-r file.txt",
                  opts: [ {recursive: null} ],
                  tgts: [ "file.txt" ] },

                { args: "--file file.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [] },
                { args: "--file=file.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [] },
                { args: "-f file.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [] },
                { args: "-ffile.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [] },
                
                { args: "--recursive=invalid.txt",
                  fail: "UNNECESSARY_ARGUMENT" },
                { args: "-rinvalid.txt",
                  fail: "INVALID_OPTION" },

                { args: "--invalid",
                  fail: "INVALID_OPTION" },
                { args: "-i",
                  fail: "INVALID_OPTION" },

                { args: "-r file1.txt file2.txt",
                  opts: [ {recursive: null} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt file2.txt -r",
                  opts: [ {recursive: null} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt -r file2.txt",
                  opts: [ {recursive: null} ],
                  tgts: [ "file1.txt", "file2.txt" ] },

                { args: "--recursive file1.txt file2.txt",
                  opts: [ {recursive: null} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt file2.txt --recursive",
                  opts: [ {recursive: null} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt --recursive file2.txt",
                  opts: [ {recursive: null} ],
                  tgts: [ "file1.txt", "file2.txt" ] },

                { args: "--file file.txt file1.txt file2.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt --file file.txt file2.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt file2.txt --file file.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },

                { args: "--file=file.txt file1.txt file2.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt --file=file.txt file2.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt file2.txt --file=file.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },

                { args: "-f file.txt file1.txt file2.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt -f file.txt file2.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt file2.txt -f file.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },

                { args: "-ffile.txt file1.txt file2.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt -ffile.txt file2.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },
                { args: "file1.txt file2.txt -ffile.txt",
                  opts: [ {file: "file.txt"} ],
                  tgts: [ "file1.txt", "file2.txt" ] },

                { args: "-r -- file1.txt -f file.txt file2.txt",
                  opts: [ {recursive: null} ],
                  tgts: [ "file1.txt", "-f", "file.txt", "file2.txt" ] },
                { args: "-r -",
                  opts: [ {recursive: null} ],
                  tgts: [ "-" ] },
                { args: "-f -",
                  opts: [ {file: "-"} ],
                  tgts: [] },
                { args: "-f -- -r",
                  opts: [ {file: "--"}, {recursive: null} ],
                  tgts: [] },
            ];

            for (let test of tests) {
                let result = parser.parse(test.args.split(/\s+/));

                if (typeof test.fail !== "undefined") {
                    assert.propertyVal(result, "error", test.fail);
                    continue;
                }

                let opts = result.options.map(opt => ({ [opt.name]: opt.value || null }));

                assert.deepEqual(test.opts, opts);
                
                assert.deepEqual(test.tgts, result.targets);
            }
        });
    });
});

describe("Cli", function () {
    it("should validate and interpret arguments appropriately", function () {
       let tests = [
           { args: "",
             rslt: { mode: "register" } },
           { args: "--register",
             rslt: { mode: "register" } },
           { args: "--register target",
             rslt: { error: "INVALID_ARGUMENT" } },
           { args: "--register --watch",
             rslt: { error: "INVALID_OPTION" } },

           { args: "--steps steps.json",
             rslt: { mode: "process",
                     template: false,
                     steps: "steps.json",
                     recursive: false,
                     watch: false,
                     fields: {},
                     inputs: ["-"],
                     output: "-" } },
           { args: "--template 5",
             rslt: { mode: "process",
                     template: "5",
                     steps: false } },
           { args: "-t5 --watch",
             rslt: { watch: true } },
           { args: "-t5 --recursive",
             rslt: { recursive: true } },
           { args: "-t5 -ffoo=bar=baz -fa=b -fc=d",
             rslt: { fields: { foo: "bar=baz", a: "b", c: "d" } } },
           { args: "--process",
             rslt: { error: "INVALID_OPTION" } },
           { args: "--template 5 --steps steps.json",
             rslt: { error: "INVALID_OPTION" } },
           
           { args: "--list",
             rslt: { mode: "list",
                     before: false,
                     after: false,
                     keywords: [],
                     fields: [] } },
           { args: "--list -b 2016-09-11",
             rslt: { before: "2016-09-11" } },
           { args: "--list -a 2016-09-11",
             rslt: { after: "2016-09-11" } },
           { args: "--list --keywords=foo,bar --keywords=baz,qux",
             rslt: { keywords: ["foo", "bar", "baz", "qux"] } },
           { args: "--list --fields foo,bar",
             reslt: { fields: ["foo", "bar"] } },
           { args: "--list -a 2016-09-11 -a 2016-09-12",
             rslt: { error: "INVALID_OPTION" } },
           { args: "--list --fields foo,bar --fields baz,qux",
             reslt: { error: "INVALID_OPTION" } },

           { args: "--info a b c",
             rslt: { mode: "info",
                     assemblies: ["a", "b", "c"] } },
           { args: "--info",
             rslt: { error: "MISSING_ARGUMENT" } },
           { args: "--info --recursive",
             rslt: { error: "INVALID_OPTION" } },

           { args: "--cancel a b c",
             rslt: { mode: "cancel",
                     assemblies: ["a", "b", "c"] } },
           { args: "--cancel",
             rslt: { error: "MISSING_ARGUMENT" } },
           { args: "--cancel --recursive",
             rslt: { error: "INVALID_OPTION" } },

           { args: "--replay a b c",
             rslt: { mode: "replay",
                     assemblies: ["a", "b", "c"],
                     reparse: false,
                     fields: {},
                     steps: false } },
           { args: "--replay --reparse-template a",
             rslt: { reparse: true } },
           { args: "--replay -fa=b a",
             rslt: { fields: { a: "b" } } },
           { args: "--replay",
             rslt: { error: "MISSING_ARGUMENT" } },
           { args: "--replay --recursive",
             rslt: { error: "INVALID_OPTION" } },
             
           { args: "--create-template foo",
             rslt: { mode: "create-template",
                     name: "foo",
                     file: "-" } },
           { args: "--create-template foo steps.json",
             rslt: { name: "foo",
                     file: "steps.json" } },
           { args: "--create-template",
             rslt: { error: "MISSING_ARGUMENT" } },
           { args: "--create-template a b c",
             rslt: { error: "INVALID_ARGUMENT" } },

           { args: "--template-info a",
             rslt: { mode: "template-info",
                     templates: ["a"] } },
           { args: "--template-info a b",
             rslt: { templates: ["a", "b"] } },
           { args: "--template-info",
             rslt: { error: "MISSING_ARGUMENT" } },

           { args: "--edit-template foo",
             rslt: { mode: "edit-template",
                     template: "foo",
                     file: "-" } },
           { args: "--edit-template foo steps.json",
             rslt: { template: "foo",
                     file: "steps.json" } },
           { args: "--edit-template",
             rslt: { error: "MISSING_ARGUMENT" } },
           { args: "--edit-template a b c",
             rslt: { error: "INVALID_ARGUMENT" } },

           { args: "--delete-template a",
             rslt: { mode: "delete-template",
                     templates: ["a"] } },
           { args: "--delete-template a b",
             rslt: { templates: ["a", "b"] } },
           { args: "--delete-template",
             rslt: { error: "MISSING_ARGUMENT" } },

           { args: "--list-templates",
             rslt: { mode: "list-templates",
                     before: false,
                     after: false,
                     sort: "created",
                     order: "desc",
                     fields: [] } },
           { args: "--list-templates --before 2016-09-13 --after 2015-09-13",
             rslt: { before: "2016-09-13",
                     after: "2015-09-13" } },
           { args: "--list-templates --fields id,created",
             rslt: { fields: ["id", "created"] } },
           { args: "--list-templates --order=asc",
             rslt: { order: "asc" } },
           { args: "--list-templates --order=invalid",
             rslt: { error: "INVALID_OPTION" } },
           { args: "--list-templates --sort=name",
             rslt: { sort: "name" } },
           { args: "--list-templates --sort=invalid",
             rslt: { error: "INVALID_OPTION" } },
             
           { args: "--bill",
             rslt: { mode: "bill",
                     months: [`${new Date().getUTCFullYear()}-${new Date().getUTCMonth()+1}`] } },
           { args: "--bill 2016-08 2016-07",
             rslt: { months: ["2016-08", "2016-07"] } },
           { args: "--bill invalid",
             rslt: { error: "INVALID_ARGUMENT" } }
       ];

       for (let test of tests) {
           let args = test.args.split(/\s+/);
           let result = cli(args == false ? [] : args);
           if (args[0] === "--edit-template") console.log(result);
           for (let key in test.rslt) {
               if (!test.rslt.hasOwnProperty(key)) continue;
               assert.deepEqual(test.rslt[key], result[key],
                   `expected result.${key} to be ${JSON.stringify(test.rslt[key])}; was ${result[key]}\nargs: ${test.args}\nresult: ${JSON.stringify(result)}\n`);
           }
       }
    });
});
