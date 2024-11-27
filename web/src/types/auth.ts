import type { JwtPayload } from 'jwt-decode'

export interface AccessToken extends JwtPayload{
  user_id: string
}
