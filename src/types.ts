import type { Transloadit } from 'transloadit'
import type { IOutputCtl } from './OutputCtl.js'

// Re-export transloadit types
export type {
  AssemblyStatus,
  BillResponse,
  CreateAssemblyOptions,
  ListedTemplate,
  TemplateResponse,
  Transloadit,
} from 'transloadit'

// CLI Invocation types
export interface BaseInvocation {
  error?: boolean
  message?: string
  mode: string
  action?: string
  logLevel?: number
  jsonMode?: boolean
}

export interface AssemblyInvocation extends BaseInvocation {
  mode: 'assemblies'
  action?: 'create' | 'get' | 'list' | 'delete' | 'replay'
  inputs: string[]
  output?: string
  recursive?: boolean
  watch?: boolean
  del?: boolean
  reprocessStale?: boolean
  steps?: string
  template?: string
  fields?: Record<string, string>
  assemblies?: string[]
  before?: string
  after?: string
  keywords?: string[]
  notify_url?: string
  reparse?: boolean
}

export interface TemplateInvocation extends BaseInvocation {
  mode: 'templates'
  action?: 'create' | 'get' | 'list' | 'delete' | 'modify' | 'sync'
  templates?: string[]
  template?: string
  name?: string
  file?: string
  files?: string[]
  before?: string
  after?: string
  order?: 'asc' | 'desc'
  sort?: string
  fields?: string[]
  recursive?: boolean
}

export interface BillInvocation extends BaseInvocation {
  mode: 'bills'
  action?: 'get'
  months: string[]
}

export interface NotificationInvocation extends BaseInvocation {
  mode: 'assembly-notifications'
  action?: 'list' | 'replay'
  assemblies?: string[]
  notify_url?: string
  type?: string
  assembly_id?: string
  pagesize?: number
}

export interface HelpInvocation extends BaseInvocation {
  mode: 'help' | 'version' | 'register'
}

export type Invocation =
  | AssemblyInvocation
  | TemplateInvocation
  | BillInvocation
  | NotificationInvocation
  | HelpInvocation

// Command handler type
export type CommandHandler<T extends BaseInvocation = BaseInvocation> = (
  output: IOutputCtl,
  client: Transloadit | undefined,
  invocation: T,
) => void | Promise<void>

// API Error type
export interface TransloaditAPIError extends Error {
  error?: string
  message: string
  code?: string
  transloaditErrorCode?: string
  response?: {
    body?: {
      error?: string
    }
    statusCode?: number
  }
}

// Template file data
export interface TemplateFileData {
  transloadit_template_id?: string
  steps?: Record<string, unknown>
  [key: string]: unknown
}

export interface TemplateFile {
  file: string
  data: TemplateFileData
}

// Template list item (from API)
export interface TemplateListItem {
  id: string
  modified: string
  name?: string
}
