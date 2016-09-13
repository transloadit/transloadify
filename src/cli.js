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
parser.register("edit-template", null, false);
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
    let result = parser.parse(...args);
    if (result.error != null) return result;

    let { options, targets } = result;

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

       if (option.name === "sort" && !["id", "name", "created", "modified"].includes(option.value)) {
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
    for (let option of opts) {
        if (option.name in subcommands) {
            mode = option.name;
            break;
        }
    }

    if (!mode) mode = opts.length === 0 ? "register" : "process";

    let verbosity = getVerbosity(opts);
    let result = subcommands[mode](opts, tgts);
    
    if (!result.error) {
        result.logLevel = verbosity;
        result.mode = mode;
    }

    return result;
}

// determine the specified verbosity, and remove any verbosity-related options
// so that we don't have to worry about them.
function getVerbosity(opts) {
    let result = 1;
    let writeAt = 0;
    for (let readFrom = 0; readFrom < opts.length; readFrom++) {
        if (opts[readFrom].name === "verbosity") result = parseInt(opts[i].value, 10);
        else if (opts[readFrom].name === "verbose") result = 2;
        else if (opts[readFrom].name === "quiet") result = 0;
        else opts[writeAt++] = opts[readFrom];
    }
    opts.splice(writeAt);
    return result;
}

function allowOptions(optClassFn, msgfn) {
    return (opts, tgts) => {
        let invalid = opts.filter(opt => !optClassFn(opt));
        if (invalid.length > 0) {
            return {
                error: "INVALID_OPTION",
                message: msgfn(invalid[0])
            };
        }
    };
}

