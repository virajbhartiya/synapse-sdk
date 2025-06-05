/**
 * PDPTool handles communication with PDP servers for proof set operations
 */

import { ethers } from 'ethers'
import type { PDPAuthHelper } from './auth.js'
import type { RootData } from '../types.js'


/**
 * Response from creating a proof set
 */
export interface CreateProofSetResponse {
  /** Transaction hash for the proof set creation */
  txHash: string
  /** URL to check creation status */
  statusUrl: string
}

/**
 * Response from checking proof set creation status
 */
export interface ProofSetCreationStatusResponse {
  /** Transaction hash that created the proof set */
  createMessageHash: string
  /** Whether the proof set has been created on-chain */
  proofsetCreated: boolean
  /** Service label that created the proof set */
  service: string
  /** Transaction status (pending, confirmed, failed) */
  txStatus: string
  /** Whether the transaction was successful (null if still pending) */
  ok: boolean | null
  /** On-chain proof set ID (only available after creation) */
  proofSetId?: number
}

/**
 * Request structure for adding a root to a proof set
 */
export interface AddRootRequest {
  /** Root CID */
  rootCid: string
  /** Array of subroot entries */
  subroots: SubrootEntry[]
}

/**
 * Subroot entry structure
 */
export interface SubrootEntry {
  /** Subroot CID */
  subrootCid: string
}

/**
 * Payload for adding roots to a proof set
 */
export interface AddRootsPayload {
  /** Array of root requests */
  roots: AddRootRequest[]
  /** Optional extra data as hex string */
  extraData?: string
}

/**
 * Response from adding roots to a proof set
 */
export interface AddRootsResponse {
  /** Success message or response data */
  message: string
}

/**
 * PDPTool provides methods for interacting with PDP servers
 */
export class PDPTool {
  private readonly apiEndpoint: string
  private readonly pdpAuthHelper: PDPAuthHelper

  /**
   * Create a new PDPTool instance
   * @param apiEndpoint - The root URL of the PDP API endpoint (e.g., 'https://pdp.example.com')
   * @param pdpAuthHelper - PDPAuthHelper instance for generating signatures
   */
  constructor (apiEndpoint: string, pdpAuthHelper: PDPAuthHelper) {
    // Validate and normalize API endpoint (remove trailing slash)
    if (apiEndpoint === '') {
      throw new Error('PDP API endpoint is required')
    }
    this.apiEndpoint = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint

    this.pdpAuthHelper = pdpAuthHelper
  }

  /**
   * Create a new proof set on the PDP server
   * @param clientDataSetId - Unique ID for the client's dataset
   * @param payee - Address that will receive payments (storage provider)
   * @param withCDN - Whether to enable CDN services
   * @param recordKeeper - Address of the SimplePDPServiceWithPayments contract
   * @returns Promise that resolves with transaction hash and status URL
   */
  async createProofSet (
    clientDataSetId: number,
    payee: string,
    withCDN: boolean,
    recordKeeper: string
  ): Promise<CreateProofSetResponse> {
    // Generate the EIP-712 signature for proof set creation
    const authData = await this.pdpAuthHelper.signCreateProofSet(clientDataSetId, payee, withCDN)

    // Prepare the extra data for the contract call
    // This needs to match the ProofSetCreateData struct in SimplePDPServiceWithPayments.sol
    const extraData = this._encodeProofSetCreateData({
      metadata: '', // Empty metadata for now
      payer: await this.pdpAuthHelper.getSignerAddress(),
      withCDN,
      signature: authData.signature
    })

    // Prepare request body
    const requestBody = {
      recordKeeper,
      extraData: `0x${extraData}`
    }

    // Make the POST request to create the proof set
    const response = await fetch(`${this.apiEndpoint}/pdp/proof-sets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // No Authorization header needed (null authentication as per handlers.go)
      },
      body: JSON.stringify(requestBody)
    })

    if (response.status !== 201) {
      const errorText = await response.text()
      throw new Error(`Failed to create proof set: ${response.status} ${response.statusText} - ${errorText}`)
    }

    // Extract transaction hash from Location header
    const location = response.headers.get('Location')
    if (location == null) {
      throw new Error('Server did not provide Location header in response')
    }

    // Parse the location to extract the transaction hash
    // Expected format: /pdp/proof-sets/created/{txHash}
    const locationMatch = location.match(/\/pdp\/proof-sets\/created\/(.+)$/)
    if (locationMatch == null) {
      throw new Error(`Invalid Location header format: ${location}`)
    }

    const txHash = locationMatch[1]

    return {
      txHash,
      statusUrl: `${this.apiEndpoint}${location}`
    }
  }

  /**
   * Check the status of a proof set creation
   * @param txHash - Transaction hash from createProofSet
   * @returns Promise that resolves with the creation status
   */
  async getProofSetCreationStatus (txHash: string): Promise<ProofSetCreationStatusResponse> {
    const response = await fetch(`${this.apiEndpoint}/pdp/proof-sets/created/${txHash}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
        // No Authorization header needed (null authentication)
      }
    })

    if (response.status === 404) {
      throw new Error(`Proof set creation not found for transaction hash: ${txHash}`)
    }

    if (response.status !== 200) {
      const errorText = await response.text()
      throw new Error(`Failed to get proof set creation status: ${response.status} ${response.statusText} - ${errorText}`)
    }

    return await response.json() as ProofSetCreationStatusResponse
  }

  /**
 * Add roots to an existing proof set
 * @param proofSetId - ID of the proof set to add roots to
 * @param clientDataSetId - Unique ID for the client's dataset
 * @param nextRootId - The next root ID for this proof set
 * @param rootDataArray - Array of root data containing CID and raw size
 * @returns Promise that resolves with the response
 */
