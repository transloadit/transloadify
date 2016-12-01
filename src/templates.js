import Q from "q";
import { stream2buf, createReadStream, inSequence, formatAPIError } from "./helpers";

export function create(output, client, { name, file }) {
    stream2buf(createReadStream(file), (err, buf) => {
        client.createTemplate({ name, template: buf.toString() }, (err, result) => {
            if (err) return output.error(err.message);
            output.print(result.id, result);
        });
    });
}

export function get(output, client, { templates }) {
    let requests = templates.map(template => {
        let deferred = Q.defer();
        
        client.getTemplate(template, (err, result) => {
            if (err) deferred.reject(err);
            else deferred.resolve(result);
        });

        return deferred.promise;
    });

    inSequence(requests, result => {
        output.print(result, result);
    }, err => {
        output.error(formatAPIError(err));
    });
}

export function modify(output, client, { template, name, file }) {
    stream2buf(createReadStream(file), (err, buf) => {
        if (err) return output.error(err.message);
        
        let promise = (name && buf.length !== 0)
            ? Q.fcall(() => ({ name, json: buf.toString() }))
            : Q.nfcall(client.getTemplate.bind(client), template)
                .then(template => ({
                    name: name || template.name,
                    json: buf.length !== 0 ? buf.toString() : template.content
                }));

        promise
            .then(({ name, json }) => {
                client.editTemplate(template, { name, template: json }, (err, result) => {
                    if (err) return output.error(formatAPIError(err));
                });
            })
            .fail(err => output.error(formatAPIError(err)));
    });
}

exports["delete"] = function _delete(output, client, { templates }) {
    for (let template of templates) {
        client.deleteTemplate(template, err => {
            if (err) output.error(formatAPIError(err));
        });
    }
};

export function list(output, client, { before, after, order, sort, fields }) {
    let stream = client.streamTemplates({
        todate: before,
        fromdate: after,
        order, sort, fields
    });
    
    stream.on("readable", () => {
        let template = stream.read();
        if (template == null) return;

        if (fields == null) {
            output.print(template.id, template);
        } else {
            output.print(fields.map(field => template[field]).join(" "), template);
        }
    });

    stream.on("error", err => {
        output.error(formatAPIError(err));
    });
}
