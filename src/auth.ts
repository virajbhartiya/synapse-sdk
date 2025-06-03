/**
 * Authentication helpers for Synapse operations
 */

import { ethers } from 'ethers'
import { Operation, type AuthSignature, type RootData } from './types.js'
import { asCommP } from './commp/index.js'

/**
 * Helper functions to create properly formatted data for each operation
 */
export class AuthHelper {
  private readonly serviceContractAddress: string
  private readonly signer: ethers.Signer

  constructor (serviceContractAddress: string, signer: ethers.Signer) {
    this.serviceContractAddress = serviceContractAddress
    this.signer = signer
  }

  /**
   * Sign CreateProofSet operation
   * @param clientDataSetId - Unique dataset ID for the client
   * @param payee - Storage provider address receiving payment
   */
  async signCreateProofSet (
    clientDataSetId: number | bigint,
    payee: string
  ): Promise<AuthSignature> {
    const data = [
      this.serviceContractAddress, // address
      Operation.CreateProofSet, // uint8
      BigInt(clientDataSetId), // uint256
      payee // address
    ]

    const types = ['address', 'uint8', 'uint256', 'address']
    return await this._signData(data, types)
  }

  /**
   * Sign AddRoots operation
   * @param clientDataSetId - Dataset ID (not proofSetId!)
   * @param firstRootId - ID of the first root being added
   * @param rootDataArray - Array of root data (CID + raw size)
   */
  async signAddRoots (
    clientDataSetId: number | bigint,
    firstRootId: number | bigint,
    rootDataArray: RootData[]
  ): Promise<AuthSignature> {
    // Convert rootData to the format expected by the contract
    const formattedRootData = rootDataArray.map(root => {
      const commP = typeof root.cid === 'string' ? asCommP(root.cid) : root.cid
      if (commP == null) {
        throw new Error(`Invalid CommP: ${String(root.cid)}`)
      }

      // Contract expects tuple(tuple(bytes), uint256) format
      // where the inner tuple(bytes) represents the CID
      return [
        [commP.bytes], // tuple(bytes) - CID as bytes
        BigInt(root.rawSize) // uint256 - raw size
      ]
    })

    const data = [
      this.serviceContractAddress, // address
      Operation.AddRoots, // uint8
      BigInt(clientDataSetId), // uint256
      BigInt(firstRootId), // uint256
      formattedRootData // tuple(tuple(bytes),uint256)[]
    ]

    const types = ['address', 'uint8', 'uint256', 'uint256', 'tuple(tuple(bytes),uint256)[]']
    return await this._signData(data, types)
  }

  /**
   * Sign ScheduleRemovals operation
   * @param clientDataSetId - Dataset ID
   * @param rootIds - Array of root IDs to remove
   */
  async signScheduleRemovals (
    clientDataSetId: number | bigint,
    rootIds: Array<number | bigint>
  ): Promise<AuthSignature> {
    const data = [
      this.serviceContractAddress, // address
      Operation.ScheduleRemovals, // uint8
      BigInt(clientDataSetId), // uint256
      rootIds.map(id => BigInt(id)) // uint256[]
    ]

    const types = ['address', 'uint8', 'uint256', 'uint256[]']
    return await this._signData(data, types)
  }

  /**
   * Sign DeleteProofSet operation
   * @param clientDataSetId - Dataset ID to delete
   */
  async signDeleteProofSet (
    clientDataSetId: number | bigint
  ): Promise<AuthSignature> {
    const data = [
      this.serviceContractAddress, // address
      Operation.DeleteProofSet, // uint8
      BigInt(clientDataSetId) // uint256
    ]

    const types = ['address', 'uint8', 'uint256']
    return await this._signData(data, types)
  }

  /**
   * Low-level signing function
   */
  private async _signData (data: any[], types: string[]): Promise<AuthSignature> {
    // ABI encode the data
    const abiCoder = ethers.AbiCoder.defaultAbiCoder()
    const encodedData = abiCoder.encode(types, data)

    // Hash the encoded data with keccak256
    const messageHash = ethers.keccak256(encodedData)

    // Sign the hash (ethers handles the message prefix internally)
    const signature = await this.signer.signMessage(ethers.getBytes(messageHash))

    // Split signature into components
    const sig = ethers.Signature.from(signature)

    return {
      signature,
      v: sig.v,
      r: sig.r,
      s: sig.s,
      signedData: encodedData
    }
  }
}

/**
 * Create auth blob for PDP operations
 * This is what gets passed to the PDP service for verification
 */
export function createAuthBlob (authSignature: AuthSignature): string {
  // The auth blob typically contains the signature and any metadata
  // Based on the contract's decode methods, this might be:
  // abi.encode(signature, metadata) or just the signature

  // For now, return the signature as base64 (can be adjusted based on PDP service expectations)
  return Buffer.from(authSignature.signature.slice(2), 'hex').toString('base64')
}

/**
 * Verify that a signature matches the expected signer for testing/debugging
 */
export function verifySignature (
  authSignature: AuthSignature,
  expectedSigner: string
): boolean {
  const messageHash = ethers.keccak256(authSignature.signedData)
  const recoveredAddress = ethers.recoverAddress(messageHash, {
    v: authSignature.v,
    r: authSignature.r,
    s: authSignature.s
  })

  return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase()
}
