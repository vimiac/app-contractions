import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import type { Contraction } from '../lib/types'
import {
  dailyStats, last24hHourly, medianInterval,
  countLastHour, medianIntervalLastHour, inWindow, sortByAt,
} from '../lib/stats'
import { useNow } from '../hooks/useNow'
import { formatElapsed, formatInterval, formatClock } from '../lib/format'

// Palette data-viz validée (surface sombre). Chaque graphe est mono-série.
const C_COUNT = '#3987e5'    // bleu — magnitude
const C_HOUR = '#d95926'     // orange — vue 24 h
const C_INTERVAL = '#199e70' // aqua — intervalle / fréquence
const AXIS = '#898781'
const GRID = '#2c2c2a'
const INK = '#c3c2b7'
const SURFACE = '#161922'

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
  const [draft, setDraft] = useState(phone)
  const trimmed = draft.trim()
  const dirty = trimmed !== phone
  return (
    <section className="chart-block maternity">
      <h2>Numéro de la maternité (optionnel)</h2>
      <p className="chart-sub">
        Enregistré uniquement sur ce téléphone. Ce n'est pas un seuil d'alerte : le lien est simplement
        toujours là si un numéro est saisi. Aucun déclenchement automatique.
      </p>
      {phone && (
        <p className="maternity-call">
          <a className="tel-link" href={`tel:${phone.replace(/\s+/g, '')}`}>📞 Appeler la maternité : {phone}</a>
        </p>
      )}
      <div className="maternity-edit">
        <input
          type="tel"
          inputMode="tel"
          placeholder="ex. 01 23 45 67 89"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Numéro de la maternité"
        />
        <button className="secondary-button" disabled={!dirty} onClick={() => onSave(trimmed)}>
          Enregistrer
        </button>
        {phone && (
          <button className="link-button muted" onClick={() => { setDraft(''); onSave('') }}>
            Effacer
          </button>
        )}
      </div>
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
        <p className="empty big-empty">
          Pas encore de données.<br />
          Enregistrez des contractions depuis l’onglet <strong>Bouton</strong> pour voir les graphiques.
        </p>
        <MaternitySection phone={maternityPhone} onSave={onSaveMaternity} />
      </div>
    )
  }

  const dailyCount = daily.map((d) => ({ label: d.label, value: d.count }))
  const dailyFreq = daily.map((d) => ({ label: d.label, value: d.medianIntervalMs }))
    .filter((d) => d.value != null) as { label: string; value: number }[]
  const hourData = hourly.map((h) => ({ label: h.label, value: h.count }))
  const hourTotal = hourly.reduce((a, h) => a + h.count, 0)

  return (
    <div className="stats-screen">
      {/* 1 — Bloc « dernière heure » en tête : ce qu'une sage-femme demande au téléphone. */}
      <section className="chart-block last-window">
        <h2>Dernière heure</h2>
        <p className="chart-sub">Liste brute, la plus récente en haut. Intervalle = début à début.</p>
        {lastHour.length === 0 ? (
          <p className="empty">Aucune contraction sur la dernière heure.</p>
        ) : (
          <table className="recent-table">
            <thead>
              <tr><th>Heure</th><th>Intervalle</th></tr>
            </thead>
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

      {/* 5 — Tuiles : total, dernière heure (nombre), intervalle médian dernière heure, fréquence globale. */}
      <div className="tiles">
        <div className="tile">
          <div className="tile-value">{list.length}</div>
          <div className="tile-label">Contractions au total</div>
        </div>
        <div className="tile">
          <div className="tile-value">{lastHourCount}</div>
          <div className="tile-label">Sur la dernière heure</div>
        </div>
        <div className="tile">
          <div className="tile-value">{fmtMs(medIntLastHour)}</div>
          <div className="tile-label">Intervalle médian — 1 h</div>
        </div>
        <div className="tile">
          <div className="tile-value">{fmtMs(medIntGlobal)}</div>
          <div className="tile-label">Intervalle médian — global</div>
        </div>
      </div>
      <p className="stats-hint">
        Intervalle = <strong>début à début</strong> (temps entre le début de deux contractions).
        La « fréquence » est l'intervalle médian, pas la moyenne.
      </p>

      <section className="chart-block">
        <h2>Contractions par jour</h2>
        <p className="chart-sub">Nombre de contractions enregistrées chaque jour.</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyCount} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barCategoryGap="20%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
            <YAxis allowDecimals={false} width={28} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTip unit="count" />} />
            <Bar dataKey="value" fill={C_COUNT} radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="chart-block">
        <h2>Fréquence par jour</h2>
        <p className="chart-sub">
          Intervalle <strong>médian début à début</strong> chaque jour (min:sec). Plus c’est bas, plus les
          contractions sont rapprochées. Médiane, pas moyenne : une pause de sommeil ne la fausse pas.
        </p>
        {dailyFreq.length === 0 ? (
          <p className="empty">Il faut au moins deux contractions dans une journée pour une fréquence.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyFreq} margin={{ top: 8, right: 8, left: 8, bottom: 4 }} barCategoryGap="20%">
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
              <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={52}
                tickFormatter={(v) => formatElapsed(v)} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTip unit="ms" />} />
              <Bar dataKey="value" fill={C_INTERVAL} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="chart-block">
        <h2>Dernières 24 h — contractions par heure</h2>
        <p className="chart-sub">
          {hourTotal === 0
            ? 'Aucune contraction sur les dernières 24 heures.'
            : `Répartition heure par heure sur les 24 dernières heures (${hourTotal} au total).`}
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hourData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barCategoryGap="10%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} interval={2} axisLine={{ stroke: GRID }} tickLine={false} />
            <YAxis allowDecimals={false} width={28} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTip unit="count" />} />
            <Bar dataKey="value" fill={C_HOUR} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <MaternitySection phone={maternityPhone} onSave={onSaveMaternity} />

      <p className="stats-foot" style={{ color: INK, background: SURFACE }}>
        {list.length} contraction{list.length > 1 ? 's' : ''} enregistrée{list.length > 1 ? 's' : ''}.
        Les graphiques se lisent sans interprétation ; ils ne remplacent pas un avis médical.
      </p>
    </div>
  )
}
