import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { FORMAT_MAP } from './presets'
import type { FormatKey } from './types'
import {
  type CalibrationCaseFormat,
  type CalibrationCaseInput,
  type CalibrationDatasetFilter,
  type CalibrationDatasetParseMode,
  type CalibrationDatasetParseResult,
  type CalibrationInputAsset,
  type CalibrationParseError,
  parseCalibrationCaseNotes,
  parseCalibrationCaseVerdict,
} from './calibrationCaseSchema'

const INPUT_FILENAMES = ['input.png', 'input.jpg', 'input.jpeg'] as const
const FORMAT_FOLDERS: CalibrationCaseFormat[] = ['square', 'landscape', 'portrait']

type DiscoveredCaseDirectory = {
  caseDir: string
  relativeDir: string
  folderFormat?: CalibrationCaseFormat
  folderCategory?: string
  caseIdHint: string
}

function createParseError(
  code: CalibrationParseError['code'],
  caseDir: string,
  message: string,
  caseId = path.basename(caseDir),
  filePath?: string
): CalibrationParseError {
  return {
    caseId,
    caseDir,
    filePath,
    code,
    message,
  }
}

function normalizePath(input: string) {
  return path.resolve(input)
}

function matchesPreParseFilter(input: {
  candidate: DiscoveredCaseDirectory
  filter?: CalibrationDatasetFilter
}) {
  if (!input.filter) return true
  if (input.filter.caseId && input.candidate.caseIdHint !== input.filter.caseId) return false
  if (input.filter.format && input.candidate.folderFormat && input.candidate.folderFormat !== input.filter.format) {
    return false
  }
  return true
}

function matchesParsedFilter(input: {
  parsedCase: CalibrationCaseInput
  filter?: CalibrationDatasetFilter
}) {
  if (!input.filter) return true
  if (input.filter.caseId && input.parsedCase.id !== input.filter.caseId) return false
  if (input.filter.family && input.parsedCase.notes.family !== input.filter.family) return false
  if (input.filter.format && input.parsedCase.notes.format !== input.filter.format) return false
  return true
}

export function getCalibrationCasePathMetadata(relativeDir: string): {
  folderFormat?: CalibrationCaseFormat
  folderCategory?: string
} {
  const segments = relativeDir.split(path.sep).filter(Boolean)
  const formatIndex = segments.findIndex((segment) =>
    FORMAT_FOLDERS.includes(segment as CalibrationCaseFormat)
  )
  const folderFormat =
    formatIndex >= 0 ? (segments[formatIndex] as CalibrationCaseFormat) : undefined
  const categorySegments = segments.filter((_, index) => index !== formatIndex && index !== segments.length - 1)
  return {
    folderFormat,
    folderCategory: categorySegments.length ? categorySegments.join('/') : undefined,
  }
}

async function walkDirectories(root: string) {
  const directories: string[] = []
  const queue = [root]

  while (queue.length) {
    const current = queue.shift()!
    directories.push(current)
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      queue.push(path.join(current, entry.name))
    }
  }

  return directories
}

async function discoverCalibrationCaseDirectories(root: string, filter?: CalibrationDatasetFilter) {
  const directories = await walkDirectories(root)
  const discovered: DiscoveredCaseDirectory[] = []

  for (const caseDir of directories) {
    if (caseDir === root) continue
    const entries = await readdir(caseDir, { withFileTypes: true })
    const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name.toLowerCase())
    const hasMarker =
      fileNames.includes('notes.json') ||
      fileNames.includes('verdict.json') ||
      INPUT_FILENAMES.some((filename) => fileNames.includes(filename))
    if (!hasMarker) continue

    const relativeDir = path.relative(root, caseDir)
    const metadata = getCalibrationCasePathMetadata(relativeDir)
    const candidate: DiscoveredCaseDirectory = {
      caseDir,
      relativeDir,
      folderFormat: metadata.folderFormat,
      folderCategory: metadata.folderCategory,
      caseIdHint: path.basename(caseDir),
    }
    if (!matchesPreParseFilter({ candidate, filter })) continue
    discovered.push(candidate)
  }

  return discovered.sort((left, right) => left.relativeDir.localeCompare(right.relativeDir))
}

