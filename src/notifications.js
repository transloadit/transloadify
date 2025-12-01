import Q from 'q'

export function replay(output, client, { notify_url, assemblies }) {
  return Q.all(
    assemblies.map((id) => {
      return client.replayAssemblyNotification(id, { notify_url }).catch((err) => {
        output.error(err)
      })
    }),
  )
}

export function list(output, client, { type, assembly_id }) {
  // return client
  //   .listAssemblyNotifications({ type, assembly_id })
  //   .then((result) => {
  //     result.items.forEach((notification) => {
  //       output.print(notification, notification)
  //     })
  //   })
  //   .catch((err) => {
  //     output.error(err)
  //   })
  output.error('List notifications is not supported in this version')
  return Promise.resolve()
}
