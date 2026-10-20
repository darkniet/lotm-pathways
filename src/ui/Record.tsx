import { Fragment, type ReactNode } from 'react'
import type { Item, Segment, SequenceRecord } from '../data/wiki/types'

export type RecordTab = 'abilities' | 'advancement' | 'lore'

export const RECORD_TABS: { id: RecordTab; label: string }[] = [
  { id: 'abilities', label: 'Abilities' },
  { id: 'advancement', label: 'Advancement' },
  { id: 'lore', label: 'Potion & characteristic' },
]

function Segs({ t }: { t: Segment[] }) {
  return (
    <>
      {t.map((s, i) => {
        if (typeof s === 'string') return <Fragment key={i}>{s}</Fragment>
        const [text, flags] = s
        if (flags === 1) return <strong key={i}>{text}</strong>
        if (flags === 2) return <em key={i}>{text}</em>
        return (
          <strong key={i}>
            <em>{text}</em>
          </strong>
        )
      })}
    </>
  )
}

/** Bullets and paragraphs, nested. Consecutive bullets share one list. */
function Items({ items }: { items: Item[] }) {
  const out: ReactNode[] = []
  let run: Item[] = []
  const flush = () => {
    if (!run.length) return
    out.push(
      <ul key={`u${out.length}`}>
        {run.map((it, i) => (
          <li key={i}>
            <Segs t={it.t} />
            {it.c && <Items items={it.c} />}
          </li>
        ))}
      </ul>,
    )
    run = []
  }
  for (const it of items) {
    if (it.p) {
      flush()
      out.push(
        <p key={`p${out.length}`}>
          <Segs t={it.t} />
        </p>,
      )
      if (it.c) out.push(<Items key={`c${out.length}`} items={it.c} />)
    } else run.push(it)
  }
  flush()
  return <>{out}</>
}

function Block({ title, items, empty, note }: { title: string; items?: Item[]; empty?: string; note?: string }) {
  if (!items?.length && !empty) return null
  return (
    <section className="rec-block">
      <h3>{title}</h3>
      {note && <p className="rec-note">{note}</p>}
      {items?.length ? <Items items={items} /> : <p className="rec-empty">{empty}</p>}
    </section>
  )
}

export function RecordContent({ tab, seq }: { tab: RecordTab; seq: SequenceRecord }) {
  if (tab === 'abilities') {
    if (!seq.abilities.length) return <p className="rec-empty">The wiki has no ability record for this Sequence yet.</p>
    return (
      <>
        {seq.abilities.map((s, i) => (
          <Block key={i} title={s.h || 'Overview'} items={s.items} />
        ))}
      </>
    )
  }

  if (tab === 'advancement') {
    const hasFormula = seq.mainIngredients?.length || seq.supplementaryIngredients?.length
    return (
      <>
        <section className="rec-block">
          <h3>Potion formula</h3>
          {hasFormula ? (
            <>
              {seq.mainIngredients?.length ? (
                <>
                  <h4>Main ingredients</h4>
                  <Items items={seq.mainIngredients} />
                </>
              ) : null}
              {seq.supplementaryIngredients?.length ? (
                <>
                  <h4>Supplementary ingredients</h4>
                  <Items items={seq.supplementaryIngredients} />
                </>
              ) : null}
            </>
          ) : (
            <p className="rec-empty">The wiki records no formula for this potion.</p>
          )}
        </section>
        <Block
          title="Advancement ritual"
          items={seq.ritual}
          empty="The wiki records no advancement ritual for this Sequence."
        />
        <Block title="Essence of the ritual" items={seq.ritualEssence} />
        <Block
          title="Acting method"
          note="How a Beyonder digests this potion before advancing further."
          items={seq.actingMethod}
          empty="The wiki records no acting method for this Sequence."
        />
      </>
    )
  }

  const names = [...(seq.altNames ?? [])]
  return (
    <>
      <Block title="The potion" items={seq.potion} empty="The wiki does not describe this potion." />
      <Block title="Beyonder characteristic" items={seq.characteristic} empty="The wiki does not describe this characteristic." />
      <Block title="Lingering effect" items={seq.lingeringEffect} />
      {(seq.nameCn || names.length > 0) && (
        <section className="rec-block">
          <h3>Names</h3>
          <ul>
            {seq.nameCn && (
              <li>
                Chinese: <span lang="zh">{seq.nameCn}</span>
                {seq.nameRomanised && <em> ({seq.nameRomanised})</em>}
              </li>
            )}
            {names.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