async addRoots (
  proofSetId: number,
  clientDataSetId: number,
  nextRootId: number,
  rootDataArray: RootData[]
): Promise<AddRootsResponse> {
  // Generate the EIP-712 signature for adding roots
  const authData = await this.pdpAuthHelper.signAddRoots(clientDataSetId, nextRootId, rootDataArray)

  // Prepare the extra data for the contract call
  const extraData = this._encodeAddRootsData({
    metadata: "",
    signature: authData.signature
  })

  // Convert RootData array to AddRootRequest format
  const addRootRequests: AddRootRequest[] = rootDataArray.map(rootData => ({
    rootCid: typeof rootData.cid === 'string' ? rootData.cid : rootData.cid.toString(),
    subroots: [
      {
        subrootCid: typeof rootData.cid === 'string' ? rootData.cid : rootData.cid.toString()
      }
    ]
  }))

  // Construct request payload
  const payload: AddRootsPayload = {
    roots: addRootRequests,
    extraData: `0x${extraData}`
  }

  // Make the POST request
  const response = await fetch(`${this.apiEndpoint}/pdp/proof-sets/${proofSetId}/roots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
      // No Authorization header needed (null authentication as per handlers.go)
    },
    body: JSON.stringify(payload)
  })

  if (response.status !== 201) {
    const errorText = await response.text()
    throw new Error(`Failed to add roots: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const responseText = await response.text()
  return {
    message: responseText || `Roots added to proof set ID ${proofSetId} successfully`
  }
}

/**
 * Encode AddRootsData for extraData field
 * This matches the expected structure for adding roots to a proof set
 */
private _encodeAddRootsData (data: {
  metadata: string
  signature: string
}): string {
  // Ensure signature has 0x prefix
  const signature = data.signature.startsWith('0x') ? data.signature : `0x${data.signature}`

  // ABI encode the struct as a tuple
  const abiCoder = ethers.AbiCoder.defaultAbiCoder()
  const encoded = abiCoder.encode(
    ['bytes', 'string'],
    [signature, data.metadata]
  )

  // Return hex string without 0x prefix (since we add it in the calling code)
  return encoded.slice(2)
}


  /**
   * Get the API endpoint
   */
  getApiEndpoint (): string {
    return this.apiEndpoint
  }

  /**
   * Get the PDPAuthHelper instance
   */
  getPDPAuthHelper (): PDPAuthHelper {
    return this.pdpAuthHelper
  }

  /**
   * Encode ProofSetCreateData for extraData field
   * This matches the Solidity struct ProofSetCreateData in SimplePDPServiceWithPayments.sol
   */
  private _encodeProofSetCreateData (data: {
    metadata: string
    payer: string
    withCDN: boolean
    signature: string
  }): string {
    // Use ethers ABI encoding to match the Solidity struct
    // ProofSetCreateData struct:
    // - string metadata
    // - address payer
    // - bool withCDN
    // - bytes signature

    // Ensure signature has 0x prefix
    const signature = data.signature.startsWith('0x') ? data.signature : `0x${data.signature}`

    // ABI encode the struct as a tuple
    const abiCoder = ethers.AbiCoder.defaultAbiCoder()
    const encoded = abiCoder.encode(
      ['string', 'address', 'bool', 'bytes'],
      [data.metadata, data.payer, data.withCDN, signature]
    )

    // Return hex string without 0x prefix (since we add it in the calling code)
    return encoded.slice(2)
  }
}
