export interface TimingData {
  operation: string
  startTime: number
  endTime?: number
  duration?: number
  metadata?: Record<string, any>
}

export interface TimingResult {
  operation: string
  duration: number
  metadata?: Record<string, any>
}

class TimingCollector {
  public timings: Map<string, TimingData[]> = new Map()

  start(operation: string, metadata?: Record<string, any>): void {
    const timing: TimingData = {
      operation,
      startTime: performance.now(),
      metadata
    }
    
    if (!this.timings.has(operation)) {
      this.timings.set(operation, [])
    }
    this.timings.get(operation)!.push(timing)
  }

  end(operation: string): TimingResult | null {
    const operationTimings = this.timings.get(operation)
    if (!operationTimings || operationTimings.length === 0) {
      return null
    }

    const timing = operationTimings[operationTimings.length - 1]
    if (timing.endTime) {
      return null // Already ended
    }

    timing.endTime = performance.now()
    timing.duration = timing.endTime - timing.startTime

    return {
      operation,
      duration: timing.duration,
      metadata: timing.metadata
    }
  }

  getResults(): Record<string, TimingResult[]> {
    const results: Record<string, TimingResult[]> = {}
    
    for (const [operation, timings] of this.timings) {
      results[operation] = timings
        .filter(t => t.duration !== undefined)
        .map(t => ({
          operation: t.operation,
          duration: t.duration!,
          metadata: t.metadata
        }))
    }
    
    return results
  }

  clear(): void {
    this.timings.clear()
  }

  printResults(): void {
    const results = this.getResults()
    console.log('\n=== TIMING RESULTS ===')
    
    for (const [operation, timings] of Object.entries(results)) {
      console.log(`\n${operation}:`)
      timings.forEach((timing, index) => {
        const metadataStr = timing.metadata ? ` (${JSON.stringify(timing.metadata)})` : ''
        console.log(`  ${index + 1}. ${timing.duration.toFixed(2)}ms${metadataStr}`)
      })
      
      if (timings.length > 1) {
        const avg = timings.reduce((sum, t) => sum + t.duration, 0) / timings.length
        const min = Math.min(...timings.map(t => t.duration))
        const max = Math.max(...timings.map(t => t.duration))
        console.log(`  Average: ${avg.toFixed(2)}ms, Min: ${min.toFixed(2)}ms, Max: ${max.toFixed(2)}ms`)
      }
    }
    console.log('\n=====================\n')
  }
}

export const timingCollector = new TimingCollector()

declare global {
  var timingCollector: TimingCollector
}

if (typeof globalThis !== 'undefined') {
  globalThis.timingCollector = timingCollector
} 