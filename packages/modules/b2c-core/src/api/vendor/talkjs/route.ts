import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'

import { fetchSellerByAuthContext } from '../../../shared/infra/http/utils'

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const { VITE_TALK_JS_APP_ID, VITE_TALK_JS_SECRET_API_KEY } = process.env

  const appMetadata = req.auth_context?.app_metadata;
  console.log('[TalkJS Route] Fetching seller with app_metadata:', appMetadata);
  const seller = await fetchSellerByAuthContext(
    appMetadata,
    req.scope
  )

  try {
    const response = await fetch(
      `https://api.talkjs.com/v1/${VITE_TALK_JS_APP_ID}/users/${seller.id}/conversations`,
      {
        headers: {
          Authorization: `Bearer ${VITE_TALK_JS_SECRET_API_KEY}`
        }
      }
    )

    if (![200, 404].includes(response.status)) {
      throw new Error(`Response ${response.status}`)
    }

    const { data } = await response.json()
    res.json({ conversations: response.status === 200 ? data : [] })
  } catch (e: any) {
    logger.error(`TalkJS error: ${e.message}`)
    res.status(500).json({ message: 'TalkJS error!' })
  }
}
