/**
 * Main Synapse class for interacting with Filecoin storage and other on-chain services
 */

import { ethers } from 'ethers'
import {
  type SynapseOptions,
  type StorageServiceOptions,
  type FilecoinNetworkType,
  type PieceDiscovery
} from './types.js'
import { StorageService } from './storage/index.js'
import { PaymentsService } from './payments/index.js'
import { PandoraService } from './pandora/index.js'
import { ChainDiscovery } from './discovery/chain.js'
import { CHAIN_IDS, CONTRACT_ADDRESSES, createError } from './utils/index.js'

export class Synapse {
  private readonly _signer: ethers.Signer
  private readonly _network: FilecoinNetworkType
  private readonly _withCDN: boolean
  private readonly _payments: PaymentsService
  private readonly _provider: ethers.Provider
  private readonly _pandoraAddress: string
  private readonly _pieceDiscovery: PieceDiscovery

  /**
   * Create a new Synapse instance with async initialization.
   * @param options - Configuration options for Synapse
   * @returns A fully initialized Synapse instance
   */
  static async create (options: SynapseOptions & { pieceDiscovery?: PieceDiscovery }): Promise<Synapse> {
    // Validate options
    const providedOptions = [options.privateKey, options.provider, options.signer].filter(Boolean).length
    if (providedOptions !== 1) {
      throw new Error('Must provide exactly one of: privateKey, provider, or signer')
    }
    if (options.privateKey != null && options.rpcURL == null) {
      throw new Error('rpcURL is required when using privateKey')
    }

    // Initialize provider and signer
    let provider: ethers.Provider
    let signer: ethers.Signer

    if (options.privateKey != null && options.rpcURL != null) {
      // Create provider from RPC URL
      if (options.rpcURL.startsWith('ws://') || options.rpcURL.startsWith('wss://')) {
        provider = new ethers.WebSocketProvider(options.rpcURL)
      } else {
        // For HTTP/HTTPS URLs, check if authorization is provided
        if (options.authorization != null) {
          const fetchRequest = new ethers.FetchRequest(options.rpcURL)
          fetchRequest.setHeader('Authorization', options.authorization)
          provider = new ethers.JsonRpcProvider(fetchRequest)
        } else {
          provider = new ethers.JsonRpcProvider(options.rpcURL)
        }
      }

      // Create wallet from private key
      const wallet = new ethers.Wallet(options.privateKey, provider)

      // Apply NonceManager if not disabled
      if (options.disableNonceManager !== true) {
        signer = new ethers.NonceManager(wallet)
      } else {
        signer = wallet
      }
    } else if (options.provider != null) {
      provider = options.provider

      // Get signer from provider
      if ('getSigner' in provider && typeof provider.getSigner === 'function') {
        const providerSigner = await (provider as any).getSigner()

        // Apply NonceManager if not disabled
        if (options.disableNonceManager !== true) {
          signer = new ethers.NonceManager(providerSigner)
        } else {
          signer = providerSigner
        }
      } else {
        throw new Error('Provider must support getSigner() method')
      }
    } else if (options.signer != null) {
      signer = options.signer

      if (signer.provider != null) {
        provider = signer.provider
      } else {
        throw new Error('Signer must have a provider attached')
      }

      // Apply NonceManager if not disabled
      if (options.disableNonceManager !== true) {
        signer = new ethers.NonceManager(signer)
      }
    } else {
      throw new Error('Invalid configuration')
    }

    // Detect network
    let network: FilecoinNetworkType
    try {
      const ethersNetwork = await provider.getNetwork()
      const chainId = Number(ethersNetwork.chainId)

      if (chainId === CHAIN_IDS.mainnet) {
        network = 'mainnet'
      } else if (chainId === CHAIN_IDS.calibration) {
        network = 'calibration'
      } else {
        throw new Error(
          `Unsupported network with chain ID ${chainId}. Synapse SDK only supports Filecoin mainnet (${CHAIN_IDS.mainnet}) and calibration (${CHAIN_IDS.calibration}) networks.`
        )
      }
    } catch (error) {
      throw new Error(
        `Failed to detect network from provider. Please ensure your RPC endpoint is accessible and responds to network queries. ${
          error instanceof Error ? `Underlying error: ${error.message}` : ''
        }`
      )
    }

    // Determine Pandora address early for discovery initialization
    const pandoraAddress = options.pandoraAddress ?? CONTRACT_ADDRESSES.PANDORA_SERVICE[network]
    if (pandoraAddress === '' || pandoraAddress === undefined) {
      throw new Error(`No Pandora service address configured for network: ${network}`)
    }

    // Create default discovery if not provided
    const pieceDiscovery = options.pieceDiscovery ?? new ChainDiscovery(provider, pandoraAddress)

    return new Synapse(
      provider,
      signer,
      network,
      options.disableNonceManager === true,
      options.withCDN === true,
      pandoraAddress,
      pieceDiscovery
    )
  }

