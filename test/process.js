import { assert } from "chai";
import { TransloaditClient, monitor } from "../src/process-mocks";
import assembliesCreate from "../src/process";

describe("Assemblies Create", function () {
    it("should work", function (done) {
        let tests = [
            { params: { template: "_", inputs: ["-"], output: "-" },
              expect: [ { ins: ["<STDIN>"], out: "<STDOUT>" } ] },
            { params: { template: "_", inputs: ["a"], output: "b" },
              expect: [ { ins: ["a/d"], out: "b/a/d" },
                        { ins: ["a/e"], out: "b/a/e" } ] },
            { params: { template: "_", inputs: ["a"], recursive: true, output: "b" },
              expect: [ { ins: ["a/d"], out: "b/a/d" },
                        { ins: ["a/e"], out: "b/a/e" },
                        { ins: ["a/f/g"], out: "b/a/f/g" },
                        { ins: ["a/f/h"], out: "b/a/f/h" },
                        { ins: ["a/f/i"], out: "b/a/f/i" } ] },
            { params: { template: "_", inputs: ["a/d"], watch: true, output: "b" },
              expect: [ { ins: ["a/d"], out: "b/a/d" },
                        { ins: ["a/d"], out: "b/a/d" },
                        { ins: ["a/d"], out: "b/a/d" } ] }
        ];

        let client = new TransloaditClient();

        runTest(0);
        
        function runTest(testno) {
            let test = tests[testno];

            let executions = [];
            let listener = record => executions.push(record);
            monitor.addListener("execution", listener);

            assembliesCreate(client, test.params);

            setTimeout(() => {
                monitor.removeListener("execution", listener);
                assert.deepEqual(executions, test.expect);

                if (++testno < tests.length) runTest(testno);
                else done();
            }, 10);
        }
    });
});