async function readJsonFile(filePath: string) {
  try {
    const content = await readFile(filePath, 'utf8')
    return { ok: true as const, value: JSON.parse(content) as unknown }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

function resolveInputAssets(entries: string[], caseDir: string) {
  const assetNames = INPUT_FILENAMES.filter((filename) => entries.includes(filename))
  if (assetNames.length === 0) {
    return {
      ok: false as const,
      errors: [createParseError('missing-input-asset', caseDir, 'Case directory must contain exactly one input.png/input.jpg/input.jpeg file.')],
    }
  }
  if (assetNames.length > 1) {
    return {
      ok: false as const,
      errors: [
        createParseError(
          'multiple-input-assets',
          caseDir,
          `Case directory must contain exactly one primary input asset, found: ${assetNames.join(', ')}.`
        ),
      ],
    }
  }
  return {
    ok: true as const,
    filename: assetNames[0],
  }
}

function validateFormatCompatibility(notesFormat: CalibrationCaseFormat, formatKey?: FormatKey) {
  if (!formatKey) return true
  const format = FORMAT_MAP[formatKey]
  const actual: CalibrationCaseFormat =
    format.width / format.height > 1.1 ? 'landscape' : format.width / format.height < 0.9 ? 'portrait' : 'square'
  return actual === notesFormat
}

async function buildInputAsset(caseDir: string, filename: string): Promise<CalibrationInputAsset> {
  const assetPath = path.join(caseDir, filename)
  const fileStat = await stat(assetPath)
  const extension = path.extname(filename).toLowerCase().replace('.', '') as CalibrationInputAsset['extension']
  return {
    path: assetPath,
    filename,
    extension,
    mimeType: extension === 'png' ? 'image/png' : 'image/jpeg',
    sizeBytes: fileStat.size,
  }
}

async function parseCalibrationCaseDirectory(
  root: string,
  discovered: DiscoveredCaseDirectory
): Promise<{ caseInput?: CalibrationCaseInput; errors: CalibrationParseError[] }> {
  const errors: CalibrationParseError[] = []
  const entries = (await readdir(discovered.caseDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name.toLowerCase())

  if (!discovered.folderFormat) {
    errors.push(
      createParseError(
        'folder-format-mismatch',
        discovered.caseDir,
        'Case directory must live under a square/, landscape/, or portrait/ folder somewhere in its path.',
        discovered.caseIdHint
      )
    )
  }

  const notesPath = path.join(discovered.caseDir, 'notes.json')
  const notesExists = entries.includes('notes.json')
  if (!notesExists) {
    errors.push(
      createParseError('missing-notes', discovered.caseDir, 'Case directory is missing required notes.json.', discovered.caseIdHint)
    )
  }

  const inputResolution = resolveInputAssets(entries, discovered.caseDir)
  if (!inputResolution.ok) errors.push(...inputResolution.errors)

  let notesValue: CalibrationCaseInput['notes'] | undefined
  if (notesExists) {
    const parsedJson = await readJsonFile(notesPath)
    if (!parsedJson.ok) {
      errors.push(
        createParseError(
          'invalid-json',
          discovered.caseDir,
          `Could not parse notes.json: ${parsedJson.error.message}`,
          discovered.caseIdHint,
          notesPath
        )
      )
    } else {
      const parsedNotes = parseCalibrationCaseNotes(parsedJson.value, { caseDir: discovered.caseDir, filePath: notesPath })
      if (!parsedNotes.ok) {
        errors.push(...parsedNotes.errors)
      } else {
        notesValue = parsedNotes.value
      }
    }
  }

  if (notesValue && discovered.folderFormat && notesValue.format !== discovered.folderFormat) {
    errors.push(
      createParseError(
        'folder-format-mismatch',
        discovered.caseDir,
        `notes.json declares format "${notesValue.format}" but the case is stored under "${discovered.folderFormat}/".`,
        notesValue.id,
        notesPath
      )
    )
  }

  if (notesValue && notesValue.id !== discovered.caseIdHint) {
    errors.push(
      createParseError(
        'id-mismatch',
        discovered.caseDir,
        `notes.json id "${notesValue.id}" must match the case directory name "${discovered.caseIdHint}".`,
        notesValue.id,
        notesPath
      )
    )
  }

  if (notesValue && !validateFormatCompatibility(notesValue.format, notesValue.formatKey)) {
    errors.push(
      createParseError(
        'unsupported-format-family',
        discovered.caseDir,
        `notes.json format "${notesValue.format}" is incompatible with formatKey "${notesValue.formatKey}".`,
        notesValue.id,
        notesPath
      )
    )
  }

  let verdictValue: CalibrationCaseInput['verdict'] | undefined
  const verdictPath = path.join(discovered.caseDir, 'verdict.json')
  if (entries.includes('verdict.json')) {
    const parsedJson = await readJsonFile(verdictPath)
    if (!parsedJson.ok) {
      errors.push(
        createParseError(
          'invalid-json',
          discovered.caseDir,
          `Could not parse verdict.json: ${parsedJson.error.message}`,
          notesValue?.id || discovered.caseIdHint,
          verdictPath
        )
      )
    } else {
      const parsedVerdict = parseCalibrationCaseVerdict(parsedJson.value, {
        caseDir: discovered.caseDir,
        filePath: verdictPath,
        caseId: notesValue?.id || discovered.caseIdHint,
      })
      if (!parsedVerdict.ok) errors.push(...parsedVerdict.errors)
      else verdictValue = parsedVerdict.value
    }
  }

  if (errors.length || !notesValue || !inputResolution.ok || !discovered.folderFormat) {
    return { errors }
  }

  const inputAsset = await buildInputAsset(discovered.caseDir, inputResolution.filename)
  return {
    caseInput: {
      id: notesValue.id,
      caseDir: discovered.caseDir,
      relativeDir: path.relative(root, discovered.caseDir),
      folderFormat: discovered.folderFormat,
      category: notesValue.category || discovered.folderCategory || 'uncategorized',
      notesPath,
      inputAsset,
      verdictPath: entries.includes('verdict.json') ? verdictPath : undefined,
      notes: notesValue,
      verdict: verdictValue,
    },
    errors: [],
  }
}

export async function parseCalibrationDataset(input: {
  root: string
  mode?: CalibrationDatasetParseMode
  filter?: CalibrationDatasetFilter
}): Promise<CalibrationDatasetParseResult> {
  const root = normalizePath(input.root)
  const mode = input.mode || 'lenient'
  const rootStats = await stat(root).catch(() => null)
  if (!rootStats?.isDirectory()) {
    return {
      root,
      strictMode: mode === 'strict',
      cases: [],
      parseErrors: [
        createParseError('root-invalid', root, `Dataset root "${root}" does not exist or is not a directory.`, 'dataset-root'),
      ],
      totalCasesFound: 0,
      shouldAbortExecution: true,
    }
  }

  const discovered = await discoverCalibrationCaseDirectories(root, input.filter)
  const parsedCases: CalibrationCaseInput[] = []
  const parseErrors: CalibrationParseError[] = []

  for (const caseDirectory of discovered) {
    const parsed = await parseCalibrationCaseDirectory(root, caseDirectory)
    if (parsed.caseInput && matchesParsedFilter({ parsedCase: parsed.caseInput, filter: input.filter })) {
      parsedCases.push(parsed.caseInput)
    } else if (parsed.caseInput && !matchesParsedFilter({ parsedCase: parsed.caseInput, filter: input.filter })) {
      continue
    }
    parseErrors.push(...parsed.errors)
  }

  const limitedCases =
    input.filter?.limit && input.filter.limit > 0 ? parsedCases.slice(0, input.filter.limit) : parsedCases

  return {
    root,
    strictMode: mode === 'strict',
    cases: limitedCases,
    parseErrors,
    totalCasesFound: discovered.length,
    shouldAbortExecution: mode === 'strict' && parseErrors.length > 0,
  }
}
