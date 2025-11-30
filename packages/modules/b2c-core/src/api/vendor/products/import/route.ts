import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework'
import { MedusaError } from '@medusajs/framework/utils'

import { fetchSellerByAuthContext } from '../../../../shared/infra/http/utils'
import { importSellerProductsWorkflow } from '../../../../workflows/seller/workflows'

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const input = (req as any).file

  if (!input) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'No file was uploaded for importing'
    )
  }

  const appMetadata = req.auth_context?.app_metadata;
  console.log('[Products Import Route] Fetching seller with app_metadata:', appMetadata);
  const seller = await fetchSellerByAuthContext(
    appMetadata,
    req.scope
  )

  const { result: products } = await importSellerProductsWorkflow.run({
    container: req.scope,
    input: {
      file_content: input.buffer.toString('utf-8'),
      seller_id: seller.id,
      submitter_id: req.auth_context.actor_id
    }
  })

  res.status(201).json({ products })
}
