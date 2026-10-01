import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
} from 'recharts'
import type { Contraction } from '../lib/types'
import {
  dailyStats, last24hHourly, medianInterval,
  countLastHour, medianIntervalLastHour, inWindow, sortByAt,
} from '../lib/stats'
import { useNow } from '../hooks/useNow'
import { formatElapsed, formatInterval, formatClock } from '../lib/format'

// Palette data-viz validée (surface sombre). Chaque graphe est mono-série ;
// même couleur pour un chiffre et son graphe.
const C_COUNT = '#e07a5f'       // corail — nombre de contractions
const C_HOUR = '#e0a458'        // ambre — vue 24 h
const C_HOUR_NOW = '#f2cc8f'    // heure en cours
const C_INTERVAL = '#81b29a'    // sauge — intervalle / fréquence
const AXIS = '#3a302c'          // --chart-axis

const HOUR_MS = 3_600_000

function fmtMs(v: number | null | undefined): string {
  return v == null ? '—' : formatElapsed(v)
}

function ChartTip({ active, payload, label, unit }:
  { active?: boolean; payload?: any[]; label?: any; unit: 'count' | 'ms' }) {
  if (!active || !payload || !payload.length) return null
  const v = payload[0].value as number
  return (
    <div className="chart-tip">
      <div className="chart-tip-label">{label}</div>
      <div className="chart-tip-value">
        {unit === 'count' ? `${v} contraction${v > 1 ? 's' : ''}` : formatInterval(v)}
      </div>
    </div>
  )
}

/** 11 — Numéro de la maternité : affichage lien tel: + édition/effacement. Aucun seuil, aucun déclenchement. */
function MaternitySection({ phone, onSave }: { phone: string; onSave: (p: string) => void }) {
  // Édition explicite (bouton « Modifier le numéro ») : tant qu'on n'a pas enregistré,
  // le numéro existant reste inchangé si on quitte l'écran.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(phone)

  const startEdit = () => { setDraft(phone); setEditing(true) }
  const save = () => { onSave(draft.trim()); setEditing(false) }

  const showEditor = editing || !phone

  return (
    <section className="chart-block maternity">
      <h2>Maternité</h2>
      <p className="chart-sub">Numéro gardé sur ce téléphone. Aucun déclenchement automatique.</p>
      {phone && !showEditor && (
        <>
          <a className="maternity-call" href={`tel:${phone.replace(/\s+/g, '')}`}>
            <span className="maternity-call-dot" aria-hidden="true">●</span>
            Appeler · {phone}
          </a>
          <button className="maternity-edit-link" onClick={startEdit}>Modifier le numéro</button>
        </>
      )}
      {showEditor && (
        <div className="maternity-edit">
          <input
            type="tel"
            inputMode="tel"
            placeholder="ex. 01 23 45 67 89"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Numéro de la maternité"
          />
          <button disabled={!draft.trim() && !phone} onClick={save}>
            Enregistrer
          </button>
        </div>
      )}
    </section>
  )
}

