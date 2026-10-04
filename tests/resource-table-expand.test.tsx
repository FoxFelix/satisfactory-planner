// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { LocaleProvider } from '../src/i18n/index.ts'
import { ResourcesTable } from '../src/ui/ResourcesTable.tsx'
import { planExtraction } from '../src/solver/extraction.ts'
import type { Solution } from '../src/solver/index.ts'
import { usePlanner, cancelPendingSolve } from '../src/store/planner.ts'

it.each([1, 1.5])('expands settings inside table across all columns at clock %s; numeric rows stay above it', async clock => {
  const original = usePlanner.getState()
  usePlanner.setState({ extractionOverrides: {} })
  const solution = { rawResources: [{ item: 'Desc_OreIron_C', ratePerMin: 500, limitPerMin: null, usageRatio: null }] } as Solution
  const extraction = planExtraction(solution, { clock })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<LocaleProvider initialLocale="en"><ResourcesTable solution={solution} extraction={extraction} /></LocaleProvider>))
    const toggle = container.querySelector<HTMLButtonElement>('.resource-row__toggle')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[data-resource]')).toBeNull()
    await act(async () => toggle.click())
    const row = container.querySelector<HTMLTableRowElement>('.resource-settings-row')!
    expect(row.closest('tbody')).not.toBeNull()
    expect(row.cells[0].colSpan).toBe(clock > 1 ? 9 : 8)
    expect(row.previousElementSibling!.textContent).toContain('Miner')
    expect(container.querySelector('tbody')!.textContent).toContain('500.00')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const add = [...row.querySelectorAll('button')].find(b => b.textContent === 'Add node group')!
    await act(async () => add.click())
    expect(usePlanner.getState().extractionOverrides.Desc_OreIron_C.nodes!.length).toBe(extraction.totalBuildingCount + 1)
    await act(async () => toggle.click())
    expect(container.querySelector('.resource-settings-row')).toBeNull()
    expect(container.querySelector('tbody')!.textContent).toContain('500.00')
    expect(container.querySelector('tbody a')).toBeNull()
    expect(container.querySelector('th[scope="row"] .unit')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    cancelPendingSolve()
    usePlanner.setState(original)
    container.remove()
  }
})
