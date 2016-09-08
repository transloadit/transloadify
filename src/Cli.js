import fs from "fs";
import Parser from "./Parser";

const parser = new Parser();
parser.register("register", null, false);
parser.register("process", "p", false);
parser.register("steps", null, true);
parser.register("template", "t", true);
parser.register("field", "f", true);
parser.register("watch", "w", false);
parser.register("recursive", "r", false);
parser.register("output", "o", true);
parser.register("list", "l", false);
parser.register("after", "a", true);
parser.register("before", "b", true);
parser.register("keywords", null, true);
parser.register("fields", null, true);
parser.register("info", "i", false);
parser.register("cancel", null, false);
parser.register("replay", null, false);
parser.register("reparse-template", null, false);
parser.register("create-template", null, false);
parser.register("template-info", null, false);
parser.register("delete-template", null, false);
parser.register("list-templates", null, false);
parser.register("sort", null, true);
parser.register("order", null, true);
parser.register("bill", null, false);
parser.register("key", "k", true);
parser.register("secret", "s", true);
parser.register("verbosity", "v", true);
parser.register("verbose", null, false);
parser.register("quiet", "q", false);
parser.register("version", null, false);
parser.register("help", "h", false);

export default function cli(...args) {
    let { options, targets } = parser.parse(...args);

    let err = generalValidation(options);
    if (err != null) return err;

    return modeDispatch(options, targets);
}

function generalValidation(options) {
    let modesSpecified = [];
    for (let option of options) {
       if (option.name in subcommands) {
           modesSpecified.push(option.name);
           if (modesSpecified.length > 1) {
               return {
                   error: "MULTIPLE_MODES",
                   option: option.name,
                   message: `Mutually exclusive options specified: '${modesSpecified[0]}' and '${modesSpecified[1]}'`
               };
           }
       }
       
       if (option.name === "field" && !option.value.match(/^[^=]+=[\s\S]*$/)) {
           return {
               error: "INVALID_OPTION",
               option: option.name,
               message: `invalid argument for --field: '${option.value}'`
           };
       }

       if (option.name === "after" || option.name === "before") {
           // TODO reject invalid dates
       }

       if (option.name === "sort" && !["id", "created", "modified"].includes(option.value)) {
           return {
               error: "INVALID_OPTION",
               option: option.name,
               message: `invalid argument for --sort`
           };
       }

       if (option.name === "order" && !["asc", "desc"].includes(option.value)) {
           return {
               error: "INVALID_OPTION",
               option: option.name,
               message: `invalid argument for --order`
           };
       }

       if (option.name === "verbosity" && !["0", "1", "2"].includes(option.value)) {
           return {
               error: "INVALID_OPTION",
               option: option.name,
               message: `invalid argument for --verbosity`
           };
       }
    }
}

function modeDispatch(opts, tgts) {
    let mode;
    for (option of options) {
        if (option.name in subcommands) {
            mode = option;
            break;
        }
    }

    if (!mode) mode = opts.length === 0 ? "register" : "process";

    return subcommands[mode](opts, tgts);
}

function allowOptions(optClassFn, msgfn) {
    return (opts, tgts) => {
        let invalid = opts.filter(optClassFn);
        if (invalid.length > 0) {
            return {
                error: "INVALID_OPTION",
                message: msgfn(invalid[0])
            };
        }
    };
}

function nOfOptionPresent(optClassFn, low, high, msgfn) {
    return (opts, tgts) => {
        let relevantOpts = opts.filter(optClassFn);
        if (!(low <= relevantOpts.length && relevantOpts.length <= high)) {
            return {
                error: "INVALID_OPTION",
                message: msgfn(relevantOpts[0])
            };
        }
    };
}

function validate(opts, tgts, ...constraints) {
    for (let constraint of constraints) {
        let err = constraint(opts, tgts);
        if (err) return err;
    }
}

const subcommands = {
    register(opts, tgts) {
        let err = validate(opts, tgts,
            relevantOpts = opt
        // if (opts.filter(opt => opt.name !== "register").length !== 0) {
        //     return {
        //         error: "INVALID_OPTION",
        //         message: "--register doesn't accept any options"
        //     };
        // }
        //
        // if (tgts.length > 0) {
        //     return {
        //         error: "INVALID_TARGET",
        //         message: "too many arguments passed to --register"
        //     };
        // }
    },
    
    process(opts, tgts) {
        let instructions = opts.filter(opt => ["steps", "template"].includes(opt.name));
        if (instructions.length > 1) {
            return {
                error: "INVALID_OPTION",
                option: instructions[1].name,
                message: "--process accepts only one of --steps and --template"
            };
        }
        if (instructions.length === 0) {
            return {
                error: "REQUIRED_OPTION",
                option: "process",
                message: "--process requires one of --steps or --template"
            };
        }

        instructions = instructions[0];

        if (opts.filter(opt => opt.name === "output").length > 1) {
            return {
                error: "INVALID_OPTION",
                option: "output",
                message: "--process accepts at most one --output"
            };
        }
    },

    list(opts, tgts) {
        for (let flag of ["before", "after", "fields"]) {
            if (opts.filter(opt => opt.name === flag).length > 1) {
                return {
                    error: "INVALID_OPTION",
                    option: flag,
                    message: `--list accepts at most one --${flag}`
                };
            }
        }

        if (tgts.length > 0) {
            return {
                error: "INVALID_TARGET",
                message: "too many arguments passed to --list"
            };
        }
    },

    info(opts, tgts) {
        if (opts.filter(opt => opt.name !== "info")) {
            return {
                error: "INVALID_OPTION",
                message: "--info doesn't accept any options"
            };
        }

        if (tgts.length === 0) {
            return {
                error: "REQUIRED_TARGET",
                option: "info",
                message: "no assemblies specified"
            };
        }
    },

    cancel(opts, tgts) {
        if (opts.filter(opt => opt.name !== "cancel")) {
            return {
                error: "INVALID_OPTION",
                message: "--cancel doesn't accept any options"
            };
        }

        if (tgts.length === 0) {
            return {
                error: "REQUIRED_TARGET",
                option: "info",
                message: "no assemblies specified"
            };
        }
    },

    replay(opts, tgts) {
        if