export function StatsScreen({
  list, maternityPhone, onSaveMaternity,
}: {
  list: Contraction[]
  maternityPhone: string
  onSaveMaternity: (p: string) => void
}) {
  const now = useNow(30_000, true)
  const daily = useMemo(() => dailyStats(list), [list])
  const hourly = useMemo(() => last24hHourly(list, now), [list, now])
  const medIntGlobal = medianInterval(list)
  const lastHourCount = countLastHour(list, now)
  const medIntLastHour = medianIntervalLastHour(list, now)

  // 1 — Bloc « dernière heure » : contractions de la dernière heure, la plus récente EN HAUT.
  const lastHour = useMemo(() => {
    const s = sortByAt(list)
    const inHour = inWindow(list, HOUR_MS, now)
    return inHour
      .map((c) => {
        const idx = s.findIndex((x) => x.id === c.id)
        return { c, interval: idx > 0 ? c.at - s[idx - 1].at : null }
      })
      .reverse()
  }, [list, now])

  if (list.length === 0) {
    return (
      <div className="stats-screen">
        <div className="big-empty">
          <div className="status-empty-title" style={{ fontSize: 22 }}>Pas encore de données</div>
          <div className="status-empty-sub">
            Enregistrez des contractions depuis l’onglet <strong>Bouton</strong> pour voir les chiffres.
          </div>
        </div>
        <MaternitySection phone={maternityPhone} onSave={onSaveMaternity} />
      </div>
    )
  }

  const dailyCount = daily.map((d) => ({ label: d.label, value: d.count }))
  const dailyFreq = daily.map((d) => ({ label: d.label, value: d.medianIntervalMs }))
    .filter((d) => d.value != null) as { label: string; value: number }[]
  const hourData = hourly.map((h, i) => ({ label: h.label, value: h.count, current: i === hourly.length - 1 }))
  const hourTotal = hourly.reduce((a, h) => a + h.count, 0)

  return (
    <div className="stats-screen">
      {/* 1 — Bloc « dernière heure » en tête : ce qu'une sage-femme demande au téléphone. */}
      <section className="chart-block last-window">
        <div className="last-window-head">
          <h2>Dernière heure</h2>
          <span className="last-window-since">depuis {formatClock(now - HOUR_MS)}</span>
        </div>
        <div className="last-window-stats">
          <div className="last-window-stat">
            <span className="last-window-stat-value" style={{ color: C_COUNT }}>{lastHourCount}</span>
            <span className="last-window-stat-label">contractions</span>
          </div>
          <div className="last-window-stat">
            <span className="last-window-stat-value" style={{ color: C_INTERVAL }}>{fmtMs(medIntLastHour)}</span>
            <span className="last-window-stat-label">intervalle médian</span>
          </div>
        </div>
        <div className="last-window-list-head">
          <span>Heure · la plus récente en haut</span>
          <span>Intervalle</span>
        </div>
        {lastHour.length === 0 ? (
          <p className="empty">Aucune contraction sur la dernière heure.</p>
        ) : (
          <table className="recent-table">
            <thead><tr><th>Heure</th><th>Intervalle</th></tr></thead>
            <tbody>
              {lastHour.map(({ c, interval }) => (
                <tr key={c.id}>
                  <td>{formatClock(c.at)}</td>
                  <td>{formatInterval(interval)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 2 tuiles : total, intervalle médian global. */}
      <div className="tiles">
        <div className="tile">
          <div className="tile-value">{list.length}</div>
          <div className="tile-label">au total</div>
        </div>
        <div className="tile">
          <div className="tile-value">{fmtMs(medIntGlobal)}</div>
          <div className="tile-label">intervalle médian global</div>
        </div>
      </div>
      <p className="stats-hint">
        Intervalle = <strong>début à début</strong>. Le chiffre principal est la <strong>médiane</strong>, pas
        la moyenne : une pause de sommeil ne la fausse pas.
      </p>

      <section className="chart-block">
        <h2>Contractions par jour</h2>
        <p className="chart-sub">Nombre de contractions enregistrées chaque jour.</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dailyCount} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barCategoryGap="20%">
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} axisLine={{ stroke: AXIS }} tickLine={false} />
            <YAxis allowDecimals={false} width={28} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTip unit="count" />} />
            <Bar dataKey="value" fill={C_COUNT} radius={[6, 6, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="chart-block">
        <h2>Fréquence par jour</h2>
        <p className="chart-sub">
          Intervalle médian, min:s — plus bas = plus rapprochées.
        </p>
        {dailyFreq.length === 0 ? (
          <p className="empty">Il faut au moins deux contractions dans une journée pour une fréquence.</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dailyFreq} margin={{ top: 8, right: 8, left: 8, bottom: 4 }} barCategoryGap="20%">
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} axisLine={{ stroke: AXIS }} tickLine={false} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={52}
                tickFormatter={(v) => formatElapsed(v)} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTip unit="ms" />} />
              <Bar dataKey="value" fill={C_INTERVAL} radius={[6, 6, 0, 0]} maxBarSize={56} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="chart-block">
        <h2>Dernières 24 h</h2>
        <p className="chart-sub">
          {hourTotal === 0
            ? 'Aucune contraction sur les dernières 24 heures.'
            : `Contractions par heure · ${hourTotal} au total.`}
        </p>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={hourData} margin={{ top: 8, right: 0, left: 0, bottom: 4 }} barCategoryGap="10%">
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} interval={5} axisLine={{ stroke: AXIS }} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTip unit="count" />} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {hourData.map((h, i) => (
                <Cell key={i} fill={h.current ? C_HOUR_NOW : C_HOUR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      <MaternitySection phone={maternityPhone} onSave={onSaveMaternity} />

      <p className="stats-foot-note">
        Ces chiffres se lisent sans interprétation. Ils ne remplacent pas un avis médical.
      </p>
    </div>
  )
}
