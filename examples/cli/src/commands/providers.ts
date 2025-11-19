import * as p from '@clack/prompts'
import { calibration, mainnet } from '@filoz/synapse-core/chains'
import { RPC_URLS } from '@filoz/synapse-sdk'
import {
  type ProviderInfo,
  SPRegistryService,
} from '@filoz/synapse-sdk/sp-registry'
import { type Command, command } from 'cleye'
import { ethers } from 'ethers'

type NetworkOption = 'mainnet' | 'calibration'

function getNetwork(flags: {
  mainnet?: boolean
  network?: string
}): NetworkOption {
  if (flags.mainnet) {
    return 'mainnet'
  }
  if (flags.network === 'mainnet' || flags.network === 'calibration') {
    return flags.network
  }
  return 'calibration'
}

function getChain(network: NetworkOption) {
  return network === 'mainnet' ? mainnet : calibration
}

function getRpcUrl(network: NetworkOption) {
  return RPC_URLS[network].http
}

function formatProviderInfo(provider: ProviderInfo) {
  const pdp = provider.products?.PDP
  const pdpInfo = pdp
    ? `
  PDP Service:
    URL: ${pdp.data.serviceURL}
    Min Piece Size: ${pdp.data.minPieceSizeInBytes.toString()}
    Max Piece Size: ${pdp.data.maxPieceSizeInBytes.toString()}
    Active: ${pdp.isActive ? 'Yes' : 'No'}
    Capabilities: ${Object.keys(pdp.capabilities).length > 0 ? JSON.stringify(pdp.capabilities, null, 2) : 'None'}`
    : '  PDP Service: Not available'

  return `Provider #${provider.id}
  Name: ${provider.name}
  Description: ${provider.description}
  Service Provider: ${provider.serviceProvider}
  Payee: ${provider.payee}
  Active: ${provider.active ? 'Yes' : 'No'}${pdpInfo}`
}

export const providers: Command = command(
  {
    name: 'providers',
    description: 'List and view provider information',
    alias: 'p',
    parameters: ['<subcommand>', '[id]'],
    flags: {
      mainnet: {
        type: Boolean,
        description: 'Use Filecoin mainnet',
      },
      network: {
        type: String,
        description: 'Network to use (mainnet or calibration)',
      },
      all: {
        type: Boolean,
        description: 'Show all providers, including inactive ones',
        default: false,
      },
      'provider-id': {
        type: Number,
        description: 'Provider ID (for show subcommand)',
      },
    },
    help: {
      description: 'List and view provider information',
      examples: [
        'synapse providers list',
        'synapse providers list --all',
        'synapse providers show 1',
        'synapse providers show 1 --mainnet',
        'synapse providers list --network calibration',
      ],
    },
  },
  async (argv) => {
    const subcommand = argv._.subcommand
    const providerId = argv._.id ? Number(argv._.id) : argv.flags['provider-id']

    if (subcommand === 'show' && providerId == null) {
      p.log.error('Provider ID is required for show subcommand')
      p.outro('Usage: synapse providers show <id>')
      return
    }

    if (subcommand === 'show' && argv._.id && argv.flags['provider-id']) {
      p.log.error('Cannot use both positional ID and --provider-id flag')
      p.outro(
        'Use either: synapse providers show <id> or synapse providers show --provider-id <id>'
      )
      return
    }

    const network = getNetwork(argv.flags)
    const chain = getChain(network)
    const rpcUrl = getRpcUrl(network)

    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const registryAddress = chain.contracts.serviceProviderRegistry.address

    const spinner = p.spinner()

    try {
      const spRegistry = await SPRegistryService.create(
        provider,
        registryAddress
      )

      if (subcommand === 'list' || subcommand == null) {
        spinner.start('Fetching providers...')
        const allProviders = await spRegistry.getAllActiveProviders()
        spinner.stop()

        const providersToShow = argv.flags.all
          ? allProviders
          : allProviders.filter((p) => p.active)

        if (providersToShow.length === 0) {
          p.log.info('No providers found')
          return
        }

        p.log.info(
          `Found ${providersToShow.length} provider(s)${argv.flags.all ? '' : ' (active only)'}:`
        )
        console.log('')

        for (const provider of providersToShow) {
          const pdp = provider.products?.PDP
          const status = provider.active ? '✓' : '✗'
          const pdpStatus = pdp?.isActive ? '✓' : '✗'
          console.log(
            `${status} #${provider.id} - ${provider.name}${pdp ? ` (PDP: ${pdpStatus})` : ' (No PDP)'}`
          )
          console.log(`  ${provider.description}`)
          if (pdp) {
            console.log(`  Service URL: ${pdp.data.serviceURL}`)
          }
          console.log('')
        }
      } else if (subcommand === 'show') {
        if (providerId == null) {
          p.log.error('Provider ID is required')
          return
        }

        spinner.start(`Fetching provider #${providerId}...`)
        const provider = await spRegistry.getProvider(providerId)
        spinner.stop()

        if (provider == null) {
          p.log.error(`Provider #${providerId} not found`)
          return
        }

        console.log(formatProviderInfo(provider))
      } else {
        p.log.error(`Unknown subcommand: ${subcommand}`)
        p.outro('Available subcommands: list, show')
        return
      }
    } catch (error) {
      spinner.stop()
      p.log.error((error as Error).message)
      p.outro('Failed to fetch providers')
      return
    }
  }
)
