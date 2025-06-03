#!/usr/bin/env node

/**
 * Simple Authentication Example for Synapse Operations
 *
 * This script demonstrates how to generate auth signatures for each operation type.
 * Edit the values below to generate signatures for your specific use case.
 *
 * Usage: node example-auth-simple.js
 */

import { Synapse } from './dist/index.js'

async function main () {
  // ============================================================
  // CONFIGURATION - Edit these values for your use case
  // ============================================================

  // Your private key (required)
  const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' // Default anvil key #0

  // Network RPC (use calibration testnet by default)
  const RPC_URL = 'https://api.calibration.node.glif.io/rpc/v1'

  // PDP service contract address (calibration testnet)
  const PDP_SERVICE_CONTRACT_ADDRESS = '0x2B76E983d30553E7717547230670D4F4F4d813aC' // SimplePDPServiceWithPayments on calibration

  // ============================================================
  // EXAMPLE VALUES - Edit these for your specific operations
  // ============================================================

  // CreateProofSet parameters
  const CREATE_PROOF_SET_PARAMS = {
    clientDataSetId: 12345,
    payee: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' // Example SP address
  }

  // AddRoots parameters
  const ADD_ROOTS_PARAMS = {
    clientDataSetId: 12345,
    firstRootId: 1,
    rootDataArray: [
      {
        cid: 'baga6ea4seaqpy7usqklokfx2vxuynmupslkeutzexe2uqurdg5vhtebhxqmpqmy',
        rawSize: 1024
      },
      {
        cid: 'baga6ea4seaqkt24j5gbf2ye2wual5gn7a5yl2tqb52v2sk4nvur4bdy7lg76cdy',
        rawSize: 2048
      },
      {
        cid: 'baga6ea4seaqjtovkwk4myyzj56eztkh5pzsk5upksan6f5outesy62bsvl4dsha',
        rawSize: 4096
      }
    ]
  }

  // ScheduleRemovals parameters
  const SCHEDULE_REMOVALS_PARAMS = {
    clientDataSetId: 12345,
    rootIds: [1, 3, 5, 7]
  }

  // DeleteProofSet parameters
  const DELETE_PROOF_SET_PARAMS = {
    clientDataSetId: 12345
  }

  // ============================================================
  // SIGNATURE GENERATION - No need to edit below this line
  // ============================================================

  try {
    console.log('Synapse Auth Signature Generator')
    console.log('================================\n')

    // The PDP service contract address is now hardcoded in the SDK constants
    // but we show it here for reference
    console.log(`PDP Service Contract: ${PDP_SERVICE_CONTRACT_ADDRESS}`)
    console.log('(SimplePDPServiceWithPayments on calibration testnet)\n')

    // Initialize Synapse
    const synapse = await Synapse.create({
      privateKey: PRIVATE_KEY,
      rpcURL: RPC_URL
    })

    const signerAddress = await synapse.getSignerAddress()
    console.log(`Signer Address: ${signerAddress}`)
    console.log(`Network: ${RPC_URL}\n`)

    console.log('Generated Signatures:')
    console.log('===================\n')

    // 1. CreateProofSet
    console.log('1. CreateProofSet')
    console.log(`   Client Dataset ID: ${CREATE_PROOF_SET_PARAMS.clientDataSetId}`)
    console.log(`   Payee: ${CREATE_PROOF_SET_PARAMS.payee}`)

    const createSig = await synapse.signCreateProofSet(
      CREATE_PROOF_SET_PARAMS.clientDataSetId,
      CREATE_PROOF_SET_PARAMS.payee
    )

    console.log(`   Signature (hex): ${createSig.signature}`)
    console.log(`   Auth Blob (hex): 0x${Buffer.from(createSig.signature.slice(2), 'hex').toString('hex')}`)
    console.log(`   Encoded Data: ${createSig.signedData}`)
    console.log()

    // 2. AddRoots
    console.log('2. AddRoots')
    console.log(`   Client Dataset ID: ${ADD_ROOTS_PARAMS.clientDataSetId}`)
    console.log(`   First Root ID: ${ADD_ROOTS_PARAMS.firstRootId}`)
    console.log(`   Roots to Add: ${ADD_ROOTS_PARAMS.rootDataArray.length}`)
    ADD_ROOTS_PARAMS.rootDataArray.forEach((root, i) => {
      console.log(`     [${i}] CID: ${root.cid.toString().substring(0, 20)}... (size: ${root.rawSize})`)
    })

    const addRootsSig = await synapse.signAddRoots(
      ADD_ROOTS_PARAMS.clientDataSetId,
      ADD_ROOTS_PARAMS.firstRootId,
      ADD_ROOTS_PARAMS.rootDataArray
    )

    console.log(`   Signature (hex): ${addRootsSig.signature}`)
    console.log(`   Auth Blob (hex): 0x${Buffer.from(addRootsSig.signature.slice(2), 'hex').toString('hex')}`)
    console.log(`   Encoded Data: ${addRootsSig.signedData}`)
    console.log()

    // 3. ScheduleRemovals
    console.log('3. ScheduleRemovals')
    console.log(`   Client Dataset ID: ${SCHEDULE_REMOVALS_PARAMS.clientDataSetId}`)
    console.log(`   Root IDs to Remove: [${SCHEDULE_REMOVALS_PARAMS.rootIds.join(', ')}]`)

    const removalsSig = await synapse.signScheduleRemovals(
      SCHEDULE_REMOVALS_PARAMS.clientDataSetId,
      SCHEDULE_REMOVALS_PARAMS.rootIds
    )

    console.log(`   Signature (hex): ${removalsSig.signature}`)
    console.log(`   Auth Blob (hex): 0x${Buffer.from(removalsSig.signature.slice(2), 'hex').toString('hex')}`)
    console.log(`   Encoded Data: ${removalsSig.signedData}`)
    console.log()

    // 4. DeleteProofSet
    console.log('4. DeleteProofSet')
    console.log(`   Client Dataset ID: ${DELETE_PROOF_SET_PARAMS.clientDataSetId}`)

    const deleteSig = await synapse.signDeleteProofSet(
      DELETE_PROOF_SET_PARAMS.clientDataSetId
    )

    console.log(`   Signature (hex): ${deleteSig.signature}`)
    console.log(`   Auth Blob (hex): 0x${Buffer.from(deleteSig.signature.slice(2), 'hex').toString('hex')}`)
    console.log(`   Encoded Data: ${deleteSig.signedData}`)
    console.log()

    console.log('Signature Components:')
    console.log('====================')
    console.log('(These can be used for manual contract verification)\n')

    // Show v,r,s components for one example
    console.log('CreateProofSet signature components:')
    console.log(`   v: ${createSig.v}`)
    console.log(`   r: ${createSig.r}`)
    console.log(`   s: ${createSig.s}`)
    console.log()

    console.log('✅ Done! Edit the parameters at the top of this script to generate different signatures.')
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.cause) {
      console.error('   Caused by:', error.cause.message)
    }
    process.exit(1)
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
