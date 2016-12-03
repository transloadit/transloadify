export function replay (output, client, { notify_url, assemblies }) {
  for (let id of assemblies) {
    client.replayAssemblyNotification({ notify_url, assembly_id: id }, (err, result) => {
      if (err) return output.error(err)
    })
  }
}

export function list (output, client, { type, assembly_id }) {
  let notifications = client.streamAssemblyNotifications({ type, assembly_id })

  notifications.on('readable', () => {
    let notification = notifications.read()
    if (!notification) return

    output.print(notification, notification)
  })

  notifications.on('error', output.error.bind(output))
}
