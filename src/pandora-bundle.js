// Pandora Admin Portal bundle - includes all dependencies for browser use
import { ethers } from 'ethers'
import * as SynapseSDK from '@filoz/synapse-sdk'
import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'

// Export to window object
window.ethers = ethers
window.SynapseSDK = SynapseSDK
window.Reown = {
  createAppKit,
  EthersAdapter
}

console.log('Pandora bundle loaded: ethers, SynapseSDK, Reown AppKit')