  private constructor (
    provider: ethers.Provider,
    signer: ethers.Signer,
    network: FilecoinNetworkType,
    disableNonceManager: boolean,
    withCDN: boolean,
    pandoraAddress: string,
    pieceDiscovery: PieceDiscovery
  ) {
    this._provider = provider
    this._signer = signer
    this._network = network
    this._withCDN = withCDN
    this._payments = new PaymentsService(provider, signer, network, disableNonceManager)
    this._pandoraAddress = pandoraAddress
    this._pieceDiscovery = pieceDiscovery
  }

  /**
   * Get the payments instance for payment operations
   * @returns The PaymentsService instance
   */
  get payments (): PaymentsService {
    return this._payments
  }

  /**
   * Get the provider instance
   * @internal
   * @returns The ethers Provider instance
   */
  getProvider (): ethers.Provider {
    return this._provider
  }

  /**
   * Get the signer instance
   * @internal
   * @returns The ethers Signer instance
   */
  getSigner (): ethers.Signer {
    return this._signer
  }

  /**
   * Get the chain ID as bigint
   * @internal
   * @returns The chain ID
   */
  getChainId (): bigint {
    return BigInt(CHAIN_IDS[this._network])
  }

  /**
   * Get the Pandora service address
   * @internal
   * @returns The Pandora service address
   */
  getPandoraAddress (): string {
    return this._pandoraAddress
  }

  /**
   * Create a storage service instance for interacting with PDP storage
   * @param options - Configuration options for the storage service
   * @returns A fully initialized StorageService instance
   */
  async createStorage (options?: StorageServiceOptions): Promise<StorageService> {
    try {
      // Merge instance-level CDN preference with provided options
      const mergedOptions: StorageServiceOptions = {
        ...options,
        withCDN: options?.withCDN ?? this._withCDN
      }

      // Create PandoraService instance
      const pandoraService = new PandoraService(this._provider, this._pandoraAddress)

      // Create the storage service with proper initialization
      const storageService = await StorageService.create(this, pandoraService, mergedOptions)
      return storageService
    } catch (error) {
      throw createError(
        'Synapse',
        'createStorage',
        'Failed to create storage service',
        error
      )
    }
  }

  /**
   * Get the network this instance is connected to
   * @returns The network type ('mainnet' or 'calibration')
   */
  getNetwork (): FilecoinNetworkType {
    return this._network
  }

  /**
   * Download a piece using discovery to find all locations
   * Tries URLs as they're discovered, enabling fast cache hits
   * @param commp - The piece commitment (CommP) to download
   * @param options - Optional download options including preferred provider
   * @returns A ReadableStream of the piece data
   */
  async download (
    commp: string,
    options?: { providerAddress?: string }
  ): Promise<ReadableStream<Uint8Array>> {
    const client = await this._signer.getAddress()
    const errors: Error[] = []
    let attemptedUrls = 0

    // Try URLs as they're discovered
    for await (const url of this._pieceDiscovery.findPiece(commp, client, options)) {
      attemptedUrls++
      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        // Verify we got a body
        if (response.body == null) {
          throw new Error('Response body is null')
        }

        return response.body
      } catch (error) {
        errors.push(new Error(`${url}: ${error instanceof Error ? error.message : String(error)}`))
        continue // Try next URL as it comes in
      }
    }

    if (attemptedUrls === 0) {
      throw createError(
        'Synapse',
        'download',
        `Piece ${commp} not found`
      )
    }

    throw createError(
      'Synapse',
      'download',
      'All download attempts failed',
      new AggregateError(errors)
    )
  }
}

// Export as default
export { Synapse as default }
