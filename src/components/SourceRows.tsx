import type { Locale, SourceRef } from '../types'
import { t } from '../i18n'

interface SourceRowsProps {
  isDemo: boolean
  locale: Locale
  refs: SourceRef[]
}

export function SourceRows({ isDemo, locale, refs }: SourceRowsProps) {
  if (isDemo) {
    return <p className="source-empty demo">{t(locale, 'demoNoLocalSource')}</p>
  }

  if (refs.length === 0) {
    return <p className="source-empty">{t(locale, 'noSourceRows')}</p>
  }

  return (
    <div className="source-ref-list">
      {refs.map((ref, index) => (
        <article
          className="source-ref-card"
          key={`${ref.source}-${ref.section}-${ref.rowNumber ?? 'na'}-${ref.field}-${index}`}
        >
          <dl>
            <div><dt>{t(locale, 'sourceType')}</dt><dd>{ref.source.toUpperCase()}</dd></div>
            <div><dt>{t(locale, 'sourceSection')}</dt><dd>{ref.section}</dd></div>
            <div><dt>{t(locale, 'sourceRow')}</dt><dd>{ref.rowNumber ?? '—'}</dd></div>
            <div><dt>{t(locale, 'sourceRecordType')}</dt><dd>{ref.recordType || '—'}</dd></div>
            <div><dt>{t(locale, 'sourceField')}</dt><dd>{ref.field}</dd></div>
          </dl>
          {ref.headerSignature && (
            <small className="source-header-signature">
              <span>{t(locale, 'sourceTechnicalHeader')}</span>
              {ref.headerSignature}
            </small>
          )}
        </article>
      ))}
    </div>
  )
}