function nOfOption(optClassFn, low, high, msgfn) {
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

function exactlyOneOfOption(optClassFn, msgfn) {
    return nOfOption(optClassFn, 1, 1, msgfn);
}
function atMostOneOfOption(optClassFn, msgfn) {
    return nOfOption(optClassFn, 0, 1, msgfn);
}
function atLeastOneOfOption(optClassFn, msgfn) {
    return nOfOption(optClassFn, 1, Infinity, msgfn);
}

function noTargets(msg) {
    return (opts, tgts) => {
        if (tgts.length > 0) {
            return {
                error: "INVALID_ARGUMENT",
                message: msg
            };
        }
    };
}
function requireTargets(msg) {
    return (opts, tgts) => {
        if (tgts.length === 0) {
            return {
                error: "MISSING_ARGUMENT",
                message: msg
            };
        }
    };
}
function nTargets(low, high, { few, many }) {
    return (opts, tgts) => {
        if (tgts.length < low) {
            return {
                error: "MISSING_ARGUMENT",
                message: few
            };
        }
        if (tgts.length > high) {
            return {
                error: "INVALID_ARGUMENT",
                message: many
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

function anyOf(...args) {
    return opt => args.includes(opt.name);
}

function optget(opts, opt) {
    let all = optgetall(opts, opt);
    return all.length > 0 ? all[all.length - 1] : false;
}

function optgetall(opts, name) {
    let result = [];
    for (let opt of opts) {
        if (opt.name === name) {
            result.push(opt.value != null ? opt.value : true);
        }
    }
    return result;
}

function getfields(opts) {
    let fields = {};
    for (let field of optgetall(opts, "field")) {
        let segments = field.split("=");
        fields[segments[0]] = segments.slice(1).join("=");
    }
    return fields;
}

const subcommands = {
    register(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("register"),
                         opt => `--register doesn't accept any options`),

            noTargets("too many arguments passed to --register"));

        if (err) return err;

        return {};
    },
    
    process(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("process", "steps", "template", "field", "watch", "recursive", "output"),
                         opt => `--process doesn't accept the option --${opt.name}`),

            exactlyOneOfOption(anyOf("steps", "template"),
                               opt => `--process requires exactly one of either --steps and --template`),

            atMostOneOfOption(anyOf("output"),
                              opt => `--process accepts at most one --output`));

        if (err) return err;

        return {
            steps: optget(opts, "steps"),
            template: optget(opts, "template"),
            fields: getfields(opts),
            watch: optget(opts, "watch"),
            recursive: optget(opts, "recursive"),
            output: optget(opts, "output") || "-",
            inputs: tgts.length > 0 ? tgts : ["-"]
        };
    },

    list(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("list", "before", "after", "keywords", "fields"),
                         opt => `--list doesn't accept the option --${opt.name}`),

            atMostOneOfOption(anyOf("before"),
                             opt => `--list accepts at most one of --${opt.name}`),

            atMostOneOfOption(anyOf("after"),
                             opt => `--list accepts at most one of --${opt.name}`),

            atMostOneOfOption(anyOf("fields"),
                             opt => `--list accepts at most one of --${opt.name}`),

            noTargets("too many arguments passed to --list"));

        if (err) return err;

        let keywords = [];
        for (let arg of optgetall(opts, "keywords")) {
            for (let kw of arg.split(",")) keywords.push(kw);
        }

        let fields = optget(opts, "fields");
        if (fields) fields = fields.split(",");
        else fields = [];

        return {
            before: optget(opts, "before"),
            after: optget(opts, "after"),
            fields,
            keywords
        };
    },

    info(opts, tgts) {
        let err = validate(opts, tgts,
            
            allowOptions(anyOf("info"),
                         opt => `--info doesn't accept the option --${opt.name}`),

            requireTargets("no assemblies specified"));

        if (err) return err;

        return {
            assemblies: tgts
        };
    },

    cancel(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("cancel"),
                         opt => `--cancel doesn't accept the option --${opt.name}`),

            requireTargets("no assemblies specified"));

        if (err) return err;

        return {
            assemblies: tgts
        };
    },

    replay(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("replay", "reparse-template", "field", "steps"),
                         opt => `--replay doesn't accept the option --${opt.name}`),

            atMostOneOfOption(anyOf("steps"),
                              opt => `too many --steps provided to --replay`),

            requireTargets("no assemblies specified"));

        if (err) return err;

        return {
            fields: getfields(opts),
            reparse: optget(opts, "reparse-template"),
            steps: optget(opts, "steps"),
            assemblies: tgts
        };
    },

    "create-template": function createTemplate(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("create-template"),
                         opt => `--create-template doesn't accept the option --${opt.name}`),

            nTargets(1, 2,
                     { few: "too few arguments passed to --create-template",
                       many: "too many arguments passed to --create-template" }));

        if (err) return err;

        return {
            name: tgts[0],
            file: tgts.length === 2 ? tgts[1] : "-"
        };
    },

    "template-info": function templateInfo(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("template-info"),
                         opt => `--template-info doesn't accept the option --${opt.name}`),

            requireTargets("no template specified"));

        if (err) return err;

        return {
            templates: tgts
        };
    },

    "edit-template": function editTemplate(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("edit-template"),
                         opt => `--edit-template doesn't accept the option --${opt.name}`),

            nTargets(1, 2,
                     { few: "too few arguments passed to --edit-template",
                       many: "too many arguments passed to --edit-template" }));

        if (err) return err;

        return {
            template: tgts[0],
            file: tgts.length === 2 ? tgts[1] : "-"
        };
    },

    "delete-template": function deleteTemplate(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("delete-template"),
                         opt => `--delete-template doesn't accept the option --${opt.name}`),

            requireTargets("no template specified"));

        if (err) return err;

        return {
            templates: tgts
        };
    },

    "list-templates": function listTemplates(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("list-templates", "after", "before", "sort", "order", "fields"),
                         opt => `--list-templates doesn't accept the option --${opt.name}`),

            atMostOneOfOption(anyOf("before"),
                              opt => `--list-templates accepts at most one of --${opt.name}`),

            atMostOneOfOption(anyOf("after"),
                              opt => `--list-templates accepts at most one of --${opt.name}`),

            atMostOneOfOption(anyOf("sort"),
                              opt => `--list-templates accepts at most one of --${opt.name}`),

            atMostOneOfOption(anyOf("order"),
                              opt => `--list-templates accepts at most one of --${opt.name}`),

            atMostOneOfOption(anyOf("fields"),
                              opt => `--list-templates accepts at most one of --${opt.name}`),

            noTargets("too many arguments passed to --list-templates"));

        if (err) return err;

        let fields = optget(opts, "fields");
        if (fields) fields = fields.split(",");
        else fields = [];

        return {
            before: optget(opts, "before"),
            after: optget(opts, "after"),
            sort: optget(opts, "sort") || "created",
            order: optget(opts, "order") || "desc",
            fields
        };
    },

    bill(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("bill"),
                         opt => `--bill doesn't accept any options`));

        if (err) return err;

        let months = [];
        for (let tgt of tgts) {
            const pat = /^(\d{4})-(\d{1,2})$/;
            if (!tgt.match(pat)) {
                return {
                    error: "INVALID_ARGUMENT",
                    message: `invalid date format '${tgt}' (YYYY-MM)`
                };
            }
            months.push(tgt);
        }

        if (months.length === 0) {
            let d = new Date();
            months.push(`${d.getUTCFullYear()}-${d.getUTCMonth()+1}`);
        }

        return { months };
    },

    help(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("help"),
                         opt => `--help doesn't accept any options`),

            noTargets("too many argument passed to --help"));

        if (err) return err;

        return {};
    },

    version(opts, tgts) {
        let err = validate(opts, tgts,

            allowOptions(anyOf("version"),
                         opt => `--version doesn't accept any options`),

            noTargets("too many argument passed to --version"));

        if (err) return err;

        return {};
    }
};
