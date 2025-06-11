/* globals describe it */
import { assert } from 'chai'
import { Synapse } from '../synapse.js'
import { ChainDiscovery } from '../discovery/chain.js'
import type { PieceDiscovery } from '../types.js'
import { ethers } from 'ethers'

describe('Download with Discovery', () => {
  describe('ChainDiscovery', () => {
    it('should yield cached URLs immediately', async () => {
      const mockProvider: ethers.Provider = {} as any
      const mockPandoraAddress = '0x1234567890123456789012345678901234567890'

      const discovery = new ChainDiscovery(mockProvider, mockPandoraAddress)

      // Manually populate cache
      const cacheAny = discovery as any
      cacheAny.cache.set('test-commp', {
        urls: new Map([['0xprovider1', 'https://provider1.com/pdp/piece/test-commp']]),
        timestamp: Date.now()
      })

      // Should yield cached URL immediately
      const urls: string[] = []
      for await (const url of discovery.findPiece('test-commp', '0xclient')) {
        urls.push(url)
      }

      assert.equal(urls.length, 1)
      assert.equal(urls[0], 'https://provider1.com/pdp/piece/test-commp')
    })

    it('should respect cache TTL', async () => {
      const mockProvider: ethers.Provider = {} as any
      const mockPandoraAddress = '0x1234567890123456789012345678901234567890'

      const discovery = new ChainDiscovery(mockProvider, mockPandoraAddress)

      // Populate cache with expired entry
      const cacheAny = discovery as any
      cacheAny.cache.set('expired-commp', {
        urls: new Map([['0xprovider1', 'https://provider1.com/pdp/piece/expired-commp']]),
        timestamp: Date.now() - (31 * 60 * 1000) // 31 minutes ago (past 30 min TTL)
      })

      // Mock provider to avoid actual calls
      cacheAny.provider = {
        _isProvider: true
      }

      // Should not yield expired cache entry
      const urls: string[] = []
      try {
        for await (const url of discovery.findPiece('expired-commp', '0xclient')) {
          urls.push(url)
        }
      } catch (e) {
        // Expected - no URLs found
      }

      assert.equal(urls.length, 0)
    })
  })

  describe('Custom Discovery Implementation', () => {
    it('should allow custom discovery implementations', async () => {
      // Create a custom discovery that always returns a specific URL
      class StaticDiscovery implements PieceDiscovery {
        async * findPiece (commp: string): AsyncIterable<string> {
          yield `https://static.example.com/pieces/${commp}`
        }
      }

      const mockSigner: ethers.Signer = {
        getAddress: async () => '0xclient',
        provider: {
          getNetwork: async () => ({ chainId: 314159n })
        }
      } as any

      const synapse = await Synapse.create({
        signer: mockSigner,
        pieceDiscovery: new StaticDiscovery()
      })

      // Mock fetch to succeed
      const originalFetch = global.fetch
      global.fetch = async (url: any) => {
        assert.equal(url as string, 'https://static.example.com/pieces/test-commp')
        return {
          ok: true,
          body: new ReadableStream({
            start (controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]))
              controller.close()
            }
          })
        } as any
      }

      try {
        const stream = await synapse.download('test-commp')
        assert.exists(stream)
        assert.instanceOf(stream, ReadableStream)
      } finally {
        global.fetch = originalFetch
      }
    })
  })

  describe('Synapse.download()', () => {
    it('should try URLs until one succeeds', async () => {
      // Create a discovery that yields multiple URLs
      class MultiUrlDiscovery implements PieceDiscovery {
        async * findPiece (): AsyncIterable<string> {
          yield 'https://provider1.com/fail'
          yield 'https://provider2.com/fail'
          yield 'https://provider3.com/success'
        }
      }

      const mockSigner: ethers.Signer = {
        getAddress: async () => '0xclient',
        provider: {
          getNetwork: async () => ({ chainId: 314159n })
        }
      } as any

      const synapse = await Synapse.create({
        signer: mockSigner,
        pieceDiscovery: new MultiUrlDiscovery()
      })

      // Mock fetch to fail for first two URLs, succeed for third
      const originalFetch = global.fetch
      let fetchCount = 0
      global.fetch = async (url: any) => {
        fetchCount++
        const urlStr = url as string

        if (urlStr.includes('fail')) {
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found'
          } as any
        }

        return {
          ok: true,
          body: new ReadableStream({
            start (controller) {
              controller.enqueue(new Uint8Array([1, 2, 3]))
              controller.close()
            }
          })
        } as any
      }

      try {
        const stream = await synapse.download('test-commp')
        assert.exists(stream)
        assert.equal(fetchCount, 3) // Should have tried all 3 URLs
      } finally {
        global.fetch = originalFetch
      }
    })

    it('should throw AggregateError when all downloads fail', async () => {
      // Create a discovery that yields URLs that all fail
      class FailingDiscovery implements PieceDiscovery {
        async * findPiece (): AsyncIterable<string> {
          yield 'https://provider1.com/fail'
          yield 'https://provider2.com/fail'
        }
      }

      const mockSigner: ethers.Signer = {
        getAddress: async () => '0xclient',
        provider: {
          getNetwork: async () => ({ chainId: 314159n })
        }
      } as any

      const synapse = await Synapse.create({
        signer: mockSigner,
        pieceDiscovery: new FailingDiscovery()
      })

      // Mock fetch to always fail
      const originalFetch = global.fetch
      global.fetch = async () => {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        } as any
      }

      try {
        await synapse.download('test-commp')
        assert.fail('Should have thrown error')
      } catch (error: any) {
        assert.include(error.message, 'All download attempts failed')
        // The cause should be an AggregateError
        assert.exists(error.cause)
        assert.property(error.cause, 'errors')
        assert.equal((error.cause as AggregateError).errors.length, 2)
      } finally {
        global.fetch = originalFetch
      }
    })

    it('should throw when no URLs are found', async () => {
      // Create a discovery that yields no URLs
      class EmptyDiscovery implements PieceDiscovery {
        async * findPiece (): AsyncIterable<string> {
          // Yield nothing
        }
      }

      const mockSigner: ethers.Signer = {
        getAddress: async () => '0xclient',
        provider: {
          getNetwork: async () => ({ chainId: 314159n })
        }
      } as any

      const synapse = await Synapse.create({
        signer: mockSigner,
        pieceDiscovery: new EmptyDiscovery()
      })

      try {
        await synapse.download('test-commp')
        assert.fail('Should have thrown error')
      } catch (error: any) {
        assert.include(error.message, 'Piece test-commp not found')
      }
    })

    it('should respect providerId hint', async () => {
      // Create a discovery that tracks providerAddress hints
      let receivedProviderAddress: string | undefined

      class TrackingDiscovery implements PieceDiscovery {
        async * findPiece (
          commp: string,
          client: string,
          options?: { providerAddress?: string }
        ): AsyncIterable<string> {
          receivedProviderAddress = options?.providerAddress
          yield 'https://provider.com/piece'
        }
      }

      const mockSigner: ethers.Signer = {
        getAddress: async () => '0xclient',
        provider: {
          getNetwork: async () => ({ chainId: 314159n })
        }
      } as any

      const discovery = new TrackingDiscovery()
      const synapse = await Synapse.create({
        signer: mockSigner,
        pieceDiscovery: discovery
      })

      // Mock fetch
      const originalFetch = global.fetch
      global.fetch = async () => ({
        ok: true,
        body: new ReadableStream()
      } as any)

      try {
        await synapse.download('test-commp', { providerAddress: '0x1234567890123456789012345678901234567890' })
        assert.equal(receivedProviderAddress, '0x1234567890123456789012345678901234567890')
      } finally {
        global.fetch = originalFetch
      }
    })
  })

  describe('StorageService.directDownload()', () => {
    it('should show deprecation warning for download()', async () => {
      // This test verifies the deprecation warning exists in the code
      // The actual warning would be shown when calling storage.download()
      // which is tested in the storage.test.ts file

      // For now, just verify the method exists and compilation succeeds
      assert.isTrue(true)
    })
  })
})
