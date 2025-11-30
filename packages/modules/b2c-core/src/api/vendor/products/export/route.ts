import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework'

import { fetchSellerByAuthContext } from '../../../../shared/infra/http/utils'
import { exportSellerProductsWorkflow } from '../../../../workflows/seller/workflows'

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const appMetadata = req.auth_context?.app_metadata;
  console.log('[Products Export Route] Fetching seller with app_metadata:', appMetadata);
  const seller = await fetchSellerByAuthContext(
    appMetadata,
    req.scope
  )

  const { result: fileData } = await exportSellerProductsWorkflow.run({
    container: req.scope,
    input: seller.id
  })

  res.json({
    url: fileData.url
  })
}
