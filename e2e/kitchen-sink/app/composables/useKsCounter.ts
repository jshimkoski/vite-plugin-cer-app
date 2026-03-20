import { ref } from '@jasonshimmy/custom-elements-runtime'

export function useKsCounter(initial = 0) {
  const count = ref(initial)
  const increment = () => { count.value++ }
  const decrement = () => { count.value-- }
  const reset = () => { count.value = 0 }
  return { count, increment, decrement, reset }
}
