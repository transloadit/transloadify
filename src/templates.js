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
    stream2buff(createReadStream(file), (err, buf) => {
        if (err) return output.error(err.message);
        
        client.createTemplate(template, { name, template: buf.toString() }, (err, result) => {
            if (err) return output.error(formatAPIError(err));
            output.print(result.id, result);
        });
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
            output.print(fields.map(field => assembly[field]).join(" "), template);
        }
    });

    stream.on("error", err => {
        output.error(formatAPIError(err));
    });
}
