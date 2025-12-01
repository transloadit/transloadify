import process from 'node:process'
import { createCli } from './commands/index.ts'
import 'dotenv/config'

const cli = createCli()
cli.runExit(process.argv.slice(2))
