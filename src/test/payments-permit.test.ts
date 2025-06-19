/* globals describe it beforeEach */
import { assert } from 'chai'
import { ethers } from 'ethers'
import { PaymentsService } from '../payments/service.js'
import { TOKENS, CONTRACT_ADDRESSES } from '../utils/constants.js'

describe('PaymentsService - Permit Functionality', () => {
  let paymentsService: PaymentsService
  let mockProvider: any
  let mockSigner: any

  beforeEach(() => {
    // Mock provider
    mockProvider = {
      getNetwork: async () => ({ chainId: 314159n }),
      getTransactionCount: async () => 0
    }

    // Mock signer
    mockSigner = {
      getAddress: async () => '0x1234567890123456789012345678901234567890',
      signTypedData: async () => '0x' + '11'.repeat(32) + '22'.repeat(32) + '1b',
      provider: mockProvider
    }

    // Create PaymentsService instance
    paymentsService = new PaymentsService(mockProvider, mockSigner, 'calibration', false)
  })

  describe('depositWithPermit', () => {
    it('should reject non-USDFC tokens', async () => {
      try {
        await paymentsService.depositWithPermit(
          ethers.parseUnits('100', 18),
          TOKENS.FIL
        )
        assert.fail('Should have thrown error')
      } catch (error: any) {
        assert.include(error.message, 'not supported')
      }
    })

    it('should reject zero or negative amounts', async () => {
      // Mock contracts to avoid actual calls
      const originalGetUsdfcContract = (paymentsService as any)._getUsdfcContract
      ;(paymentsService as any)._getUsdfcContract = () => ({
        name: async () => 'USD for Filecoin Community',
        nonces: async () => 0n
      })

      try {
        await (paymentsService as any)._generatePermit(0n, TOKENS.USDFC, 30)
        assert.fail('Should have thrown error')
      } catch (error: any) {
        assert.include(error.message, 'must be positive')
      }

      // Restore
      ;(paymentsService as any)._getUsdfcContract = originalGetUsdfcContract
    })

    it('should generate permit with correct deadline', async () => {
      // Mock contracts
      const originalGetUsdfcContract = (paymentsService as any)._getUsdfcContract
      ;(paymentsService as any)._getUsdfcContract = () => ({
        name: async () => 'USD for Filecoin Community',
        nonces: async () => 0n
      })

      const amount = ethers.parseUnits('100', 18)
      const deadlineMinutes = 30

      const permitContext = await (paymentsService as any)._generatePermit(
        amount,
        TOKENS.USDFC,
        deadlineMinutes
      )

      // Check deadline is approximately 30 minutes from now
      const expectedDeadline = BigInt(Math.floor(Date.now() / 1000) + (30 * 60))
      const actualDeadline = permitContext.permitData.deadline
      const difference = actualDeadline > expectedDeadline ? actualDeadline - expectedDeadline : expectedDeadline - actualDeadline

      assert.isTrue(difference < 5n) // Allow 5 seconds tolerance
      assert.equal(permitContext.permitData.owner, '0x1234567890123456789012345678901234567890')
      assert.equal(permitContext.permitData.spender, CONTRACT_ADDRESSES.PAYMENTS.calibration)
      assert.equal(permitContext.permitData.value, amount)
      assert.equal(permitContext.domain.name, 'USD for Filecoin Community')
      assert.equal(permitContext.domain.chainId, 314159)

      // Restore
      ;(paymentsService as any)._getUsdfcContract = originalGetUsdfcContract
    })

    it('should handle user rejection during signing', async () => {
      const rejectingSigner = {
        ...mockSigner,
        signTypedData: async () => {
          const error = new Error('User rejected') as any
          error.code = 'ACTION_REJECTED'
          throw error
        }
      }

      const rejectingService = new PaymentsService(mockProvider, rejectingSigner, 'calibration', false)

      // Mock contracts
      const originalGetUsdfcContract = (rejectingService as any)._getUsdfcContract
      ;(rejectingService as any)._getUsdfcContract = () => ({
        name: async () => 'USD for Filecoin Community',
        nonces: async () => 0n,
        balanceOf: async () => ethers.parseUnits('1000', 18)
      })

      const originalGetPaymentsContract = (rejectingService as any)._getPaymentsContract
      ;(rejectingService as any)._getPaymentsContract = () => ({})

      try {
        await rejectingService.depositWithPermit(ethers.parseUnits('100', 18), TOKENS.USDFC)
        assert.fail('Should have thrown error')
      } catch (error: any) {
        assert.include(error.message, 'rejected')
      }

      // Restore
      ;(rejectingService as any)._getUsdfcContract = originalGetUsdfcContract
      ;(rejectingService as any)._getPaymentsContract = originalGetPaymentsContract
    })

    it('should validate permit expiration', async () => {
      // Mock contracts
      const originalGetUsdfcContract = (paymentsService as any)._getUsdfcContract
      ;(paymentsService as any)._getUsdfcContract = () => ({
        balanceOf: async () => ethers.parseUnits('1000', 18)
      })

      const expiredPermit = {
        owner: '0x1234567890123456789012345678901234567890',
        spender: CONTRACT_ADDRESSES.PAYMENTS.calibration,
        value: ethers.parseUnits('100', 18),
        nonce: 0n,
        deadline: BigInt(Math.floor(Date.now() / 1000) - 100), // Expired
        v: 27,
        r: '0x' + '11'.repeat(32),
        s: '0x' + '22'.repeat(32)
      }

      try {
        await (paymentsService as any)._executeDepositWithPermit(
          ethers.parseUnits('100', 18),
          expiredPermit,
          TOKENS.USDFC
        )
        assert.fail('Should have thrown error')
      } catch (error: any) {
        assert.include(error.message, 'Permit expired')
      }

      // Restore
      ;(paymentsService as any)._getUsdfcContract = originalGetUsdfcContract
    })
  })
})
