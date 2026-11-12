import { Children, useState } from 'react'

// Large feeds stay reachable with explicit paging instead of nested scroll areas.
export function PagedItems({ items, size = 4, children, label = 'Results' }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(page, pages - 1)
  return <div className="screen-paged-items">
    <div className="screen-paged-content">{items.slice(current * size, (current + 1) * size).map(children)}</div>
    {pages > 1 && <div className="screen-pagination" role="group" aria-label={`${label} pages`}>
      <button disabled={current === 0} onClick={() => setPage(current - 1)} aria-label={`Previous ${label.toLowerCase()}`}>←</button>
      <span>{current + 1} / {pages}</span>
      <button disabled={current === pages - 1} onClick={() => setPage(current + 1)} aria-label={`Next ${label.toLowerCase()}`}>→</button>
    </div>}
  </div>
}

export default function ScreenDeck({ children, className = '', groups }) {
  const [selected, setSelected] = useState(null)
  const cards = Children.toArray(children)
  const views = groups
    ? groups.map(group => ({ ...group, cards: cards.filter(card =>
      group.types?.includes(card.type) || group.classes?.some(name => card.props.className?.split(' ').includes(name))) }))
    : cards.map((card, index) => ({ label: card.props['data-screen-label'] || `View ${index + 1}`, cards: [card] }))
  const available = views.filter(view => view.cards.length)
  const active = available.find(view => view.label === selected) || available[0]
  return <section className={`screen-deck ${className}`}>
    <div className="screen-view-tabs" role="group" aria-label="Choose screen view">
      {available.map(view => <button key={view.label} aria-pressed={active === view} onClick={() => setSelected(view.label)}>{view.label}</button>)}
    </div>
    <div className={`screen-deck-content pageGrid ${className} ${active?.cards.length === 1 ? 'single-screen' : ''}`} key={active?.label}>{active?.cards}</div>
  </section>
}
