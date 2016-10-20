if (process.env.NODE_ENV !== "production") require('source-map-support').install();

import cli from "./cli";
import assembliesCreate from "./process";
import TransloaditClient from "transloadit";

let invocation = cli();

const commands = {
    assemblies: {
        create: assembliesCreate
    },
    templates: require("./templates")
};

let command = commands[invocation.mode];
if (invocation.action) command = command[invocation.action];

let client = new TransloaditClient({
    authKey: process.env.TRANSLOADIT_KEY,
    authSecret: process.env.TRANSLOADIT_SECRET
});

command(client, invocation);
