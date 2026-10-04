import { afterEach, describe, expect, it } from 'vitest'
import { recipesById } from '../src/data/index.ts'
import { defaultPlanInput, parsePlanSnapshot, toPlanSnapshot } from '../src/plan/serialize.ts'
import { buildPlanGraph } from '../src/plan/graph.ts'
import { cancelPendingSolve, usePlanner } from '../src/store/planner.ts'
import { layoutPlanGraph, resourcePortId, resourcePortY } from '../src/ui/flow-layout.ts'
import { outputRate } from '../src/ui/RecipePickerPage.tsx'

const item = 'Desc_IronPlate_C'
const alternate = 'Recipe_Alternate_CoatedIronPlate_C'
async function initialPlan() {
  usePlanner.getState().applyPlan({ ...defaultPlanInput(), targets: [{ item, ratePerMin: 60 }] })
  cancelPendingSolve()
  await usePlanner.getState().recompute()
}
afterEach(() => { cancelPendingSolve() })

describe('interactive recipe replacement', () => {
  it('selects an alternate even when disabled and rebalances inputs while preserving the target', async () => {
    await initialPlan()
    const before = usePlanner.getState().result
    expect(before?.status).toBe('optimal')
    expect(await usePlanner.getState().replaceRecipe(item, alternate)).toBeNull()
    const state = usePlanner.getState()
    expect(state.recipeSelections[item]).toBe(alternate)
    expect(state.result?.status).toBe('optimal')
    if (state.result?.status !== 'optimal') throw Error('no solution')
    const step = state.result.steps.find((s) => s.recipeId === alternate)!
    expect(step).toBeDefined()
    expect(step.outputs.find((output) => output.item === item)?.ratePerMin).toBeCloseTo(60)
    expect(step.inputs.some((input) => input.item === 'Desc_Plastic_C')).toBe(true)
    expect(state.result.steps.some((s) => s.recipeId === 'Recipe_IronPlate_C')).toBe(false)
    expect(state.result).not.toBe(before)
    // Saving, loading, and subsequent target edits all keep the selected recipe.
    const parsed = parsePlanSnapshot(toPlanSnapshot(state))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw Error(parsed.error)
    usePlanner.getState().applyPlan(parsed.input)
    cancelPendingSolve()
    await usePlanner.getState().recompute()
    expect(usePlanner.getState().recipeSelections[item]).toBe(alternate)
    expect(usePlanner.getState().result?.status).toBe('optimal')
  })
  it('retains the previous solution and selection when the alternate cannot be supplied', async () => {
    usePlanner.getState().applyPlan({ ...defaultPlanInput(), targets: [{ item, ratePerMin: 60 }], limitOverrides: { Desc_LiquidOil_C: 0 } })
    cancelPendingSolve()
    await usePlanner.getState().recompute()
    const previous = usePlanner.getState().result
    const failure = await usePlanner.getState().replaceRecipe(item, alternate)
    expect(failure).toBeTypeOf('string')
    expect(usePlanner.getState().result).toBe(previous)
    expect(usePlanner.getState().recipeSelections[item]).toBeUndefined()
  })
  it('100% recipe comparison uses one machine, without overclocking', () => {
    expect(outputRate(recipesById.get('Recipe_IronPlate_C')!, item)).toBe(20)
    expect(outputRate(recipesById.get(alternate)!, item)).toBe(75)
  })
  it('every edge ends and starts at its resource row, including multiple ingredients', async () => {
    await initialPlan()
    await usePlanner.getState().replaceRecipe(item, alternate)
    const result = usePlanner.getState().result
    if (result?.status !== 'optimal') throw Error('no solution')
    const graph = buildPlanGraph(result)
    const layout = await layoutPlanGraph(graph)
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    for (const edge of layout.edges) {
      const source = byId.get(edge.source)!
      const target = byId.get(edge.target)!
      const points = edge.data!.points
      expect(edge.sourceHandle).toBe(resourcePortId(source.id, 'out', edge.data!.item))
      expect(edge.targetHandle).toBe(resourcePortId(target.id, 'in', edge.data!.item))
      expect(points[0]!.y).toBeCloseTo(source.position.y + resourcePortY(source.data.node, 'out', edge.data!.item))
      expect(points.at(-1)!.y).toBeCloseTo(target.position.y + resourcePortY(target.data.node, 'in', edge.data!.item))
    }
  })
})
