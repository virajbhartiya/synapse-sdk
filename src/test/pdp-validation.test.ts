/* globals describe it */
import { assert } from 'chai'
import {
  isProofSetCreationStatusResponse,
  isRootAdditionStatusResponse,
  isFindPieceResponse,
  validateProofSetCreationStatusResponse,
  validateRootAdditionStatusResponse,
  validateFindPieceResponse,
  isProofSetRootData,
  isProofSetData,
  validateProofSetData
} from '../pdp/validation.js'

describe('PDP Validation', function () {
  describe('ProofSetCreationStatusResponse validation', function () {
    it('should validate a valid response', function () {
      const validResponse = {
        createMessageHash: '0x123abc',
        proofSetCreated: true,
        service: 'pandora',
        txStatus: 'confirmed',
        ok: true,
        proofSetId: 123
      }

      assert.isTrue(isProofSetCreationStatusResponse(validResponse))
      assert.deepEqual(
        validateProofSetCreationStatusResponse(validResponse),
        validResponse
      )
    })

    it('should validate response with null ok field', function () {
      const validResponse = {
        createMessageHash: '0x123abc',
        proofSetCreated: false,
        service: 'pandora',
        txStatus: 'pending',
        ok: null
      }

      assert.isTrue(isProofSetCreationStatusResponse(validResponse))
      assert.deepEqual(
        validateProofSetCreationStatusResponse(validResponse),
        validResponse
      )
    })

    it('should reject invalid responses', function () {
      const invalidResponses = [
        null,
        undefined,
        'string',
        123,
        [],
        {}, // Empty object
        { createMessageHash: 123 }, // Wrong type
        { createMessageHash: '0x123', proofSetCreated: 'yes' }, // Wrong type
        {
          createMessageHash: '0x123',
          proofSetCreated: true,
          service: 'pandora',
          txStatus: 'pending'
          // Missing ok field
        },
        {
          createMessageHash: '0x123',
          proofSetCreated: true,
          service: 'pandora',
          txStatus: 'pending',
          ok: null,
          proofSetId: 'abc' // Wrong type
        }
      ]

      for (const invalid of invalidResponses) {
        assert.isFalse(isProofSetCreationStatusResponse(invalid))
        assert.throws(() => validateProofSetCreationStatusResponse(invalid))
      }
    })
  })

  describe('RootAdditionStatusResponse validation', function () {
    it('should validate a valid response', function () {
      const validResponse = {
        txHash: '0x456def',
        txStatus: 'confirmed',
        proofSetId: 123,
        rootCount: 5,
        addMessageOk: true,
        confirmedRootIds: [1, 2, 3, 4, 5]
      }

      assert.isTrue(isRootAdditionStatusResponse(validResponse))
      assert.deepEqual(
        validateRootAdditionStatusResponse(validResponse),
        validResponse
      )
    })

    it('should validate response with null addMessageOk', function () {
      const validResponse = {
        txHash: '0x456def',
        txStatus: 'pending',
        proofSetId: 123,
        rootCount: 5,
        addMessageOk: null
      }

      assert.isTrue(isRootAdditionStatusResponse(validResponse))
      assert.deepEqual(
        validateRootAdditionStatusResponse(validResponse),
        validResponse
      )
    })

    it('should reject invalid responses', function () {
      const invalidResponses = [
        null,
        undefined,
        {
          txHash: '0x456def',
          txStatus: 'pending',
          proofSetId: '123', // Wrong type
          rootCount: 5,
          addMessageOk: null
        },
        {
          txHash: '0x456def',
          txStatus: 'pending',
          proofSetId: 123,
          rootCount: 5,
          addMessageOk: null,
          confirmedRootIds: 'not-array' // Wrong type
        },
        {
          txHash: '0x456def',
          txStatus: 'pending',
          proofSetId: 123,
          rootCount: 5,
          addMessageOk: null,
          confirmedRootIds: [1, 2, 'three'] // Wrong element type
        }
      ]

      for (const invalid of invalidResponses) {
        assert.isFalse(isRootAdditionStatusResponse(invalid))
        assert.throws(() => validateRootAdditionStatusResponse(invalid))
      }
    })
  })

  describe('FindPieceResponse validation', function () {
    it('should validate response with legacy piece_cid field', function () {
      const validResponse = {
        piece_cid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq'
      }

      assert.isTrue(isFindPieceResponse(validResponse))
      const normalized = validateFindPieceResponse(validResponse)
      assert.equal(normalized.pieceCid.toString(), validResponse.piece_cid)
      assert.equal(normalized.piece_cid, validResponse.piece_cid)
    })

    it('should validate response with new pieceCid field', function () {
      const validResponse = {
        pieceCid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq'
      }

      assert.isTrue(isFindPieceResponse(validResponse))
      const normalized = validateFindPieceResponse(validResponse)
      assert.equal(normalized.pieceCid.toString(), validResponse.pieceCid)
      assert.isUndefined(normalized.piece_cid) // No legacy field in this case
    })

    it('should validate response with both fields', function () {
      const validResponse = {
        pieceCid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq',
        piece_cid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq'
      }

      assert.isTrue(isFindPieceResponse(validResponse))
      const normalized = validateFindPieceResponse(validResponse)
      assert.equal(normalized.pieceCid.toString(), validResponse.pieceCid)
      assert.equal(normalized.piece_cid, validResponse.piece_cid) // Legacy field preserved
    })

    it('should reject invalid responses', function () {
      const invalidResponses = [
        null,
        undefined,
        'string',
        123,
        [],
        {},
        { piece_cid: 123 }, // Wrong type
        { pieceCid: 123 }, // Wrong type
        { randomField: 'baga...' }, // Wrong field name
        { piece_cid: null }, // Null value
        { pieceCid: null }, // Null value
        { pieceCid: 'not-a-commp' }, // Invalid CommP
        { piece_cid: 'QmTest123' }, // Not a CommP (wrong codec)
        { pieceCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' } // Not a CommP (wrong multihash)
      ]

      for (const invalid of invalidResponses) {
        assert.isFalse(isFindPieceResponse(invalid))
        assert.throws(() => validateFindPieceResponse(invalid))
      }
    })

    it('should throw specific error for invalid CommP', function () {
      const invalidCommPResponse = {
        pieceCid: 'not-a-valid-commp'
      }

      assert.throws(
        () => validateFindPieceResponse(invalidCommPResponse),
        Error,
        'Invalid find piece response: pieceCid is not a valid CommP'
      )
    })

    it('should return a proper CommP CID object', function () {
      const validResponse = {
        pieceCid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq'
      }

      const normalized = validateFindPieceResponse(validResponse)

      // Verify it's a CID object with the correct properties
      assert.equal(normalized.pieceCid.code, 0xf101) // fil-commitment-unsealed
      assert.equal(normalized.pieceCid.multihash.code, 0x1012) // sha2-256-trunc254-padded
      assert.equal(normalized.pieceCid.toString(), validResponse.pieceCid)
    })
  })

  describe('ProofSetRootData validation', function () {
    it('should validate a valid root data object', function () {
      const validRootData = {
        rootId: 101,
        rootCid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq',
        subrootCid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq',
        subrootOffset: 0
      }

      assert.isTrue(isProofSetRootData(validRootData))
    })

    it('should reject invalid root data objects', function () {
      const invalidRootData = [
        null,
        undefined,
        'string',
        123,
        [],
        {},
        { rootId: '101' }, // Wrong type
        { rootId: 101, rootCid: 123 }, // Wrong type
        { rootId: 101, rootCid: 'invalid-cid' }, // Invalid CommP
        {
          rootId: 101,
          rootCid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq',
          subrootCid: 'invalid-cid' // Invalid CommP
        },
        {
          rootId: 101,
          rootCid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq',
          subrootCid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq',
          subrootOffset: 'zero' // Wrong type
        }
      ]

      for (const invalid of invalidRootData) {
        assert.isFalse(isProofSetRootData(invalid))
      }
    })
  })

  describe('ProofSetData validation', function () {
    it('should validate a valid proof set data object', function () {
      const validProofSetData = {
        id: 292,
        roots: [
          {
            rootId: 101,
            rootCid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq',
            subrootCid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq',
            subrootOffset: 0
          },
          {
            rootId: 102,
            rootCid: 'baga6ea4seaqkt24j5gbf2ye2wual5gn7a5yl2tqb52v2sk4nvur4bdy7lg76cdy',
            subrootCid: 'baga6ea4seaqkt24j5gbf2ye2wual5gn7a5yl2tqb52v2sk4nvur4bdy7lg76cdy',
            subrootOffset: 0
          }
        ],
        nextChallengeEpoch: 1500
      }

      assert.isTrue(isProofSetData(validProofSetData))
      assert.deepEqual(
        validateProofSetData(validProofSetData),
        validProofSetData
      )
    })

    it('should validate proof set data with empty roots array', function () {
      const validProofSetData = {
        id: 292,
        roots: [],
        nextChallengeEpoch: 1500
      }

      assert.isTrue(isProofSetData(validProofSetData))
      assert.deepEqual(
        validateProofSetData(validProofSetData),
        validProofSetData
      )
    })

    it('should reject invalid proof set data objects', function () {
      const invalidProofSetData = [
        null,
        undefined,
        'string',
        123,
        [],
        {},
        { id: '292' }, // Wrong type
        { id: 292, roots: 'not-array' }, // Wrong type
        { id: 292, roots: [], nextChallengeEpoch: 'soon' }, // Wrong type
        {
          id: 292,
          roots: [
            {
              rootId: 101,
              rootCid: 'invalid-cid', // Invalid CommP
              subrootCid: 'baga6ea4seaqh5lmkfwaovjuigyp4hzclc6hqnhoqcm3re3ipumhp3kfka7wdvjq',
              subrootOffset: 0
            }
          ],
          nextChallengeEpoch: 1500
        }
      ]

      for (const invalid of invalidProofSetData) {
        assert.isFalse(isProofSetData(invalid))
        assert.throws(() => validateProofSetData(invalid))
      }
    })

    it('should throw specific error for invalid proof set data', function () {
      const invalidProofSetData = {
        id: 292,
        roots: 'not-an-array',
        nextChallengeEpoch: 1500
      }

      assert.throws(
        () => validateProofSetData(invalidProofSetData),
        Error,
        'Invalid proof set data response format'
      )
    })
  })
})
