import { recipes, recipesById } from '../data/index.ts'
import type { Recipe } from '../data/types.ts'

/** Choices apply to an item's production across the plan, including amplified variants. */
export function recipesForItem(item: string): Recipe[] {
  return recipes.filter((r) => r.products.some((p) => p.item === item))
}

export function selectedRecipeIds(enabled: readonly string[], selections: Record<string, string> = {}): string[] {
  const valid = Object.entries(selections).filter(([item, id]) =>
    recipesById.get(id)?.products.some((p) => p.item === item),
  )
  const ids = new Set([...enabled, ...valid.map(([, id]) => id)])
  return [...ids].filter((id) => {
    const recipe = recipesById.get(id)
    return recipe && valid.every(([item, choice]) =>
      id === choice || !recipe.products.some((p) => p.item === item),
    )
  })
}
