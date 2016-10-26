import { formatAPIError, inSequence } from "./helpers";
import Q from "q";

export function get(output, client, { months }) {
    let requests = months.map(month => {
        let deferred = Q.defer();

        client.getBill(month, (err, result) => {
            if (err) return deferred.reject(err);
            deferred.resolve(result);
        });

        return deferred.promise;
    });

    inSequence(requests, result => {
        output.print(`$${result.total}`, result);
    }, err => {
        output.error(formatAPIError(err));
    });
}
