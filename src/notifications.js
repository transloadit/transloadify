export async function replay(output, client, { notify_url, assemblies }) {
  try {
    const promises = assemblies.map((id) => {
      return client.replayAssemblyNotification(id, { notify_url })
    })
    await Promise.all(promises)
  } catch (err) {
    output.error(err)
  }
}

export function list(output, _client, { type: _type, assembly_id: _assembly_id }) {
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
