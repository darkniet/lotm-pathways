import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { pathwayById, tierOf, WIKI_CREDIT, type Pathway, type SeqNumber } from '../data/pathways'
import { preloadRecord, useRecord } from '../data/wiki'
import type { PathwayRecord } from '../data/wiki/types'
import { dom, input } from '../lib/registry'
import { useExplorer } from '../state/explorer'
import { RECORD_TABS, RecordContent, type RecordTab } from './Record'

const EASE = [0.2, 0.8, 0.2, 1] as const
const SEQS: SeqNumber[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
/** First Sequence (from the top) of each tier, with the rail's short label. */
const TIER_START: Partial<Record<SeqNumber, string>> = { 0: 'True God', 1: 'Angel', 3: 'Saint', 5: 'Mid', 7: 'Low' }

export function PathwayUI({ mobile }: { mobile: boolean }) {
  const view = useExplorer((s) => s.view)
  const phase = useExplorer((s) => s.phase)
  const activeId = useExplorer((s) => s.activeId)
  const lastActiveId = useExplorer((s) => s.lastActiveId)
  const seq = useExplorer((s) => s.seq)
  const climbed = useExplorer((s) => s.climbed)
  const close = useExplorer((s) => s.close)
  const swapTo = useExplorer((s) => s.swapTo)
  const setSeq = useExplorer((s) => s.setSeq)

  const shown = view === 'pathway' && phase !== 'flyOut'
  const id = activeId ?? lastActiveId
  const p = id ? pathwayById[id] : null
  const record = useRecord(id)
  const [tab, setTab] = useState<RecordTab>('abilities')
  // Phones: the record is a bottom sheet, collapsed while climbing.
  const [expanded, setExpanded] = useState(false)
  const sheetOpen = mobile && expanded
  useEffect(() => {
    if (!shown) setExpanded(false)
  }, [shown])

  // Neighbors are one click away: fetch their records early.
  useEffect(() => {
    p?.neighbors.forEach(preloadRecord)
  }, [p])

  // Move focus to the pathway name when the view opens, for keyboard and screen readers.
  const headRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (shown) headRef.current?.focus({ preventScroll: true })
  }, [shown])

  return (
    <AnimatePresence>
      {shown && p && (
        <motion.div
          key="pathway-ui"
          className={sheetOpen ? 'pathway-ui sheet-open' : 'pathway-ui'}
          style={{ '--path': p.color } as CSSProperties}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.6, delay: phase === 'flyIn' ? 0.25 : 0 } }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
        >
          <button type="button" className="back" onClick={close}>
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M10 3 5 8l5 5" />
            </svg>
            All pathways
            {!mobile && <kbd>Esc</kbd>}
          </button>

          <header className="p-head">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <h1 ref={headRef} tabIndex={-1}>
                  {p.name}
                </h1>
                <p>{p.description}</p>
              </motion.div>
            </AnimatePresence>
          </header>

          <Neighbors pathway={p} onPick={swapTo} />

          <div className={sheetOpen ? 'dock expanded' : 'dock'}>
            <div className="card-slot" aria-live="polite">
              <AnimatePresence initial={false}>
                <SequenceCard
                  key={`${p.id}-${seq}`}
                  pathway={p}
                  record={record}
                  seq={seq}
                  mobile={mobile}
                  tab={tab}
                  onTab={setTab}
                  compact={mobile && !expanded}
                  onToggle={mobile ? () => setExpanded((e) => !e) : undefined}
                />
              </AnimatePresence>
            </div>
            <SequenceRail pathway={p} seq={seq} onPick={setSeq} />
          </div>

          <AnimatePresence>
            {!climbed && !sheetOpen && (
              <motion.p
                className="climb-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 1.2, duration: 0.8 } }}
                exit={{ opacity: 0, transition: { duration: 0.3 } }}
              >
                {mobile ? 'Swipe up to climb' : 'Scroll or press ↑ to climb'}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Neighbors({ pathway, onPick }: { pathway: Pathway; onPick: (id: Pathway['id']) => void }) {
  return (
    <section className="neighbors" aria-labelledby="neighbors-title">
      <h2 id="neighbors-title">Neighboring pathways</h2>
      {pathway.neighbors.length ? (
        <ul>
          {pathway.neighbors.map((nid) => {
            const n = pathwayById[nid]
            return (
              <li key={nid}>
                <button
                  type="button"
                  aria-label={`Switch to ${n.name} pathway`}
                  onClick={() => onPick(nid)}
                  onPointerEnter={() => (input.neighborHover = nid)}
                  onPointerLeave={() => (input.neighborHover = null)}
                  onFocus={() => (input.neighborHover = nid)}
                  onBlur={() => (input.neighborHover = null)}
                  style={{ '--path': n.color } as CSSProperties}
                >
                  <span
                    className="n-slot"
                    ref={(el) => {
                      if (el) dom.neighborSlots.set(nid, el)
                      else dom.neighborSlots.delete(nid)
                    }}
                  />
                  <span className="n-name">{n.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="alone">{pathway.name} stands alone. No pathway neighbors it.</p>
      )}
    </section>
  )
}

function SequenceCard({
  pathway,
  record,
  seq,
  mobile,
  tab,
  onTab,
  compact,
  onToggle,
}: {
  pathway: Pathway
  record: PathwayRecord | null
  seq: SeqNumber
  mobile: boolean
  tab: RecordTab
  onTab: (t: RecordTab) => void
  /** Phones: show only the header and a button to open the full record. */
  compact: boolean
  onToggle?: () => void
}) {
  const s = pathway.sequences[9 - seq]
  const rec = record?.sequences.find((r) => r.number === seq) ?? null
  const source = tab === 'abilities' ? record?.source.abilities : record?.source.advancement
  const tabIds = RECORD_TABS.map((t) => t.id)
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = tabIds.indexOf(tab)
    const next = e.key === 'ArrowRight' ? tabIds[(i + 1) % tabIds.length] : e.key === 'ArrowLeft' ? tabIds[(i + tabIds.length - 1) % tabIds.length] : null
    if (!next) return
    e.preventDefault()
    onTab(next)
    document.getElementById(`tab-${next}`)?.focus()
  }

  return (
    <motion.article
      className="card"
      initial={mobile ? { opacity: 0, y: 14 } : { opacity: 0, x: 22, filter: 'blur(4px)' }}
      animate={{ opacity: 1, x: 0, y: 0, filter: 'blur(0px)', transition: { duration: 0.26, ease: EASE } }}
      exit={mobile ? { opacity: 0, y: -8, transition: { duration: 0.14 } } : { opacity: 0, x: -12, filter: 'blur(3px)', transition: { duration: 0.14 } }}
    >
      <Corners />
      <header className="card-head">
        <div className="card-num" aria-hidden>
          {seq}
        </div>
        <div className="card-titles">
          <h2 className="card-name">
            <span className="sr-only">Sequence {seq}: </span>
            {s.name}
          </h2>
          <p className="card-tier">
            {tierOf(seq)}
            {rec?.nameCn && (
              <span className="card-cn" lang="zh">
                {rec.nameCn}
              </span>
            )}
          </p>
          {s.description && <p className="card-summary">{s.description}</p>}
        </div>
      </header>

      {onToggle && (
        <button type="button" className="sheet-toggle" aria-expanded={!compact} onClick={onToggle}>
          {compact ? 'Read the full record' : 'Close the record'}
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d={compact ? 'M3 10l5-5 5 5' : 'M3 6l5 5 5-5'} />
          </svg>
        </button>
      )}

      {!compact && (
        <>
      <div className="tabs" role="tablist" aria-label="Sequence record">
        {RECORD_TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="record-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => onTab(t.id)}
            onKeyDown={onTabKey}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="record-body" id="record-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
        {rec ? <RecordContent tab={tab} seq={rec} /> : <p className="rec-empty">Opening the record…</p>}
      </div>

      {source && (
        <p className="card-source">
          From the{' '}
          <a href={source.url} target="_blank" rel="noreferrer">
            {WIKI_CREDIT.site}
          </a>
          , text under{' '}
          <a href={WIKI_CREDIT.licenseUrl} target="_blank" rel="noreferrer">
            {WIKI_CREDIT.license}
          </a>
        </p>
      )}
        </>
      )}
    </motion.article>
  )
}

function SequenceRail({ pathway, seq, onPick }: { pathway: Pathway; seq: SeqNumber; onPick: (n: SeqNumber) => void }) {
  return (
    <nav className="rail" aria-label="Sequences">
      <ol>
        {SEQS.map((n) => (
          <li key={n} className={n === seq ? 'on' : n > seq ? 'reached' : undefined}>
            {TIER_START[n] && <span className="rail-tier">{TIER_START[n]}</span>}
            <button
              type="button"
              aria-label={`Sequence ${n}, ${pathway.sequences[9 - n].name}`}
              aria-current={n === seq ? 'step' : undefined}
              onClick={() => onPick(n)}
            >
              <span className="rail-n">{n}</span>
              <span className="rail-tick" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Gilt corner flourishes for the card. */
function Corners() {
  return (
    <>
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <svg key={c} className={`corner ${c}`} viewBox="0 0 40 40" aria-hidden>
          <path d="M1.5 39 V14 C1.5 7 7 1.5 14 1.5 H39" />
          <path d="M7 30 V17 C7 11 11 7 17 7 H30" className="faint" />
          <path d="M13 21 C13 15 16 13 20 13 C23 13 24 16 22 18 C20.5 19.5 18 18.5 18.5 16.5" />
          <path d="M1.5 1.5 l3.5 3.5 M5 1.5 l-3.5 3.5" className="faint" />
        </svg>
      ))}
    </>
  )
}
