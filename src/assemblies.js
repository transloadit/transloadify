import Q from "q";
import { stream2buf, createReadStream } from "./helpers";
import assembliesCreate from "./assemblies-create";

export const create = assembliesCreate;

export function list(client, { before, after, fields, keywords }) {
    let assemblies = client.streamAssemblies({
        fromdate: after,
        todate: before,
        fields, keywords
    });
    assemblies.on("readable", () => {
        let assembly = assemblies.read();
        if (assembly === null) return;

        if (fields == null) {
            console.log(assembly.id);
        } else {
            console.log(assembly);
        }
    });
    assemblies.on("error", err => {
        console.error("ERROR", err);
    });
}

export function get(client, { assemblies }) {
    let requests = assemblies.map(assembly => {
        let deferred = Q.defer();
        
        client.getAssembly(assembly, (err, result) => {
            if (err) deferred.reject(err);
            else deferred.resolve(result);
        });

        return deferred.promise;
    });

    requests.reduce((a, b) => {
        return a.then(result => {
            console.log(result);
            return b;
        });
    }).then(result => {
        console.log(result);
    }).fail(err => {
        console.error("ERROR", err.error, err);
    });
}

exports["delete"] = function _delete(client, { assemblies }) {
    for (let assembly of assemblies) {
        client.deleteAssembly(assembly, err => {
            if (err) console.error(err);
        });
    }
};

export function replay(client, { fields, reparse, steps, assemblies }) {
    if (steps) {
        stream2buf(createReadStream(steps), (err, buf) => {
            if (err) return console.err("ERROR", err);
            apiCall(JSON.parse(buf.toString()));
        });
    } else {
        apiCall();
    }

    function apiCall(steps) {
        for (let assembly of assemblies) {
            // TODO notify_url
            client.replayAssembly({
                assembly_id: assembly,
                reparse_template: reparse,
                fields, steps
            }, (err, result) => {
                if (err) return console.error("ERROR", err);
            });
        }
    }
}
