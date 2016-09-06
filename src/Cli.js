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

const modes = [ "register", "process", "list", "info", "cancel", "replay",
                "create-template", "template-info", "edit-template",
                "delete-template", "list-templates", "bill", "help", "version" ];

function generalValidation(options) {
    let modesSpecified = [];
    for (let option of options) {
       if (modes.includes(option.name)) {
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
