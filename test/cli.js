import { assert } from "chai";
import Parser from "../src/Parser";

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

        it("should handle various permutations of the transloadify cli", function () {
        });
    });
});
