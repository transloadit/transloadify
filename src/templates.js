import Q from "q";
import { stream2buf, createReadStream } from "./helpers";

export function create(client, { name, file }) {
    stream2buf(createReadStream(file), (err, buf) => {
        client.createTemplate({ name, template: buf.toString() }, (err, result) => {
            if (err) return console.error("ERROR", err);
            console.log(result.id);
        });
    });
}

export function get(client, { templates }) {
    let requests = templates.map(template => {
        let deferred = Q.defer();
        
        client.getTemplate(template, (err, result) => {
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

export function modify(client, { template, name, file }) {
    stream2buff(createReadStream(file), (err, buf) => {
        client.createTemplate(template, { name, template: buf.toString() }, (err, result) => {
            if (err) return console.error("ERROR", err);
            console.log(result.id);
        });
    });
}

exports["delete"] = function _delete(client, { templates }) {
    for (let template of templates) {
        client.deleteTemplate(template, err => {
            if (err) console.error(err);
        });
    }
};

export function list(client, { before, after, order, sort, fields }) {
    let stream = client.streamTemplates({
        todate: before,
        fromdate: after,
        order, sort, fields
    });
    stream.on("readable", () => {
        let template = stream.read();
        if (template === null) return;

        if (fields == null) {
            console.log(template.id);
        } else {
            console.log(template);
        }
    });
    stream.on("error", err => {
        console.error("ERROR", err);
    });
}
