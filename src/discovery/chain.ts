/**
 * ChainDiscovery - Default implementation of PieceDiscovery using on-chain data
 *
 * This implementation discovers piece locations by:
 * 1. Querying the client's proof sets from Pandora contract
 * 2. Checking each storage provider to see if they have the piece
 * 3. Yielding URLs as they're discovered for progressive downloads
 * 4. Caching results for efficient repeated lookups
 *
 * @example
 * ```typescript
 * const discovery = new ChainDiscovery(provider, pandoraAddress)
 *
 * // Use directly
 * for await (const url of discovery.findPiece(commp, client)) {
 *   console.log('Found piece at:', url)
 * }
 *
 * // Or with Synapse
 * const synapse = await Synapse.create({ pieceDiscovery: discovery })
 * ```
 */

import { ethers } from 'ethers'
import type { PieceDiscovery } from '../types.js'
import { PandoraService } from '../pandora/service.js'

interface CachedEntry {
  urls: Map<string, string> // providerAddress -> url
  timestamp: number
}

export class ChainDiscovery implements PieceDiscovery {
  private readonly cache = new Map<string, CachedEntry>()
  private readonly cacheTTL = 30 * 60 * 1000 // 30 minutes

  constructor (
    private readonly provider: ethers.Provider,
    private readonly pandoraAddress: string
  ) {}

  async * findPiece (
    commp: string,
    client: string,
    options?: { providerAddress?: string }
  ): AsyncIterable<string> {
    // Simple cache key - just the piece
    const cached = this.cache.get(commp)

    // Yield cached URLs immediately if available
    if (cached != null && Date.now() - cached.timestamp < this.cacheTTL) {
      // If specific provider requested, try that first
      if (options?.providerAddress != null && cached.urls.has(options.providerAddress)) {
        const providerUrl = cached.urls.get(options.providerAddress)
        if (providerUrl !== undefined) {
          yield providerUrl
        }
      }

      // Then yield all other cached URLs
      for (const [paddr, url] of cached.urls) {
        if (paddr !== options?.providerAddress) {
          yield url
        }
      }
      return // Cache hit, no need to query chain
    }

    // Get client's proof sets
    const pandora = new PandoraService(this.provider, this.pandoraAddress)
    const proofSets = await pandora.getClientProofSetsWithDetails(client)

    // Filter to active proof sets, optionally by provider
    let activeProofSets = proofSets.filter(ps =>
      ps.isLive && ps.currentRootCount > 0
    )

    // If providerAddress specified, prioritize that provider's proof sets
    if (options?.providerAddress != null) {
      // Put this provider's proof sets first
      const providerAddress = options.providerAddress
      const providerSets = activeProofSets.filter(ps =>
        ps.payee.toLowerCase() === providerAddress.toLowerCase()
      )
      const otherSets = activeProofSets.filter(ps =>
        ps.payee.toLowerCase() !== providerAddress.toLowerCase()
      )
      activeProofSets = [...providerSets, ...otherSets]
    }

    // Track URLs for caching
    const foundUrls = new Map<string, string>()

    // Query providers and yield URLs as they're found
    for (const proofSet of activeProofSets) {
      try {
        // Get provider info by address
        const provider = await pandora.getApprovedProvider(proofSet.payee)

        // Check if provider has the piece
        // For discovery, we only need to call findPiece which doesn't require auth
        // So we can use a direct HTTP call instead of PDPServer
        const findUrl = `${provider.pdpUrl}/pdp/piece/${commp}`
        const response = await fetch(findUrl, { method: 'GET' })
        const hasPiece = response.ok

        if (hasPiece) {
          // Construct and yield URL immediately
          const url = `${provider.pdpUrl}/pdp/piece/${commp}`
          yield url
          foundUrls.set(proofSet.payee, url)
        }
      } catch {
        // Provider might be offline, continue to next
      }
    }

    // Cache results for future queries (cache by piece only)
    if (foundUrls.size > 0) {
      this.cache.set(commp, { urls: foundUrls, timestamp: Date.now() })
    }
  }
}
