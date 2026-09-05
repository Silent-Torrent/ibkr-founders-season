import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { Locale, ParserDiagnostic, PortfolioReport } from '../types'
import { t } from '../i18n'
import { parseIbkrActivityStatementInWorker } from '../lib/parseInWorker'
import {
  diagnosticKey,
  formatParserDiagnostic,
} from '../lib/parserDiagnostics'
import { MAX_IBKR_WORKER_STATEMENT_BYTES } from '../lib/workerOutputLimits'
import { importRecoveryKeys } from '../lib/importRecovery'
import type { SnapshotImportDecision } from '../lib/snapshot'

interface ImportPageProps {
  accountComparisonSalt: string
  locale: Locale
  onImport: (report: PortfolioReport) => SnapshotImportDecision
  onImportStart: () => void
  onUseDemo: () => void
}

export function ImportPage({
  accountComparisonSalt,
  locale,
  onImport,
  onImportStart,
  onUseDemo,
}: ImportPageProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const mainActionRef = useRef<HTMLButtonElement>(null)
  const activeTaskRef = useRef<{
    controller: AbortController
    id: number
  } | null>(null)
  const taskSequenceRef = useRef(0)
  const mountedRef = useRef(true)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<ParserDiagnostic[]>([])
  const [warnings, setWarnings] = useState<ParserDiagnostic[]>([])
  const [importCancelled, setImportCancelled] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      activeTaskRef.current?.controller.abort()
      activeTaskRef.current = null
    }
  }, [])

  async function processFile(file: File) {
    let preflightError: ParserDiagnostic | null = null
    if (!file.name.toLowerCase().endsWith('.csv')) preflightError = { code: 'file_not_csv' }
    else if (file.size === 0) preflightError = { code: 'file_empty' }
    else if (file.size > MAX_IBKR_WORKER_STATEMENT_BYTES) preflightError = { code: 'file_too_large' }

    if (preflightError) {
      // An invalid second drop cannot replace or visually contradict work already in progress.
      if (activeTaskRef.current) return
      onImportStart()
      setErrors([preflightError])
      setWarnings([])
      setImportCancelled(false)
      return
    }

    onImportStart()
    activeTaskRef.current?.controller.abort()
    activeTaskRef.current = null
    const taskId = ++taskSequenceRef.current
    setErrors([])
    setWarnings([])
    setImportCancelled(false)

    const controller = new AbortController()
    activeTaskRef.current = { controller, id: taskId }
    setBusy(true)
    try {
      // A Blob clone omits File.name while keeping the bytes local to the worker.
      const statement = file.slice(0, file.size, 'text/csv')
      const result = await parseIbkrActivityStatementInWorker(statement, {
        accountComparisonSalt,
        signal: controller.signal,
      })
      if (
        controller.signal.aborted ||
        activeTaskRef.current?.id !== taskId ||
        !mountedRef.current
      ) {
        return
      }

      setWarnings(result.warnings)
      if (result.errors.length > 0 || !result.report) {
        setErrors(result.errors)
        return
      }
      onImport(result.report)
    } catch {
      if (
        !controller.signal.aborted &&
        activeTaskRef.current?.id === taskId &&
        mountedRef.current
      ) {
        setErrors([{ code: 'statement_unreadable' }])
      }
    } finally {
      if (activeTaskRef.current?.id === taskId) {
        activeTaskRef.current = null
        if (mountedRef.current) setBusy(false)
      }
    }
  }

  const recoveryKeys = importRecoveryKeys(errors)

  function chooseFile() {
    // Retry panels disappear when parsing starts (or preflight changes the
    // outcome). Keep focus on the stable Choose/Cancel node before opening
    // the picker, without any later effect that could steal the user's focus.
    mainActionRef.current?.focus()
    inputRef.current?.click()
  }

  function cancelImport(announce = true) {
    activeTaskRef.current?.controller.abort()
    activeTaskRef.current = null
    taskSequenceRef.current += 1
    setBusy(false)
    setErrors([])
    setWarnings([])
    setImportCancelled(announce)
  }

  function useDemo() {
    onUseDemo()
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void processFile(file)
  }

  return (
    <section className="import-layout">
      <div className="import-main">
        <span className="eyebrow">{t(locale, 'localFirstImportEyebrow')}</span>
        <h1>{t(locale, 'importTitle')}</h1>
        <p className="lead-copy">{t(locale, 'importSubtitle')}</p>

        <div
          aria-busy={busy}
          className={dragging ? 'drop-zone dragging' : 'drop-zone'}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <div className="upload-orbit"><span>CSV</span></div>
          <h2>{busy ? t(locale, 'importing') : t(locale, 'dropFile')}</h2>
          <p>{t(locale, 'importFileSpec')}</p>
          <input
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void processFile(file)
              event.currentTarget.value = ''
            }}
            ref={inputRef}
            type="file"
          />
          {busy ? (
            <button
              className="secondary-button"
              data-action="cancel-import"
              onClick={() => cancelImport()}
              ref={mainActionRef}
              type="button"
            >
              {t(locale, 'cancelImport')}
            </button>
          ) : (
            <button
              className="primary-button"
              data-action="choose-file"
              onClick={chooseFile}
              ref={mainActionRef}
              type="button"
            >
              {t(locale, 'chooseFile')}
            </button>
          )}
          {busy && <p className="import-processing-detail">{t(locale, 'importProcessingDetail')}</p>}
          <span className="local-only-note"><i /> {t(locale, 'privateDetail')}</span>
        </div>

        <span aria-atomic="true" aria-live="polite" className="sr-only import-live-status" role="status">
          {busy ? t(locale, 'importing') : ''}
        </span>

        {importCancelled && (
          <div aria-atomic="true" className="import-cancelled-message" role="status">
            <strong>{t(locale, 'importCancelled')}</strong>
            <p>{t(locale, 'importCancelledDetail')}</p>
            <button
              className="secondary-button"
              data-action="choose-file-after-cancel"
              onClick={chooseFile}
              type="button"
            >
              {t(locale, 'chooseAnotherFile')}
            </button>
          </div>
        )}

        {(errors.length > 0 || warnings.length > 0) && (
          <div className="import-messages">
            {errors.length > 0 && (
              <div role="alert">
                {errors.map((diagnostic, index) => (
                  <p className="error-message" key={diagnosticKey(diagnostic, index)}>
                    × {formatParserDiagnostic(diagnostic, locale)}
                  </p>
                ))}
              </div>
            )}
            {warnings.length > 0 && (
              <div aria-live="polite" role="status">
                {warnings.map((diagnostic, index) => (
                  <p className="warning-message" key={diagnosticKey(diagnostic, index)}>
                    ! {formatParserDiagnostic(diagnostic, locale)}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {errors.length > 0 && (
          <section aria-labelledby="import-recovery-title" className="import-recovery-panel">
            <h2 id="import-recovery-title">{t(locale, 'importRecoveryTitle')}</h2>
            <ul>
              {recoveryKeys.map((key) => <li key={key}>{t(locale, key)}</li>)}
            </ul>
            <p>{t(locale, 'importFailurePreserved')}</p>
            <div className="import-recovery-actions">
              <button
                className="primary-button"
                data-action="choose-file-after-error"
                onClick={chooseFile}
                type="button"
              >
                {t(locale, 'chooseAnotherFile')}
              </button>
              <a className="secondary-button" href="#export-settings">
                {t(locale, 'viewExportSettings')}
              </a>
            </div>
          </section>
        )}

        <div className="import-actions">
          <button className="secondary-button" data-action="use-demo" onClick={useDemo} type="button">{t(locale, 'useDemo')}</button>
          <a className="text-link" download href="/sample-ibkr-ytd.csv">{t(locale, 'downloadSample')} →</a>
        </div>
      </div>

      <aside className="import-side">
        <article className="panel requirements-card" id="export-settings">
          <span className="step-label">01</span>
          <h2>{t(locale, 'importRequirements')}</h2>
          <p>{t(locale, 'exportGuideIntro')}</p>
          <ul>
            <li><span>✓</span>{t(locale, 'reqType')}</li>
            <li><span>✓</span>{t(locale, 'reqPeriod')}</li>
            <li><span>✓</span>{t(locale, 'reqFormat')}</li>
            <li><span>✓</span>{t(locale, 'reqLanguage')}</li>
            <li><span>✓</span>{t(locale, 'reqAccount')}</li>
          </ul>
        </article>
        <article className="panel import-rule-card">
          <span className="step-label">02</span>
          <h2>{t(locale, 'seasonSnapshotTitle')}</h2>
          <p>{t(locale, 'replaceRule')}</p>
        </article>
        <article className="panel privacy-detail-card">
          <span className="step-label">03</span>
          <h2>{t(locale, 'privateByDesign')}</h2>
          <p>{t(locale, 'importPrivacy')}</p>
        </article>
      </aside>
    </section>
  )
}
