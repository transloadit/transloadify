import { Builtins, Cli } from 'clipanion'

import {
  AssembliesCreateCommand,
  AssembliesDeleteCommand,
  AssembliesGetCommand,
  AssembliesListCommand,
  AssembliesReplayCommand,
} from './assemblies.ts'

import { BillsGetCommand } from './bills.ts'

import { NotificationsListCommand, NotificationsReplayCommand } from './notifications.ts'

import {
  TemplatesCreateCommand,
  TemplatesDeleteCommand,
  TemplatesGetCommand,
  TemplatesListCommand,
  TemplatesModifyCommand,
  TemplatesSyncCommand,
} from './templates.ts'

export function createCli(): Cli {
  const cli = new Cli({
    binaryLabel: 'Transloadit CLI',
    binaryName: 'transloadify',
    binaryVersion: '1.0.0',
  })

  // Built-in commands
  cli.register(Builtins.HelpCommand)
  cli.register(Builtins.VersionCommand)

  // Assemblies commands
  cli.register(AssembliesCreateCommand)
  cli.register(AssembliesListCommand)
  cli.register(AssembliesGetCommand)
  cli.register(AssembliesDeleteCommand)
  cli.register(AssembliesReplayCommand)

  // Templates commands
  cli.register(TemplatesCreateCommand)
  cli.register(TemplatesGetCommand)
  cli.register(TemplatesModifyCommand)
  cli.register(TemplatesDeleteCommand)
  cli.register(TemplatesListCommand)
  cli.register(TemplatesSyncCommand)

  // Bills commands
  cli.register(BillsGetCommand)

  // Notifications commands
  cli.register(NotificationsReplayCommand)
  cli.register(NotificationsListCommand)

  return cli
}
