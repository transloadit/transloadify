import OutputProvider from "./OutputProvider";

export default function process({ steps, template, fields, watch, recursive, output, inputs }) {
    // verify and configure inputs and outputs
    if (output === "-" && inputs.length > 1) return log.error("too many inputs; provide output directory");
    fs.stat(output, (err, stats) => {
        let outProv;
        if (stats.isDirectory()) {
            outProv = new OutputProvider.Directory(output);
        } else if (inputs.length === 1) {
            if (output === "-"
}   
