import { useLocale } from '../i18n/index.ts'
import { useState } from 'react'
import { resourceExtractionText } from '../i18n/resource-extraction.ts'
import { ResourceExtractionEditor } from './ResourceExtractionEditor.tsx'
import { usePlanner } from '../store/planner.ts'
/** 原料表: 必要レート・マップ上限比率・採掘機台数・純度別ノード数。 */
import type { ExtractionPlan, ExtractorGroup, ResourceExtraction, Solution } from '../solver/index.ts'
import {
  fmtClock,
  fmtCount,
  fmtInt,
  fmtPercent,
  fmtPower,
  fmtRate,
  itemName,
} from './format.ts'
import { ItemIcon } from './ItemIcon.tsx'
import { T } from './text.ts'

type Props = {
  solution: Solution
  extraction: ExtractionPlan | null
}

export function ResourcesTable({ solution, extraction }: Props) {
  const { locale } = useLocale()
  const P = resourceExtractionText(locale)
  const hasOverrides = usePlanner(s => Object.keys(s.extractionOverrides).length > 0)
  if (solution.rawResources.length === 0) return <p className="hint">{T.resources.empty}</p>
  const byItem = new Map((extraction?.resources ?? []).map((r) => [r.item, r]))

  // シャード列は採掘クロックを 100% 超にしたときだけ出す
  const showShards = (extraction?.totalPowerShards ?? 0) > 0

  return (
    <div className="stack">
      {extraction && <p className="hint">{hasOverrides ? P.customizedClock : T.resources.clockNote(fmtClock(extraction.clock))}</p>}
      {extraction && extraction.shortfalls.length > 0 && (
        <p className="callout callout--warn">
          {extraction.shortfalls
            // 名前は ID から引く（解の itemName は ja/en しか持たないので、
            // そのまま使うと Tier 2 の画面に日本語が残る）
            .map((s) => `${itemName(s.item)}: ${T.resources.shortfallNote(fmtRate(s.shortfallPerMin))}`)
            .join(' / ')}
        </p>
      )}
      <section className="card card--wide">
        <div className="table-scroll table-scroll--wide">
          <table className="table">
          <thead>
            <tr>
              <th scope="col">{T.resources.item}</th>
              <th scope="col" className="num">{T.resources.required}</th>
              <th scope="col" className="num">{T.resources.limit}</th>
              <th scope="col" className="num">{T.resources.usage}</th>
              <th scope="col">{T.resources.extractor}</th>
              <th scope="col" className="num">{T.resources.machines}</th>
              <th scope="col">{T.resources.nodes}</th>
              {showShards && <th scope="col" className="num">{T.resources.shards}</th>}
              <th scope="col" className="num">{T.resources.power}</th>
            </tr>
          </thead>
          <tbody>
            {solution.rawResources.map((raw) => {
              const plan = byItem.get(raw.item)
              const groups: ExtractorGroup[] = plan?.groups ?? []
              const span = Math.max(1, groups.length)
              return (
                <ResourceRows
                  key={raw.item}
                  item={raw.item}
                  ratePerMin={raw.ratePerMin}
                  limitPerMin={raw.limitPerMin}
                  usageRatio={raw.usageRatio}
                  plan={plan}
                  groups={groups}
                  span={span}
                  showShards={showShards}
                />
              )
            })}
          </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

type RowsProps = {
  item: string
  ratePerMin: number
  limitPerMin: number | null
  usageRatio: number | null
  plan: ResourceExtraction | undefined
  groups: ExtractorGroup[]
  span: number
  showShards: boolean
}

function ResourceRows({
  item,
  ratePerMin,
  limitPerMin,
  usageRatio,
  plan,
  groups,
  span,
  showShards,
}: RowsProps) {
  const [expanded, setExpanded] = useState(false)
  const settingId = `resource-settings-${item}`
  const head = (
    <>
      <th scope="row" rowSpan={span}>
        <div className="resource-row__name">
          <button type="button" className="resource-row__toggle" aria-expanded={expanded}
            aria-controls={settingId} onClick={() => setExpanded(value => !value)}>
            <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
            <ItemIcon id={item} name={itemName(item)} /><span>{itemName(item)}</span>
          </button>
        </div>
      </th>
      <td className="num" rowSpan={span}>
        {fmtRate(ratePerMin)}
      </td>
      <td className="num" rowSpan={span}>
        {limitPerMin === null ? T.sidebar.unlimited : fmtInt(limitPerMin)}
      </td>
      <td className="num" rowSpan={span}>
        {fmtPercent(usageRatio)}
      </td>
    </>
  )

  return (
    <>
      {groups.length === 0 && <tr>
        {head}
        <td colSpan={showShards ? 4 : 3}>—</td>
        <td className="num">{fmtPower(plan?.powerMW ?? 0)}</td>
      </tr>}
      {groups.map((group, index) => (
        <tr key={group.id ?? `${group.extractorId}:${index}`}>
          {index === 0 && head}
          <td>
            {itemName(group.extractorId)} <span className="unit">({fmtClock(group.clockSpeed)})</span>
            {group.pressurizerCount ? (
              <span className="unit">
                {' '}{T.resources.pressurizerCount(fmtInt(group.pressurizerCount))}
              </span>
            ) : null}
          </td>
          <td className="num">
            {T.resources.machineBuildCount(
              fmtCount(group.machineCount),
              fmtInt(group.buildingCount),
            )}
          </td>
          <td>{nodeBreakdown(group)}</td>
          {showShards && <td className="num">{fmtInt(group.powerShards)}</td>}
          <td className="num">{fmtPower(group.powerMW + (group.pressurizerPowerMW ?? 0))}</td>
        </tr>
      ))}
      {expanded && <tr className="resource-settings-row" id={settingId}>
        <td colSpan={showShards ? 9 : 8}>
          <ResourceExtractionEditor item={item} required={ratePerMin} plan={plan} />
        </td>
      </tr>}
    </>
  )
}

function nodeBreakdown(group: ExtractorGroup) {
  if (group.assignments.length === 0) return '—'
  if (group.assignments.some((a) => !Number.isFinite(a.availableNodes))) {
    return <span className="unit">{T.resources.unlimitedNodes}</span>
  }
  return (
    <ul className="flow-list">
      {group.assignments.map((assignment) => (
        <li key={assignment.purity}>
          <span className="flow__name">{T.resources.purity[assignment.purity]}</span>
          <span className="flow__rate num">
            {T.resources.nodesOf(fmtCount(assignment.nodes), assignment.availableNodes)}
          </span>
        </li>
      ))}
    </ul>
  )
}
